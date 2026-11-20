from database import override_task_analysis, utc_naive, commit_checked, validate_period, validate_assignment, task_reason, reward_task_id, adjust_task_score, analyze_for_api, create_validated_task, SYSTEM_STATUSES
import re
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from datetime import datetime

from db import get_db
from database import require_employee_access, restrict_user_ids
from database import TaskStatus, Tag, Task, TaskTag, RewardType, Reward, User, Competition, Participant, Position, Department
from schemas import (
    TaskStatusUpdate, TaskStatusResponse,
    TagUpdate, TagResponse,
    TaskUpdate, TaskResponse,
    RewardTypeUpdate, RewardTypeResponse,
    RewardUpdate, RewardResponse,
    AdminUserUpdate, UserUpdate, UserResponse, CompetitionResponse, CompetitionUpdate,
    UserCompetitionAssign, ParticipantUpdate, ParticipantResponse
)
from dependencies import get_current_user, require_admin, require_manager
from auth import get_password_hash

router = APIRouter(prefix="", tags=["PUT"])

@router.put("/users/me", response_model=UserResponse)
def update_own_user(
    payload: UserUpdate,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    user: User = current_user["user"]

    if payload.first_name is not None:
        user.first_name = payload.first_name

    if payload.last_name is not None:
        user.last_name = payload.last_name

    if payload.email and payload.email != user.email:
        if db.query(User).filter(User.email == payload.email).first():
            raise HTTPException(status_code=400, detail="Пользователь с таким email уже существует")
        user.email = payload.email

    if payload.password:
        user.password_hash = get_password_hash(payload.password)

    commit_checked(db)
    db.refresh(user)
    return user

@router.put("/admin/users/{user_id}", response_model=UserResponse)
def update_user_by_admin(
    user_id: int,
    payload: AdminUserUpdate,
    current_user: dict = Depends(require_admin),
    db: Session = Depends(get_db)
):
    user = db.query(User).filter(User.id == user_id).with_for_update().first()
    if not user:
        raise HTTPException(status_code=404, detail="Пользователь не найден")

    if payload.first_name is not None:
        user.first_name = payload.first_name

    if payload.last_name is not None:
        user.last_name = payload.last_name

    if payload.email and payload.email != user.email:
        if db.query(User).filter(User.email == payload.email).first():
            raise HTTPException(status_code=400, detail="Пользователь с таким email уже существует")
        user.email = payload.email

    if payload.password:
        user.password_hash = get_password_hash(payload.password)

    if payload.role:
        if payload.role not in ['user', 'manager', 'admin']:
            raise HTTPException(status_code=400, detail="Недопустимая роль. Используйте 'user', 'manager' или 'admin'")
        if user.role == "manager" and payload.role != "manager":
            db.query(User).filter_by(manager_id=user.id).update({User.manager_id: None})
        user.role = payload.role

    if user.role != "user":
        if payload.manager_id is not None:
            raise HTTPException(400, "Менеджера можно назначить только сотруднику")
        user.manager_id = None
    elif "manager_id" in payload.model_fields_set:
        if payload.manager_id is not None:
            manager = db.query(User).filter_by(id=payload.manager_id, role="manager").with_for_update(read=True).first()
            if not manager or manager.id == user.id:
                raise HTTPException(400, "Выберите пользователя с ролью менеджера")
        user.manager_id = payload.manager_id

    for field, model, error in (
        ("position_id", Position, "Должность не найдена"),
        ("department_id", Department, "Подразделение не найдено"),
    ):
        if field in payload.model_fields_set:
            entry_id = getattr(payload, field)
            if entry_id is not None and db.get(model, entry_id) is None:
                raise HTTPException(404, error)
            setattr(user, field, entry_id)

    commit_checked(db)
    db.refresh(user)
    return user


# @router.put("/boards/{board_id}", response_model=BoardResponse)
# def update_board(
#     board_id: int,
#     update_data: BoardUpdate,
#     current_user: dict = Depends(get_current_user),
#     db: Session = Depends(get_db)
# ):
#     board = db.query(Board).filter(
#         Board.id == board_id,
#         Board.user_id == current_user["user"].id
#     ).first()
#     if not board:
#         raise HTTPException(status_code=404, detail="Board не найден или не принадлежит вам")
#
#     for field, value in update_data.dict(exclude_unset=True).items():
#         if value is not None:
#             setattr(board, field, value)
#
#     commit_checked(db)
#     db.refresh(board)
#     return board

@router.put("/task-statuses/{status_id}", response_model=TaskStatusResponse)
def update_task_status(
    status_id: int,
    update_data: TaskStatusUpdate,
    current_user: dict = Depends(require_admin),
    db: Session = Depends(get_db)
):
    status_obj = db.query(TaskStatus).filter(TaskStatus.id == status_id).first()
    if not status_obj:
        raise HTTPException(status_code=404, detail="TaskStatus не найден")

    if status_obj.code in SYSTEM_STATUSES and update_data.code not in (None, status_obj.code):
        raise HTTPException(409, "Код системного статуса менять нельзя")

    if update_data.code and update_data.code != status_obj.code:
        if db.query(TaskStatus).filter(TaskStatus.code == update_data.code).first():
            raise HTTPException(status_code=400, detail="TaskStatus с таким code уже существует")

    for field, value in update_data.dict(exclude_unset=True).items():
        if value is not None:
            setattr(status_obj, field, value)

    commit_checked(db)
    db.refresh(status_obj)
    return status_obj

# @router.put("/categories/{category_id}", response_model=CategoryResponse)
# def update_category(
#     category_id: int,
#     update_data: CategoryUpdate,
#     current_user: dict = Depends(get_current_user),
#     db: Session = Depends(get_db)
# ):
#     category = db.query(Category).filter(
#         Category.id == category_id,
#         Category.user_id == current_user["user"].id
#     ).first()
#     if not category:
#         raise HTTPException(status_code=404, detail="Category не найдена или не принадлежит вам")
#
#     for field, value in update_data.dict(exclude_unset=True).items():
#         if value is not None:
#             setattr(category, field, value)
#
#     commit_checked(db)
#     db.refresh(category)
#     return category

@router.put("/tags/{tag_id}", response_model=TagResponse)
def update_tag(
    tag_id: int,
    update_data: TagUpdate,
    current_user: dict = Depends(require_admin),
    db: Session = Depends(get_db)
):
    tag = db.query(Tag).filter(Tag.id == tag_id).first()
    if not tag:
        raise HTTPException(status_code=404, detail="Tag не найден")

    if update_data.name and update_data.name != tag.name:
        if db.query(Tag).filter(Tag.name == update_data.name).first():
            raise HTTPException(status_code=400, detail="Tag с таким именем уже существует")

    for field, value in update_data.dict(exclude_unset=True).items():
        if value is not None:
            setattr(tag, field, value)

    commit_checked(db)
    db.refresh(tag)
    return tag

@router.put("/tasks/{task_id}", response_model=TaskResponse)
def update_task(task_id: int, update_data: TaskUpdate, current_user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    actor = current_user["user"]
    query = restrict_user_ids(db.query(Task).filter_by(id=task_id), Task.user_id, actor, allow_self=True)
    task = query.with_for_update().first()
    if not task:
        raise HTTPException(404, "Задача не найдена")
    old_status = db.query(TaskStatus).filter_by(id=task.status_id).first()
    if old_status and old_status.code == "done":
        raise HTTPException(409, "Подтверждённую задачу нельзя изменять или открывать повторно")
    data = update_data.model_dump(exclude_unset=True)
    if old_status and old_status.code == "hold done" and any(key != "status_id" for key in data):
        raise HTTPException(409, "Сначала отзовите задачу с подтверждения")
    if "completed_at" in data or "ai_analysis_metadata" in data:
        raise HTTPException(403, "Служебные поля задачи изменяются только системой")
    if "estimated_points" in data and actor.role not in ("admin", "manager"):
        raise HTTPException(403, "Оценку сложности изменяет только руководитель")
    for key in ("title", "estimated_points", "status_id"):
        if key in data and data[key] is None:
            raise HTTPException(400, "Обязательное поле задачи не может быть null")
    if any(key in data and data[key] != getattr(task, key) for key in ("title", "description")):
        analysis = analyze_for_api(data.get("title", task.title), data.get("description", task.description))
        task.estimated_points = analysis["estimated_points"]
        task.ai_analysis_metadata = analysis
    if "estimated_points" in data:
        task.estimated_points = data.pop("estimated_points")
        task.ai_analysis_metadata = override_task_analysis(task.ai_analysis_metadata, task.estimated_points)
    if "due_date" in data:
        data["due_date"] = validate_assignment(db, task.user_id, task.competition_id, data["due_date"])
    requested_status = data.pop("status_id", None)
    if requested_status is not None:
        status = db.query(TaskStatus).filter_by(id=requested_status).first()
        if not status:
            raise HTTPException(400, "Недопустимый статус")
        if status.code == "wasted":
            raise HTTPException(400, "Просроченный статус назначается системой")
        if status.code in ("done", "hold done"):
            if task.competition_id:
                competition = db.query(Competition).filter_by(id=task.competition_id).first()
                if competition and datetime.utcnow() < competition.start_date:
                    raise HTTPException(400, "Соревнование ещё не началось")
            hold = db.query(TaskStatus).filter_by(code="hold done").first()
            if not hold:
                raise HTTPException(409, "Не настроен статус ожидания подтверждения")
            task.status_id = hold.id
            if task.completed_at is None:
                task.completed_at = datetime.utcnow()
        else:
            task.status_id = status.id
            task.completed_at = None
    for key, value in data.items():
        setattr(task, key, value)
    commit_checked(db)
    db.refresh(task)
    return task


@router.put("/manager/tasks/{task_id}/confirm", response_model=TaskResponse)
def confirm_task_completion(task_id: int, current_user: dict = Depends(require_manager), db: Session = Depends(get_db)):
    query = restrict_user_ids(db.query(Task).filter_by(id=task_id), Task.user_id, current_user["user"])
    task = query.with_for_update().first()
    if not task:
        raise HTTPException(404, "Задача не найдена")
    hold = db.query(TaskStatus).filter_by(code="hold done").first()
    done = db.query(TaskStatus).filter_by(code="done").first()
    if not hold or not done:
        raise HTTPException(409, "Не настроены системные статусы")
    if task.status_id == done.id:
        return task
    if task.status_id != hold.id:
        raise HTTPException(400, "Задача не ожидает подтверждения")
    if task.competition_id:
        competition = db.query(Competition).filter_by(id=task.competition_id).first()
        if competition and datetime.utcnow() < competition.start_date:
            raise HTTPException(400, "Соревнование ещё не началось")
    submitted_at = task.completed_at or datetime.utcnow()
    points = task.estimated_points or 0
    if task.due_date and submitted_at > task.due_date:
        points = 0
    existing = db.query(Reward).filter_by(user_id=task.user_id, reason=task_reason(task.id)).first()
    if existing:
        task.awarded_points = existing.points_amount
    else:
        reward_type = db.query(RewardType).filter_by(code="bonus1").first()
        if points and not reward_type:
            raise HTTPException(409, "Не настроен тип награды bonus1")
        if points:
            db.add(Reward(user_id=task.user_id, type_id=reward_type.id, points_amount=points, reason=task_reason(task.id)))
            adjust_task_score(db, task, points)
        task.awarded_points = points
    task.status_id = done.id
    task.completed_at = submitted_at
    commit_checked(db)
    db.refresh(task)
    return task

@router.put("/reward-types/{type_id}", response_model=RewardTypeResponse)
def update_reward_type(
    type_id: int,
    update_data: RewardTypeUpdate,
    current_user: dict = Depends(require_admin),
    db: Session = Depends(get_db)
):
    rt = db.query(RewardType).filter(RewardType.id == type_id).first()
    if not rt:
        raise HTTPException(status_code=404, detail="RewardType не найден")

    if rt.code == "bonus1" and update_data.code not in (None, "bonus1"):
        raise HTTPException(409, "Системный тип bonus1 нельзя переименовывать")

    if update_data.code and update_data.code != rt.code:
        if db.query(RewardType).filter(RewardType.code == update_data.code).first():
            raise HTTPException(status_code=400, detail="RewardType с таким code уже существует")

    for field, value in update_data.dict(exclude_unset=True).items():
        if value is not None:
            setattr(rt, field, value)

    commit_checked(db)
    db.refresh(rt)
    return rt

@router.put("/rewards/{reward_id}", response_model=RewardResponse)
def update_reward(reward_id: int, update_data: RewardUpdate, current_user: dict = Depends(require_manager), db: Session = Depends(get_db)):
    query = restrict_user_ids(db.query(Reward).filter_by(id=reward_id), Reward.user_id, current_user["user"])
    reward = query.with_for_update().first()
    if not reward:
        raise HTTPException(404, "Награда не найдена")
    if reward_task_id(reward.reason) is not None or (reward.reason or "").startswith("Корректировка счёта соревнования"):
        raise HTTPException(409, "Системное начисление задачи нельзя менять вручную")
    data = update_data.model_dump(exclude_unset=True)
    if reward_task_id(data.get("reason")) is not None or (data.get("reason") or "").startswith("Корректировка счёта соревнования"):
        raise HTTPException(400, "Нельзя создавать системное начисление вручную")
    if data.get("type_id") is not None and not db.query(RewardType).filter_by(id=data["type_id"]).first():
        raise HTTPException(400, "Тип награды не найден")
    for key,value in data.items():
        if value is not None or key == "reason":
            setattr(reward,key,value)
    commit_checked(db)
    db.refresh(reward)
    return reward

@router.put("/competitions/{competition_id}", response_model=CompetitionResponse)
def update_competition(competition_id: int, competition_update: CompetitionUpdate, current_user: dict = Depends(require_manager), db: Session = Depends(get_db)):
    competition = db.query(Competition).filter_by(id=competition_id).with_for_update().first()
    if not competition:
        raise HTTPException(404, "Соревнование не найдено")
    data = competition_update.model_dump(exclude_unset=True)
    start,end = validate_period(data.get("start_date", competition.start_date), data.get("end_date", competition.end_date))
    if db.query(Task).filter(Task.competition_id == competition_id, (Task.due_date < start) | (Task.due_date > end)).first():
        raise HTTPException(409, "Новые даты исключают сроки существующих задач")
    if data.get("title") is not None and db.query(Competition).filter(Competition.title == data["title"], Competition.id != competition_id).first():
        raise HTTPException(409, "Соревнование с таким названием уже существует")
    if "title" in data and data["title"] is None:
        raise HTTPException(400, "Название обязательно")
    competition.start_date,competition.end_date = start,end
    if "title" in data:
        competition.title = data["title"]
    commit_checked(db)
    db.refresh(competition)
    return competition

@router.put("/participants/{participant_id}", response_model=ParticipantResponse)
def update_participant(participant_id: int, update_data: ParticipantUpdate, current_user: dict = Depends(require_manager), db: Session = Depends(get_db)):
    participant = db.query(Participant).filter_by(id=participant_id).with_for_update().first()
    if not participant:
        raise HTTPException(404, "Участник не найден")
    require_employee_access(current_user["user"], db.get(User, participant.user_id))
    if update_data.score is not None and update_data.score != participant.score:
        rt = db.query(RewardType).filter_by(code="bonus1").first()
        if not rt:
            raise HTTPException(409, "Не настроен тип награды bonus1")
        delta = update_data.score - (participant.score or 0)
        db.add(Reward(user_id=participant.user_id, type_id=rt.id, points_amount=delta, reason=f"Корректировка счёта соревнования (ID: {participant.competition_id})"))
        participant.score = update_data.score
    commit_checked(db)
    db.refresh(participant)
    return participant
