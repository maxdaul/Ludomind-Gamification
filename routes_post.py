from database import utc_naive, commit_checked, validate_period, validate_assignment, task_reason, reward_task_id, adjust_task_score, analyze_for_api, create_validated_task, SYSTEM_STATUSES
from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from passlib.context import CryptContext
from datetime import datetime
import logging
import re
from ml.ai_analyzer import analyze_task, YandexRateLimitError, YandexAPIError

from db import get_db
from database import require_employee_access, restrict_user_ids
from database import (
    User, TaskStatus, Tag, TaskTag, Task, RewardType, Reward, Competition, Participant
)
from schemas import (
    UserCreate, UserResponse, Token, UserLogin,
    TaskStatusCreate, TaskStatusResponse,
    TagCreate, TagResponse,
    TaskCreate, TaskResponse,
    RewardTypeCreate, RewardTypeResponse,
    RewardCreate, RewardResponse,
    TaskTagCreate, CompetitionCreate,
    CompetitionResponse, ParticipantCreate, ParticipantResponse,
    MoodleEnrolRequest,
)
from auth import verify_password, get_password_hash, create_access_token
from dependencies import get_current_user, require_admin, require_manager
from moodle_api import (
    MoodleAPIError,
    enrol_user_in_moodle_course,
    can_moodle_user_enrol,
    list_moodle_courses,
    list_moodle_user_courses,
    moodle_sync_enabled,
    register_user_in_moodle,
)
from mail_yc_function import schedule_task_assigned_email

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

logger = logging.getLogger(__name__)

router = APIRouter()

# Регистрация пользователя
@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def register(user: UserCreate, db: Session = Depends(get_db)):
    # Проверка на уникальность email
    if db.query(User).filter(User.email == user.email).first():
        raise HTTPException(
            status_code=400, detail="Пользователь с таким email уже существует"
        )
    if db.query(User).filter(User.username == user.username).first():
        raise HTTPException(
            status_code=400, detail="Пользователь с таким именем пользователя уже существует"
        )
    # Шифрование пароля
    hashed_password = get_password_hash(user.password)
    db_user = User(
        first_name=user.first_name,
        last_name=user.last_name,
        username=user.username,
        email=user.email,
        password_hash=hashed_password,
        role="user"
    )
    # Запись в бд
    try:
        db.add(db_user)
        db.commit()
        db.refresh(db_user)
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=400,
            detail="Пользователь с таким email или именем пользователя уже существует",
        ) from None

    if moodle_sync_enabled():
        try:
            moodle_id = register_user_in_moodle(
                username=user.username,
                email=str(user.email),
                password=user.password,
                first_name=user.first_name,
                last_name=user.last_name,
            )
            if moodle_id is not None:
                db_user.moodle_id = moodle_id
                db.commit()
                db.refresh(db_user)
        except MoodleAPIError as e:
            db.delete(db_user)
            db.commit()
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Не удалось создать учётную запись в Moodle",
            ) from e

    return db_user


@router.post("/moodle/enrol", status_code=status.HTTP_204_NO_CONTENT)
def moodle_enrol_user(
    body: MoodleEnrolRequest,
    current_user: dict = Depends(require_manager),
    db: Session = Depends(get_db),
):
    """Зачисление выбранного пользователя (moodle_id) на курс Moodle (ручное зачисление)."""
    if not moodle_sync_enabled():
        raise HTTPException(
            status_code=503,
            detail="Интеграция с Moodle не настроена (MOODLE_WS_URL / MOODLE_WS_TOKEN)",
        )
    target = db.query(User).filter(User.id == body.user_id).first()
    if not target or target.role != "user":
        raise HTTPException(status_code=404, detail="Пользователь не найден")
    require_employee_access(current_user["user"], target)
    if target.moodle_id is None:
        raise HTTPException(
            status_code=400,
            detail="У пользователя нет учётной записи в Moodle (moodle_id). Зарегистрируйте его через систему.",
        )
    actor = current_user["user"]
    if actor.moodle_id is None:
        raise HTTPException(400, "Для зачисления у вас должна быть привязка к Moodle")
    try:
        if not any(course["id"] == body.course_id for course in list_moodle_courses(course_id=body.course_id)):
            raise HTTPException(404, "Курс Moodle недоступен для зачисления")
        if not can_moodle_user_enrol(actor.moodle_id, body.course_id):
            raise HTTPException(403, "У вашей учётной записи Moodle нет права зачислять на этот курс")
        if not any(course["id"] == body.course_id for course in list_moodle_user_courses(target.moodle_id)):
            enrol_user_in_moodle_course(moodle_user_id=target.moodle_id, course_id=body.course_id)
    except MoodleAPIError as error:
        if error.code in {"wsnoinstance", "manualpluginnotinstalled"}:
            raise HTTPException(409, "Для этого курса в Moodle отключено ручное зачисление") from None
        if error.code in {"wsusercannotassign", "nopermissions", "nopermission", "accessexception"}:
            raise HTTPException(403, "Учётная запись интеграции Moodle не может назначить роль учащегося на этом курсе") from None
        logger.warning("Moodle enrolment failed code=%s", error.code or "transport")
        raise HTTPException(502, "Moodle временно недоступен") from None
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/users", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def create_user(user: UserCreate, current_user: dict = Depends(require_admin), db: Session = Depends(get_db)):
    if db.query(User).filter(User.email == user.email).first():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Пользователь с таким email уже существует",
        )
    if db.query(User).filter(User.username == user.username).first():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Пользователь с таким именем пользователя уже существует",
        )
    hashed_password = pwd_context.hash(user.password[:72])
    db_user = User(
        first_name=user.first_name,
        last_name=user.last_name,
        username=user.username,
        email=user.email,
        password_hash=hashed_password
    )
    try:
        db.add(db_user)
        db.commit()
        db.refresh(db_user)
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Пользователь с таким email или именем пользователя уже существует"
        )
    return db_user

