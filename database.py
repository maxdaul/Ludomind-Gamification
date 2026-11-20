from sqlalchemy import (
    Column, String, Integer, Text, ForeignKey, Index, JSON, DateTime, func, select, text
)
from sqlalchemy.orm import declarative_base
from sqlalchemy.orm import relationship

from auth import get_password_hash
from db import engine
from sqlalchemy.orm import Session

Base = declarative_base()

class Position(Base):
    __tablename__ = "positions"
    id = Column(Integer, primary_key=True)
    name = Column(String(100), nullable=False)
    __table_args__ = (Index("uq_positions_name_lower", func.lower(name), unique=True),)


class Department(Base):
    __tablename__ = "departments"
    id = Column(Integer, primary_key=True)
    name = Column(String(100), nullable=False)
    __table_args__ = (Index("uq_departments_name_lower", func.lower(name), unique=True),)


class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, autoincrement=True)
    first_name = Column(String, nullable=False)
    last_name = Column(String, nullable=False)
    username = Column(String(100), unique=True, nullable=False)
    email = Column(String, unique=True, nullable=False)
    password_hash = Column(Text, nullable=False)
    moodle_id = Column(Integer, nullable=True)
    manager_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL", name="fk_users_manager_id"), index=True)
    position_id = Column(Integer, ForeignKey("positions.id", ondelete="RESTRICT", name="fk_users_position_id"), index=True)
    department_id = Column(Integer, ForeignKey("departments.id", ondelete="RESTRICT", name="fk_users_department_id"), index=True)
    role = Column(String, default="user")
    created_at = Column(DateTime, nullable=False, server_default=text("CURRENT_TIMESTAMP"))
    updated_at = Column(DateTime, nullable=False, server_default=text("CURRENT_TIMESTAMP"), onupdate=text("CURRENT_TIMESTAMP"))
    #boards = relationship("Board", back_populates="user")
    tasks = relationship("Task", back_populates="user")
    #categories = relationship("Category", back_populates="user")
    rewards = relationship("Reward", back_populates="user")
    participants = relationship("Participant", back_populates="user")

class Competition(Base):
    __tablename__ = "competitions"
    id = Column(Integer, primary_key=True, autoincrement=True)
    title = Column(String, nullable=False)
    start_date = Column(DateTime, nullable=False)
    end_date = Column(DateTime, nullable=False)
    created_at = Column(DateTime, nullable=False, server_default=text("CURRENT_TIMESTAMP"))
    updated_at = Column(DateTime, nullable=False, server_default=text("CURRENT_TIMESTAMP"), onupdate=text("CURRENT_TIMESTAMP"))
    participants = relationship("Participant", back_populates="competition")
    tasks = relationship("Task", back_populates="competition")


