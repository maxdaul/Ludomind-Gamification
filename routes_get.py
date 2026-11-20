from database import utc_naive, commit_checked, validate_period, validate_assignment, task_reason, reward_task_id, adjust_task_score, analyze_for_api, create_validated_task, SYSTEM_STATUSES
import os

from fastapi import APIRouter, Depends, HTTPException, Query, Header
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload
from typing import List, Optional

from schemas import TASK_DIFFICULTY_MEDIUM_MIN, TASK_DIFFICULTY_MEDIUM_MAX
from schemas import TaskTitleAndDate, UserLeaderboard, CompetitionPendingTasksCount, UserStatisticsResponse
from db import get_db
from database import require_employee_access, restrict_user_ids
from database import User, TaskStatus, Tag, Task, RewardType, Reward, Competition, Participant, TaskTag
from schemas import (
    UserResponse, TaskStatusResponse,
    TagResponse, TaskResponse, RewardTypeResponse, RewardResponse,
    CompetitionResponse, CompetitionDatesResponse, MoodleCourseResponse,
    MoodleCourseCompletionResponse,
)
from dependencies import get_current_user, require_admin, require_manager
from moodle_api import (
    MoodleAPIError,
    list_moodle_courses_for_editing_teacher,
    list_moodle_user_courses,
    moodle_completion_summary,
    moodle_completion_pie_rows,
    moodle_sync_enabled,
)

router = APIRouter()




def _grafana_infinity_key() -> str:
    return (os.getenv("GRAFANA_INFINITY_KEY") or "").strip()


def _resolve_moodle_user(
    db: Session,
    current: User,
    user_id: Optional[int],
) -> tuple[User, int]:
    """
    Пользователь, для которого запрашиваем Moodle: сам пользователь или выбранный менеджером.
    """
    if user_id is not None and current.role in ("admin", "manager"):
        target = db.query(User).filter(User.id == user_id, User.role == "user").first()
        if not target:
            raise HTTPException(status_code=404, detail="Пользователь не найден")
        require_employee_access(current, target)
    else:
        target = current

    if target.moodle_id is None:
        raise HTTPException(
            status_code=400,
            detail="У пользователя нет привязки к Moodle (moodle_id).",
        )
    return target, int(target.moodle_id)


def _user_current_competition(db: Session, user_id: int):
    p = db.query(Participant).filter(Participant.user_id == user_id).order_by(Participant.competition_id.desc()).first()
    return p.competition_id if p else None

@router.get("/tasks/latest", response_model=list[TaskTitleAndDate])
def get_tasks(
        current_user: dict = Depends(get_current_user),
        db: Session = Depends(get_db),
        competition_id: int | None = Query(default=None, ge=1),
):
    query = db.query(Task.title, Task.due_date).filter(Task.user_id == current_user["user"].id)
    if competition_id is not None:
        query = query.filter(Task.competition_id == competition_id)
    tasks = query.order_by(Task.created_at.desc(), Task.id.desc()).limit(10).all()

    return [{"title": task.title, "due_date": task.due_date} for task in tasks]

@router.get("/users", response_model=List[UserResponse])
def get_all_users(
    current_user: dict = Depends(require_admin),
    db: Session = Depends(get_db)
):
    users = db.query(User).all()
    return users