# Логин
@router.post("/login", response_model=Token)
def login(user: UserLogin, db: Session = Depends(get_db)):
    db_user = db.query(User).filter(User.email == user.email).first()
    # Если пользователя не существует, неправильная почта или пароль
    if not db_user or not verify_password(user.password, db_user.password_hash):
        raise HTTPException(
            status_code=401,
            detail="Неверный email или пароль",
            headers={"WWW-Authenticate": "Bearer"},
        )
    # Генерируем токен
    access_token = create_access_token(str(db_user.id), db_user.role, db_user.email)
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": {
            "id": str(db_user.id),
            "email": db_user.email,
            "username": db_user.username,
            "first_name": db_user.first_name,
            "last_name": db_user.last_name,
            "role": db_user.role
        }
    }

# @router.post("/boards", response_model=BoardResponse, status_code=status.HTTP_201_CREATED)
# def create_board(
#     board: BoardCreate,
#     current_user: dict = Depends(get_current_user),
#     db: Session = Depends(get_db)
# ):
#     db_board = Board(
#         user_id=current_user["user"].id,
#         name=board.name,
#         description=board.description
#     )
#     db.add(db_board)
#     db.commit()
#     db.refresh(db_board)
#     return db_board

# Создание статуса
@router.post("/task-statuses", response_model=TaskStatusResponse, status_code=status.HTTP_201_CREATED)
def create_task_status(
    status_data: TaskStatusCreate,
    current_user: dict = Depends(require_admin), # Только для админа
    db: Session = Depends(get_db)
):
    if db.query(TaskStatus).filter(TaskStatus.code == status_data.code).first():
        raise HTTPException(status_code=400, detail="TaskStatus с таким code уже существует")
    db_status = TaskStatus(code=status_data.code, name=status_data.name)
    db.add(db_status)
    db.commit()
    db.refresh(db_status)
    return db_status

# @router.post("/categories", response_model=CategoryResponse, status_code=status.HTTP_201_CREATED)
# def create_category(
#     category: CategoryCreate,
#     current_user: dict = Depends(get_current_user),
#     db: Session = Depends(get_db)
# ):
#     db_category = Category(
#         user_id=current_user["user"].id,
#         name=category.name,
#         color=category.color
#     )
#     db.add(db_category)
#     db.commit()
#     db.refresh(db_category)
#     return db_category

@router.post("/tags", response_model=TagResponse, status_code=status.HTTP_201_CREATED)
def create_tag(
    tag: TagCreate,
    current_user: dict = Depends(require_admin),
    db: Session = Depends(get_db)
):
    if db.query(Tag).filter(Tag.name == tag.name).first():
        raise HTTPException(status_code=400, detail="Tag с таким именем уже существует")
    db_tag = Tag(name=tag.name)
    db.add(db_tag)
    db.commit()
    db.refresh(db_tag)
    return db_tag