class Participant(Base):
    __tablename__ = "participants"
    id = Column(Integer, primary_key=True, autoincrement=True)
    competition_id = Column(Integer, ForeignKey("competitions.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    score = Column(Integer, default=0)
    competition = relationship("Competition", back_populates="participants")
    user = relationship("User", back_populates="participants")

class TaskStatus(Base):
    __tablename__ = "task_status"
    id = Column(Integer, primary_key=True, autoincrement=True)
    code = Column(String, unique=True, nullable=False)
    name = Column(String, nullable=False)

class Tag(Base):
    __tablename__ = "tags"
    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String, unique=True, nullable=False)
    tasks = relationship("Task", secondary="task_tags", back_populates="tags")

class TaskTag(Base):
    __tablename__ = "task_tags"
    task_id = Column(Integer, ForeignKey("tasks.id"), primary_key=True)
    tag_id = Column(Integer, ForeignKey("tags.id"), primary_key=True)

class Task(Base):
    __tablename__ = "tasks"
    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    competition_id = Column(Integer, ForeignKey("competitions.id"), nullable=True)
    #board_id = Column(Integer, ForeignKey("boards.id"), nullable=False)
    status_id = Column(Integer, ForeignKey("task_status.id"), nullable=False)
    #category_id = Column(Integer, ForeignKey("categories.id"), nullable=False)
    title = Column(String, nullable=False)
    description = Column(Text)
    ai_analysis_metadata = Column(JSON)
    estimated_points = Column(Integer, default=0)
    awarded_points = Column(Integer, default=0)
    due_date = Column(DateTime)
    completed_at = Column(DateTime)
    created_at = Column(DateTime, nullable=False, server_default=text("CURRENT_TIMESTAMP"))
    updated_at = Column(DateTime, nullable=False, server_default=text("CURRENT_TIMESTAMP"), onupdate=text("CURRENT_TIMESTAMP"))
    user = relationship("User", back_populates="tasks")
    competition = relationship("Competition", back_populates="tasks")
    #board = relationship("Board", back_populates="tasks")
    status = relationship("TaskStatus")
    #category = relationship("Category", back_populates="tasks")
    tags = relationship("Tag", secondary="task_tags", back_populates="tasks")

class RewardType(Base):
    __tablename__ = "reward_types"
    id = Column(Integer, primary_key=True, autoincrement=True)
    code = Column(String, unique=True, nullable=False)
    name = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    rewards = relationship("Reward", back_populates="type")

class Reward(Base):
    __tablename__ = "rewards"
    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    type_id = Column(Integer, ForeignKey("reward_types.id"), nullable=False)
    points_amount = Column(Integer, nullable=False)
    awarded_at = Column(DateTime, nullable=False, server_default=text("CURRENT_TIMESTAMP"))
    reason = Column(Text)
    user = relationship("User", back_populates="rewards")
    type = relationship("RewardType", back_populates="rewards")

class TaskDeadlineNotification(Base):
    __tablename__ = "task_deadline_notifications"
    task_id = Column(Integer, ForeignKey("tasks.id", ondelete="CASCADE"), primary_key=True)
    kind = Column(String(16), primary_key=True)
    due_date = Column(DateTime, primary_key=True)
    sent_at = Column(DateTime)
    retry_after = Column(DateTime)


def managed_employee_ids(actor):
    return select(User.id).where(User.role == "user", User.manager_id == actor.id).correlate(None)


def restrict_user_ids(query, column, actor, *, allow_self=False):
    if actor.role == "admin":
        return query
    if actor.role == "manager":
        managed = column.in_(managed_employee_ids(actor))
        return query.filter(managed | (column == actor.id) if allow_self else managed)
    return query.filter(column == actor.id)


def require_employee_access(actor, employee, *, allow_self=False):
    from fastapi import HTTPException
    if employee is None:
        raise HTTPException(404, "Пользователь не найден")
    if actor.role == "admin" or (allow_self and actor.id == employee.id):
        return
    if actor.role == "manager" and employee.role == "user" and employee.manager_id == actor.id:
        return
    detail = "Доступны только закреплённые за вами сотрудники" if actor.role == "manager" else "Доступны только собственные данные"
    raise HTTPException(403, detail)


def lock_managed_employees(db, actor, user_ids):
    from fastapi import HTTPException
    if actor.role != "manager":
        return
    # Recheck when saving: a reassignment during an ML request must take effect.
    employees = (db.query(User).filter(User.id.in_(user_ids)).order_by(User.id)
                 .populate_existing().with_for_update(read=True).all())
    if len(employees) != len(user_ids):
        raise HTTPException(404, "Исполнитель не найден")
    for employee in employees:
        require_employee_access(actor, employee)


def migrate_staff_and_notifications():
    with engine.begin() as connection:
        connection.execute(text("SET LOCAL lock_timeout = '5s'"))
        connection.execute(text("SELECT pg_advisory_xact_lock(72440901)"))
        connection.execute(text("""
            ALTER TABLE users ADD COLUMN IF NOT EXISTS manager_id INTEGER
            CONSTRAINT fk_users_manager_id REFERENCES users(id) ON DELETE SET NULL
        """))
        connection.execute(text("CREATE INDEX IF NOT EXISTS ix_users_manager_id ON users (manager_id)"))
        TaskDeadlineNotification.__table__.create(connection, checkfirst=True)

        Position.__table__.create(connection, checkfirst=True)
        Department.__table__.create(connection, checkfirst=True)
        connection.execute(text("""
            ALTER TABLE users
                ADD COLUMN IF NOT EXISTS position_id INTEGER
                    CONSTRAINT fk_users_position_id REFERENCES positions(id) ON DELETE RESTRICT,
                ADD COLUMN IF NOT EXISTS department_id INTEGER
                    CONSTRAINT fk_users_department_id REFERENCES departments(id) ON DELETE RESTRICT
        """))
        connection.execute(text("CREATE INDEX IF NOT EXISTS ix_users_position_id ON users (position_id)"))
        connection.execute(text("CREATE INDEX IF NOT EXISTS ix_users_department_id ON users (department_id)"))


SYSTEM_STATUSES = frozenset({"todo", "in_progress", "hold done", "done", "wasted"})

def utc_naive(value):
    from datetime import timezone
    if value is not None and value.tzinfo is not None:
        return value.astimezone(timezone.utc).replace(tzinfo=None)
    return value

def commit_checked(db):
    from fastapi import HTTPException
    from sqlalchemy.exc import IntegrityError
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "Операция нарушает связи или уникальность данных") from None