@router.get("/competitions/{competition_id}/dates", response_model=CompetitionDatesResponse)
def get_competition_dates(
    competition_id: int,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    competition = db.query(Competition).filter(Competition.id == competition_id).first()
    if not competition:
        raise HTTPException(status_code=404, detail="Соревнование не найдено")

    return CompetitionDatesResponse(start_date=competition.start_date, end_date=competition.end_date)


@router.get("/users/only", response_model=List[UserResponse])
def get_all_users(
    current_user: dict = Depends(require_manager),
    db: Session = Depends(get_db)
):
    query = db.query(User).filter(User.role == "user")
    return restrict_user_ids(query, User.id, current_user["user"]).all()


@router.get("/moodle/courses", response_model=List[MoodleCourseResponse])
def get_moodle_courses(current_user: dict = Depends(require_manager)):
    """Курсы, где у текущего пользователя Moodle есть право ручного зачисления."""
    if not moodle_sync_enabled():
        raise HTTPException(
            status_code=503,
            detail="Интеграция с Moodle не настроена (MOODLE_WS_URL / MOODLE_WS_TOKEN)",
        )
    user = current_user["user"]
    if user.moodle_id is None:
        raise HTTPException(
            status_code=400,
            detail="У вашей учётной записи нет привязки к Moodle (moodle_id). "
            "Список курсов доступен только при наличии профиля в Moodle.",
        )
    try:
        raw = list_moodle_courses_for_editing_teacher(int(user.moodle_id))
        return [MoodleCourseResponse(**c) for c in raw]
    except MoodleAPIError as e:
        raise HTTPException(status_code=502, detail="Внешний сервис временно недоступен") from e


@router.get("/moodle/user-courses", response_model=List[MoodleCourseResponse])
def get_moodle_enrolled_courses_for_user(
    user_id: Optional[int] = Query(
        default=None,
        description="Локальный id пользователя (только для admin/manager); иначе — курсы текущего пользователя",
    ),
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """core_enrol_get_users_courses по users.moodle_id выбранного (или текущего) пользователя."""
    if not moodle_sync_enabled():
        raise HTTPException(
            status_code=503,
            detail="Интеграция с Moodle не настроена (MOODLE_WS_URL / MOODLE_WS_TOKEN)",
        )
    current = current_user["user"]
    _target, moodle_user_id = _resolve_moodle_user(db, current, user_id)
    try:
        raw = list_moodle_user_courses(moodle_user_id)
        return [MoodleCourseResponse(**c) for c in raw]
    except MoodleAPIError as e:
        raise HTTPException(status_code=502, detail="Внешний сервис временно недоступен") from e


@router.get("/moodle/course-completion", response_model=MoodleCourseCompletionResponse)
def get_moodle_course_completion(
    course_id: int = Query(..., ge=1),
    user_id: Optional[int] = Query(
        default=None,
        description="Локальный id пользователя (только для admin/manager)",
    ),
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """core_completion_get_course_completion_status — сводка для UI и согласованная с Grafana."""
    if not moodle_sync_enabled():
        raise HTTPException(
            status_code=503,
            detail="Интеграция с Moodle не настроена (MOODLE_WS_URL / MOODLE_WS_TOKEN)",
        )
    current = current_user["user"]
    _target, moodle_user_id = _resolve_moodle_user(db, current, user_id)
    try:
        progress = moodle_completion_summary(moodle_user_id, course_id)
    except MoodleAPIError as e:
        raise HTTPException(status_code=502, detail="Внешний сервис временно недоступен") from e
    return MoodleCourseCompletionResponse(
        completion_percent=progress.percent,
        progress_basis=progress.basis,
        completed_criteria=progress.done,
        total_criteria=progress.total,
        moodle_completed=progress.course_completed,
        course_id=course_id,
        moodle_user_id=moodle_user_id,
    )


@router.get("/internal/grafana/moodle-completion-pie")
def grafana_infinity_moodle_completion_pie(
    moodle_user_id: int = Query(..., ge=1),
    course_id: int = Query(..., ge=1),
    key: Optional[str] = Header(default=None, alias="X-Grafana-Key"),
):
    """
    JSON для датасорса Grafana Infinity (круговая диаграмма). Защита общим ключом GRAFANA_INFINITY_KEY.
    """
    import secrets
    configured_key = _grafana_infinity_key()
    if not configured_key or not key or not secrets.compare_digest(key, configured_key):
        raise HTTPException(status_code=404, detail="Not Found")
    if not moodle_sync_enabled():
        raise HTTPException(status_code=503, detail="Moodle disabled")
    try:
        return moodle_completion_pie_rows(moodle_user_id, course_id)
    except MoodleAPIError as e:
        raise HTTPException(status_code=502, detail="Внешний сервис временно недоступен") from e


@router.get("/users/me", response_model=UserResponse)
def read_own_info(
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    user = current_user["user"]
    # Текущее соревнование — по последнему участию (participants)
    p = db.query(Participant).filter(Participant.user_id == user.id).order_by(Participant.competition_id.desc()).first()
    current_competition_id = p.competition_id if p else None
    return UserResponse(
        id=user.id,
        first_name=user.first_name,
        last_name=user.last_name,
        username=user.username,
        email=user.email,
        role=user.role,
        current_competition_id=current_competition_id,
        moodle_id=user.moodle_id,
    )

# @router.get("/", summary="Root endpoint")
# async def root():
#     return {
#         "message": "Gamification API запущен!",
#         "time": datetime.now().isoformat()
#     }

# @router.get("/boards", response_model=List[BoardResponse])
# def get_boards(current_user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
#     return db.query(Board).filter(Board.user_id == current_user["user"].id).all()

@router.get("/task-statuses", response_model=List[TaskStatusResponse])
def get_task_statuses(db: Session = Depends(get_db), _user: dict = Depends(get_current_user)):
    return db.query(TaskStatus).all()

# @router.get("/categories", response_model=List[CategoryResponse])
# def get_categories(current_user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
#     return db.query(Category).filter(Category.user_id == current_user["user"].id).all()

@router.get("/tags", response_model=List[TagResponse])
def get_tags(db: Session = Depends(get_db), _user: dict = Depends(get_current_user)):
    return db.query(Tag).all()

@router.get("/tasks", response_model=List[TaskResponse])
def get_tasks(current_user: dict = Depends(get_current_user), db: Session = Depends(get_db), user_id: Optional[int] = Query(default=None, ge=1)):
    actor = current_user["user"]
    target_id = user_id or actor.id
    if target_id != actor.id and actor.role not in ("admin", "manager"):
        raise HTTPException(403, "Доступны только собственные задачи")
    employee = db.get(User, target_id)
    if not employee:
        raise HTTPException(404, "Пользователь не найден")
    require_employee_access(actor, employee, allow_self=True)
    return db.query(Task).filter(Task.user_id == target_id).options(joinedload(Task.tags)).all()



@router.get("/manager/competitions/{competition_id}/tasks", response_model=List[TaskResponse])
def get_competition_tasks_for_manager(
    competition_id: int,
    current_user: dict = Depends(require_manager),
    db: Session = Depends(get_db),
):
    """
    Возвращает все задачи конкретного соревнования для менеджера
    (по competition_id), по всем пользователям.
    """
    competition = db.query(Competition).filter(Competition.id == competition_id).first()
    if not competition:
        raise HTTPException(status_code=404, detail="Соревнование не найдено")

    query = db.query(Task).filter(Task.competition_id == competition_id)
    return restrict_user_ids(query, Task.user_id, current_user["user"]).all()

@router.get("/reward-types", response_model=List[RewardTypeResponse])
def get_reward_types(db: Session = Depends(get_db), _user: dict = Depends(get_current_user)):
    return db.query(RewardType).all()

@router.get("/rewards", response_model=List[RewardResponse])
def get_rewards(current_user: dict = Depends(get_current_user), db: Session = Depends(get_db), user_id: Optional[int] = Query(default=None, ge=1)):
    actor = current_user["user"]
    target_id = user_id or actor.id
    if target_id != actor.id and actor.role not in ("admin", "manager"):
        raise HTTPException(403, "Доступна только собственная история наград")
    if not db.query(User).filter_by(id=target_id).first():
        raise HTTPException(404, "Пользователь не найден")
    employee = db.get(User, target_id)
    if not employee:
        raise HTTPException(404, "Пользователь не найден")
    require_employee_access(actor, employee, allow_self=True)
    return db.query(Reward).filter(Reward.user_id == target_id).order_by(Reward.awarded_at.desc(), Reward.id.desc()).all()


# Получение списка всех соревнований
@router.get("/competitions", response_model=List[CompetitionResponse])
def get_competitions(
    current_user: dict = Depends(require_manager),
    db: Session = Depends(get_db)
):
    competitions = db.query(Competition).all()
    return competitions

# Получение конкретного соревнования по ID
@router.get("/competitions/pending-tasks-counts", response_model=List[CompetitionPendingTasksCount])
def get_competitions_pending_tasks_counts(
    current_user: dict = Depends(require_manager),
    db: Session = Depends(get_db)
):
    """
    Возвращает для каждого соревнования количество задач в статусе 'Ожидает подтверждения'.
    Используется на панели менеджера для отображения "горящих" счетчиков.
    """
    hold_status = db.query(TaskStatus).filter(TaskStatus.code == "hold done").first()
    if not hold_status:
        return []

    query = db.query(Task.competition_id, func.count(Task.id)).filter(
        Task.competition_id.isnot(None), Task.status_id == hold_status.id
    )
    rows = restrict_user_ids(query, Task.user_id, current_user["user"]).group_by(Task.competition_id).all()

    return [
        CompetitionPendingTasksCount(competition_id=competition_id, pending_count=count)
        for competition_id, count in rows
    ]


@router.get("/competitions/{competition_id}", response_model=CompetitionResponse)
def get_competition(
    competition_id: int,
    current_user: dict = Depends(get_current_user), # Только админ может получить конкретное
    db: Session = Depends(get_db)
):
    competition = db.query(Competition).filter(Competition.id == competition_id).first()
    if not competition:
        raise HTTPException(status_code=404, detail="Соревнование не найдено")
    return competition


@router.get("/competitions/{competition_id}/pending-tasks", response_model=List[TaskResponse])
def get_competition_pending_tasks(
    competition_id: int,
    current_user: dict = Depends(require_manager),
    db: Session = Depends(get_db)
):
    """
    Возвращает задачи соревнования, которые находятся в статусе 'Ожидает подтверждения'.
    """
    competition = db.query(Competition).filter(Competition.id == competition_id).first()
    if not competition:
        raise HTTPException(status_code=404, detail="Соревнование не найдено")

    hold_status = db.query(TaskStatus).filter(TaskStatus.code == "hold done").first()
    if not hold_status:
        return []

    query = db.query(Task).filter(Task.competition_id == competition_id, Task.status_id == hold_status.id)
    return restrict_user_ids(query, Task.user_id, current_user["user"]).all()



# Получение лидерборда конкретного соревнования
@router.get("/leaderboard/{competition_id}", response_model=List[UserLeaderboard])
def get_leaderboard(
    competition_id: int,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Лидерборд по соревнованию, использует таблицу participants и поле score.
    """
    comp = db.query(Competition).filter(Competition.id == competition_id).first()
    if not comp:
        raise HTTPException(status_code=404, detail="Соревнование не найдено")

    participants = (
        db.query(Participant, User.first_name, User.last_name)
        .join(User, Participant.user_id == User.id)
        .filter(Participant.competition_id == competition_id)
        .order_by(Participant.score.desc())
        .all()
    )
    leaderboard = [
        UserLeaderboard(user_id=participant.user_id, first_name=first_name, last_name=last_name, score=participant.score)
        for participant, first_name, last_name in participants
    ]
    return leaderboard


@router.get("/users/me/competitions", response_model=List[CompetitionResponse])
def get_my_competitions(
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Возвращает соревнования, в которых участвует текущий пользователь.
    Использует таблицу participants для связи user_id -> competition_id.
    """
    user = current_user["user"]

    rows = (
        db.query(Competition)
        .join(Participant, Participant.competition_id == Competition.id)
        .filter(Participant.user_id == user.id)
        .order_by(Competition.start_date.desc())
        .all()
    )

    return rows


@router.get("/participants/competition/{competition_id}")
def get_competition_participants(
    competition_id: int,
    current_user: dict = Depends(require_manager),
    db: Session = Depends(get_db)
):
    """
    Возвращает участников соревнования из таблицы participants,
    вместе с базовой информацией о пользователях.
    """
    comp = db.query(Competition).filter(Competition.id == competition_id).first()
    if not comp:
        raise HTTPException(status_code=404, detail="Соревнование не найдено")

    query = db.query(Participant, User).join(User, Participant.user_id == User.id).filter(
        Participant.competition_id == competition_id
    )
    rows = restrict_user_ids(query, Participant.user_id, current_user["user"]).all()

    return [
        {
            "participant_id": participant.id,
            "competition_id": participant.competition_id,
            "user_id": user.id,
            "score": participant.score,
            "user": {
                "id": user.id,
                "first_name": user.first_name,
                "last_name": user.last_name,
                "email": user.email,
                "role": user.role,
                "current_competition_id": _user_current_competition(db, user.id),
            },
        }
        for participant, user in rows
    ]


@router.get("/participants/users")
def get_users_with_participations(
    current_user: dict = Depends(require_manager),
    db: Session = Depends(get_db)
):
    """
    Возвращает пользователей (role == 'user') и их участия в соревнованиях
    из таблицы participants. Используется для панели менеджера.
    """
    actor = current_user["user"]
    users = restrict_user_ids(db.query(User).filter(User.role == "user"), User.id, actor).all()
    participations = restrict_user_ids(db.query(Participant), Participant.user_id, actor).all()

    parts_by_user: dict[int, list[dict]] = {}
    for p in participations:
        parts_by_user.setdefault(p.user_id, []).append(
            {
                "id": p.id,
                "competition_id": p.competition_id,
                "score": p.score,
            }
        )

    result = []
    for u in users:
        result.append(
            {
                "id": u.id,
                "first_name": u.first_name,
                "last_name": u.last_name,
                "email": u.email,
                "role": u.role,
                "current_competition_id": _user_current_competition(db, u.id),
                "participants": parts_by_user.get(u.id, []),
            }
        )

    return result


@router.get("/users/me/statistics", response_model=UserStatisticsResponse)
def get_user_statistics(
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
    user_id: Optional[int] = Query(
        default=None,
        description="ID пользователя (для админа/менеджера, чтобы смотреть статистику любого пользователя)",
    ),
    tag_ids: Optional[List[int]] = Query(
        default=None,
        description="ID тегов для фильтрации выполненных задач (задачи, имеющие хотя бы один из тегов)",
    ),
):
    """
    Статистика по пользователю:
    - для обычного пользователя: только его собственная статистика
    - для админа/менеджера: можно указать user_id и посмотреть статистику конкретного пользователя
    """
    current = current_user["user"]

    # Определяем, для какого пользователя считаем статистику
    target_user_id = current.id
    if user_id is not None:
        if user_id != current.id and current.role not in ("admin", "manager"):
            raise HTTPException(403, "Можно просматривать только свою статистику")
        target_user_id = user_id

    # Проверяем, что пользователь существует и является "user"
    target_user = db.query(User).filter(User.id == target_user_id).first()
    if not target_user:
        raise HTTPException(status_code=404, detail="Пользователь не найден")

    require_employee_access(current, target_user, allow_self=True)
    participations = db.query(Participant).filter(Participant.user_id == target_user.id).all()
    total_competitions = len(participations)
    total_score = sum(p.score or 0 for p in participations)

    # Статусы задач
    done_status = db.query(TaskStatus).filter(TaskStatus.code == "done").first()
    wasted_status = db.query(TaskStatus).filter(TaskStatus.code == "wasted").first()

    completed_tasks_count = 0
    wasted_tasks_count = 0
    easy_tasks_count = 0
    medium_tasks_count = 0
    hard_tasks_count = 0
    completed_with_tags_count = 0

    if done_status:
        # Все выполненные задачи
        completed_tasks_q = db.query(Task).filter(
            Task.user_id == target_user.id,
            Task.status_id == done_status.id,
        )
        completed_tasks_count = completed_tasks_q.count()

        # Разделение по сложности по estimated_points
        easy_tasks_count = completed_tasks_q.filter(Task.estimated_points < TASK_DIFFICULTY_MEDIUM_MIN).count()
        medium_tasks_count = completed_tasks_q.filter(
            Task.estimated_points >= TASK_DIFFICULTY_MEDIUM_MIN,
            Task.estimated_points <= TASK_DIFFICULTY_MEDIUM_MAX,
        ).count()
        hard_tasks_count = completed_tasks_q.filter(Task.estimated_points > TASK_DIFFICULTY_MEDIUM_MAX).count()

    if wasted_status:
        wasted_tasks_count = (
            db.query(Task)
            .filter(Task.user_id == target_user.id, Task.status_id == wasted_status.id)
            .count()
        )

    # Количество выполненных задач с выбранными тегами (любой из указанных тегов)
    if done_status and tag_ids:
        completed_with_tags_count = (
            db.query(Task)
            .join(TaskTag, TaskTag.task_id == Task.id)
            .filter(
                Task.user_id == target_user.id,
                Task.status_id == done_status.id,
                TaskTag.tag_id.in_(tag_ids),
            )
            .distinct(Task.id)
            .count()
        )

    return UserStatisticsResponse(
        total_competitions=total_competitions,
        total_score=total_score,
        completed_tasks_count=completed_tasks_count,
        wasted_tasks_count=wasted_tasks_count,
        easy_tasks_count=easy_tasks_count,
        medium_tasks_count=medium_tasks_count,
        hard_tasks_count=hard_tasks_count,
        completed_with_tags_count=completed_with_tags_count,
        medium_difficulty_min=TASK_DIFFICULTY_MEDIUM_MIN,
        medium_difficulty_max=TASK_DIFFICULTY_MEDIUM_MAX,
    )

@router.get("/manager/summary")
def manager_summary(current_user: dict = Depends(require_manager), db: Session = Depends(get_db)):
    from datetime import datetime
    now = datetime.utcnow()
    return {
        "total_competitions": db.query(Competition).count(),
        "active_competitions": db.query(Competition).filter(Competition.start_date <= now, Competition.end_date >= now).count(),
        "unique_participants_count": db.query(func.count(func.distinct(Participant.user_id))).scalar() or 0,
    }