@router.post("/tasks", response_model=TaskResponse, status_code=status.HTTP_201_CREATED)
def create_task(
    task: TaskCreate,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    user = current_user["user"]
    if not user:
        raise HTTPException(404, "Пользователь не найден")
    db_task = create_validated_task(db, task, user, current_user["user"])
    task_status = db.query(TaskStatus).filter_by(id=db_task.status_id).first()
    due_str = db_task.due_date.strftime("%d.%m.%Y") if db_task.due_date else "—"
    schedule_task_assigned_email(user.email, db_task.title, due_str, task_status.name)
    return db_task

@router.post("/tasks/{user_id}", response_model=TaskResponse, status_code=status.HTTP_201_CREATED)
def create_task(
    user_id: int,
    task: TaskCreate,
    current_user: dict = Depends(require_manager),
    db: Session = Depends(get_db)
):
    user = db.query(User).filter_by(id=user_id).first()
    if not user:
        raise HTTPException(404, "Пользователь не найден")
    db_task = create_validated_task(db, task, user, current_user["user"])
    task_status = db.query(TaskStatus).filter_by(id=db_task.status_id).first()
    due_str = db_task.due_date.strftime("%d.%m.%Y") if db_task.due_date else "—"
    schedule_task_assigned_email(user.email, db_task.title, due_str, task_status.name)
    return db_task


@router.post("/task-tags", status_code=status.HTTP_201_CREATED)
def create_task_tag(
    task_tag: TaskTagCreate,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    query = restrict_user_ids(db.query(Task).filter(Task.id == task_tag.task_id), Task.user_id, current_user["user"], allow_self=True)
    task = query.first()
    if not task:
        raise HTTPException(status_code=404, detail="Task не найдена или не принадлежит пользователю")

    if not db.query(Tag).filter(Tag.id == task_tag.tag_id).first():
        raise HTTPException(status_code=404, detail="Tag не найден")

    existing = db.query(TaskTag).filter(
        TaskTag.task_id == task_tag.task_id,
        TaskTag.tag_id == task_tag.tag_id
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="Связь Task-Tag уже существует")

    db_task_tag = TaskTag(task_id=task_tag.task_id, tag_id=task_tag.tag_id)
    db.add(db_task_tag)
    db.commit()
    return {"message": "Tag успешно привязан к задаче"}

@router.post("/reward-types", response_model=RewardTypeResponse, status_code=status.HTTP_201_CREATED)
def create_reward_type(
    reward_type: RewardTypeCreate,
    current_user: dict = Depends(require_admin),
    db: Session = Depends(get_db)
):
    if db.query(RewardType).filter(RewardType.code == reward_type.code).first():
        raise HTTPException(status_code=400, detail="RewardType с таким code уже существует")
    db_rt = RewardType(
        code=reward_type.code,
        name=reward_type.name,
        description=reward_type.description
    )
    db.add(db_rt)
    db.commit()
    db.refresh(db_rt)
    return db_rt

@router.post("/rewards", response_model=RewardResponse, status_code=status.HTTP_201_CREATED)
def create_reward(reward: RewardCreate, current_user: dict = Depends(require_manager), db: Session = Depends(get_db)):
    if not db.query(RewardType).filter_by(id=reward.type_id).first():
        raise HTTPException(404, "Тип награды не найден")
    if reward_task_id(reward.reason) is not None or (reward.reason or "").startswith("Корректировка счёта соревнования"):
        raise HTTPException(400, "Системные награды создаются только при подтверждении задачи")
    target_id = reward.user_id or current_user["user"].id
    employee = db.get(User, target_id)
    if not employee:
        raise HTTPException(404, "Получатель награды не найден")
    require_employee_access(current_user["user"], employee)
    result = Reward(user_id=target_id, type_id=reward.type_id, points_amount=reward.points_amount, reason=reward.reason)
    db.add(result)
    commit_checked(db)
    db.refresh(result)
    return result

@router.post("/competitions", response_model=CompetitionResponse, status_code=status.HTTP_201_CREATED)
def create_competition(competition: CompetitionCreate, current_user: dict = Depends(require_manager), db: Session = Depends(get_db)):
    if db.query(Competition).filter_by(title=competition.title).first():
        raise HTTPException(400, "Соревнование с таким названием уже существует")
    start, end = validate_period(competition.start_date, competition.end_date)
    result = Competition(title=competition.title, start_date=start, end_date=end)
    db.add(result)
    commit_checked(db)
    db.refresh(result)
    return result

@router.post("/task", response_model=TaskResponse, status_code=status.HTTP_201_CREATED)
def create_task_single(
    task: TaskCreate,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    user = current_user["user"]
    if not user:
        raise HTTPException(404, "Пользователь не найден")
    db_task = create_validated_task(db, task, user, current_user["user"])
    task_status = db.query(TaskStatus).filter_by(id=db_task.status_id).first()
    due_str = db_task.due_date.strftime("%d.%m.%Y") if db_task.due_date else "—"
    schedule_task_assigned_email(user.email, db_task.title, due_str, task_status.name)
    return db_task

@router.post("/participants", response_model=ParticipantResponse, status_code=status.HTTP_201_CREATED)
def create_participant(participant: ParticipantCreate, current_user: dict = Depends(require_manager), db: Session = Depends(get_db)):
    competition = db.query(Competition).filter_by(id=participant.competition_id).with_for_update().first()
    if not competition:
        raise HTTPException(404, "Соревнование не найдено")
    user = db.query(User).filter_by(id=participant.user_id).first()
    if not user or user.role != "user":
        raise HTTPException(400, "Участником может быть только сотрудник с ролью user")
    require_employee_access(current_user["user"], user)
    if participant.score:
        raise HTTPException(400, "Начальный счёт участника должен быть нулевым")
    if db.query(Participant).filter_by(user_id=user.id, competition_id=competition.id).first():
        raise HTTPException(409, "Пользователь уже участвует в соревновании")
    result = Participant(user_id=user.id, competition_id=competition.id, score=0)
    db.add(result)
    commit_checked(db)
    db.refresh(result)
    return result