def validate_period(start, end):
    from fastapi import HTTPException
    start, end = utc_naive(start), utc_naive(end)
    if not start or not end or end <= start:
        raise HTTPException(400, "Окончание соревнования должно быть позже начала")
    return start, end

def validate_assignment(db, user_id, competition_id, due_date):
    from fastapi import HTTPException
    due_date = utc_naive(due_date)
    if competition_id is not None:
        competition = db.query(Competition).filter(Competition.id == competition_id).with_for_update().first()
        if not competition:
            raise HTTPException(404, "Соревнование не найдено")
        if not db.query(Participant).filter_by(user_id=user_id, competition_id=competition_id).with_for_update().first():
            raise HTTPException(400, "Исполнитель не участвует в соревновании")
        if due_date is None or not competition.start_date <= due_date <= competition.end_date:
            raise HTTPException(400, "Срок задачи должен быть в пределах соревнования")
    return due_date

def lock_participant_for_removal(db, participant):
    from fastapi import HTTPException
    db.query(Competition).filter_by(id=participant.competition_id).with_for_update().first()
    locked = db.query(Participant).filter_by(id=participant.id).with_for_update().first()
    if not locked:
        raise HTTPException(404, "Участник уже удалён")
    return locked

def task_reason(task_id):
    return f"Выполнена задача (ID: {task_id})"

def reward_task_id(reason):
    import re
    match = re.fullmatch(r"Выполнена задача \(ID: (\d+)\)", reason or "")
    return int(match.group(1)) if match else None

def adjust_task_score(db, task, delta):
    if not delta or task.competition_id is None:
        return
    participant = db.query(Participant).filter_by(user_id=task.user_id, competition_id=task.competition_id).with_for_update().first()
    if participant:
        participant.score = max(0, (participant.score or 0) + delta)

def analyze_for_api(title, description):
    from fastapi import HTTPException
    from ml.ai_analyzer import analyze_task, YandexAPIError, YandexRateLimitError
    try:
        result = analyze_task(title, description or "")
    except YandexRateLimitError:
        raise HTTPException(429, "Слишком много запросов к ИИ. Повторите позже.") from None
    except YandexAPIError:
        raise HTTPException(503, "Сервис оценки задач временно недоступен") from None
    if result.get("estimated_points") is None or result.get("is_meaningless"):
        raise HTTPException(400, "Уточните название и описание задачи")
    return result

def override_task_analysis(analysis, points):
    analysis = dict(analysis or {})
    analysis.setdefault("model_estimated_points", analysis.get("estimated_points"))
    return dict(analysis, estimated_points=points, manual_override=True)


