"""Periodic deadline emails using the application mail transport."""

import logging
import os
import time
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from sqlalchemy import or_
from sqlalchemy.orm import aliased

from database import Task, TaskDeadlineNotification, TaskStatus, User
from db import SessionLocal
from mail_yc_function import MailFunctionError, invoke_mail_function

logger = logging.getLogger(__name__)
REMINDER_WINDOW = timedelta(hours=24)
RETRY_DELAY = timedelta(minutes=15)
CHECK_INTERVAL_SECONDS = 60
FINISHED_STATUSES = ("done", "hold done")


def pending_tasks(db, kind, now):
    query = db.query(Task).join(TaskStatus, Task.status_id == TaskStatus.id).filter(
        Task.due_date.is_not(None), TaskStatus.code.not_in(FINISHED_STATUSES),
    )
    if kind == "reminder":
        return query.filter(Task.due_date > now, Task.due_date <= now + REMINDER_WINDOW)
    manager = aliased(User)
    return (query.join(User, Task.user_id == User.id).join(manager, User.manager_id == manager.id)
            .filter(Task.due_date <= now, User.role == "user", manager.role == "manager"))


def deliver(db, task_id, kind, now):
    # Serialize attempts for the same task across workers and recheck its current status and deadline.
    if not db.query(Task.id).filter_by(id=task_id).with_for_update().scalar():
        return
    task = pending_tasks(db, kind, now).filter(Task.id == task_id).first()
    if task is None:
        return
    key = (task.id, kind, task.due_date)
    record = db.get(TaskDeadlineNotification, key)
    if record and (record.sent_at or (record.retry_after and record.retry_after > now)):
        return

    employee = db.get(User, task.user_id)
    due = task.due_date.replace(tzinfo=timezone.utc).astimezone(ZoneInfo("Asia/Irkutsk"))
    due_text = due.strftime("%d.%m.%Y %H:%M (Иркутск)")
    if kind == "reminder":
        recipient = employee
        subject = f"Приближается срок задачи: {task.title}"
        message = f"Задача «{task.title}». Срок выполнения: {due_text}."
    else:
        recipient = db.get(User, employee.manager_id) if employee.manager_id else None
        if not recipient or recipient.role != "manager":
            return
        subject = f"Просрочена задача: {task.title}"
        message = f"Задача «{task.title}», исполнитель: {employee.first_name} {employee.last_name}. Срок истёк: {due_text}."

    if record is None:
        record = TaskDeadlineNotification(task_id=task.id, kind=kind, due_date=task.due_date)
        db.add(record)
    try:
        invoke_mail_function(to_email=recipient.email, subject=subject, message=message, timeout_seconds=10)
    except MailFunctionError:
        record.retry_after = now + RETRY_DELAY
        logger.warning("Deadline mail failed; attempt deferred (task_id=%s kind=%s)", task.id, kind)
    else:
        record.sent_at = now
        record.retry_after = None


def run_once(now=None):
    now = now or datetime.now(timezone.utc).replace(tzinfo=None)
    for kind in ("reminder", "overdue"):
        with SessionLocal() as db:
            previous = db.query(TaskDeadlineNotification).filter(
                TaskDeadlineNotification.task_id == Task.id,
                TaskDeadlineNotification.kind == kind,
                TaskDeadlineNotification.due_date == Task.due_date,
                or_(TaskDeadlineNotification.sent_at.is_not(None), TaskDeadlineNotification.retry_after > now),
            ).exists()
            candidates = (pending_tasks(db, kind, now).filter(~previous)
                          .with_entities(Task.id).order_by(Task.due_date, Task.id).limit(50).all())
        for (task_id,) in candidates:
            with SessionLocal.begin() as db:
                deliver(db, task_id, kind, now)


def main():
    logging.basicConfig(level=logging.INFO)
    if not (os.getenv("YC_MAIL_FUNCTION_URL") or "").strip():
        logger.info("Deadline mail is idle: YC_MAIL_FUNCTION_URL is empty")
    else:
        logger.info("Deadline mail started; checking every %s seconds", CHECK_INTERVAL_SECONDS)
    while True:
        if (os.getenv("YC_MAIL_FUNCTION_URL") or "").strip():
            try:
                run_once()
            except Exception as exc:
                logger.error("Deadline check failed: %s", type(exc).__name__)
        time.sleep(CHECK_INTERVAL_SECONDS)


if __name__ == "__main__":
    main()