def create_validated_task(db, payload, user, actor):
    from fastapi import HTTPException
    # Use the current assignment even if the user row was loaded earlier in the request.
    db.refresh(user)
    require_employee_access(actor, user, allow_self=actor.role == "user")
    status = db.query(TaskStatus).filter_by(id=payload.status_id).first()
    if not status:
        raise HTTPException(404, "Статус не найден")
    if status.code in ("done", "hold done", "wasted"):
        raise HTTPException(400, "Новая задача должна быть незавершённой")
    due = validate_assignment(db, user.id, payload.competition_id, payload.due_date)
    analysis = analyze_for_api(payload.title, payload.description)
    points = analysis["estimated_points"]
    if payload.estimated_points not in (None, 0, points):
        if actor.role not in ("admin", "manager"):
            raise HTTPException(403, "Оценку задаёт система или руководитель")
        points = payload.estimated_points
        analysis = override_task_analysis(analysis, points)
    lock_managed_employees(db, actor, [user.id])
    task = Task(user_id=user.id, status_id=status.id, title=payload.title,
                description=payload.description, estimated_points=points,
                ai_analysis_metadata=analysis, due_date=due,
                competition_id=payload.competition_id, awarded_points=0)
    db.add(task)
    commit_checked(db)
    db.refresh(task)
    return task


def init_db(*, seed_defaults=True):
    Base.metadata.create_all(bind=engine)
    with Session(engine) as db:
        db.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS moodle_id INTEGER;"))
        db.commit()

        db.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS username VARCHAR(100);"))
        db.commit()

        db.execute(text("CREATE EXTENSION IF NOT EXISTS pg_cron;"))
        db.commit() # Важно зафиксировать транзакцию перед следующим шагом
        
        # Функция в БД, которая помечает просроченные задачи статусом wasted
        db.execute(text("""
            CREATE OR REPLACE FUNCTION mark_overdue_tasks()
            RETURNS void
            LANGUAGE plpgsql
            AS $$
            BEGIN
                UPDATE tasks t
                SET
                    status_id = ts.id,
                    updated_at = (now() AT TIME ZONE 'UTC')
                FROM task_status ts
                WHERE
                    ts.code = 'wasted'
                    AND t.due_date IS NOT NULL
                    AND t.due_date < (now() AT TIME ZONE 'UTC')
                    AND t.status_id <> ts.id
                    AND t.status_id NOT IN (SELECT id FROM task_status WHERE code IN ('done', 'hold done'));
            END;
            $$;
        """))

        # Задача pg_cron запускает проверку каждые 30 минут.
        db.execute(text("""
            SELECT cron.schedule(
                'mark_overdue_tasks_job',
                '*/30 * * * *',
                'SELECT mark_overdue_tasks();'
            )
            WHERE NOT EXISTS (
                SELECT 1 FROM cron.job WHERE jobname = 'mark_overdue_tasks_job'
            );
        """))

        if not seed_defaults:
            db.commit()
            return

        # Seed only missing dictionary entries; never clear user data.
        status_names = {"todo": "К выполнению", "in_progress": "В работе", "hold done": "Ожидает подтверждения", "done": "Выполнено", "wasted": "Просрочено"}
        for code, name in status_names.items():
            if not db.query(TaskStatus).filter_by(code=code).first():
                db.add(TaskStatus(code=code, name=name))
        for name in ("SoftSkills", "HardSkills", "Creativity", "Management"):
            if not db.query(Tag).filter_by(name=name).first():
                db.add(Tag(name=name))
        for code in ("bonus1", "bonus2", "bonus3"):
            if not db.query(RewardType).filter_by(code=code).first():
                db.add(RewardType(code=code, name=code))
        commit_checked(db)

        # Explicit first-admin bootstrap; never reset an existing account.
        import os
        email = (os.getenv("BOOTSTRAP_ADMIN_EMAIL") or "").strip()
        password = os.getenv("BOOTSTRAP_ADMIN_PASSWORD") or ""
        if email and password and not db.query(User).filter_by(email=email).first():
            from schemas import UserCreate
            payload = UserCreate(first_name="Администратор", last_name="Системы", username=os.getenv("BOOTSTRAP_ADMIN_USERNAME") or "admin", email=email, password=password)
            if db.query(User).filter_by(username=payload.username).first():
                raise ValueError("Bootstrap username is already in use")
            db.add(User(first_name=payload.first_name, last_name=payload.last_name, username=payload.username, email=str(payload.email), password_hash=get_password_hash(payload.password), role="admin"))
            commit_checked(db)
