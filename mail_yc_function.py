"""POST на Cloud Function: .env YC_MAIL_FUNCTION_URL, опционально YC_MAIL_FUNCTION_API_KEY."""

import json
import logging
import os
import threading
from typing import Any, Optional

import requests

logger = logging.getLogger(__name__)


class MailFunctionError(RuntimeError):
    pass


def invoke_mail_function(
    *,
    to_email: str,
    subject: str,
    message: str,
    html: Optional[str] = None,
    sender: Optional[str] = None,
    timeout_seconds: float = 30.0,
) -> dict[str, Any]:
    url = (os.getenv("YC_MAIL_FUNCTION_URL") or "").strip()
    if not url:
        raise MailFunctionError("YC_MAIL_FUNCTION_URL не задан")

    payload: dict[str, Any] = {"to": to_email.strip(), "subject": subject, "message": message}
    if html is not None:
        payload["html"] = html
    if sender:
        payload["from"] = sender.strip()

    headers = {"Content-Type": "application/json"}
    key = (os.getenv("YC_MAIL_FUNCTION_API_KEY") or "").strip()
    if key:
        headers["Authorization"] = f"Api-Key {key}"

    logger.info("Mail request started")
    try:
        r = requests.post(url, json=payload, headers=headers, timeout=timeout_seconds)
    except requests.RequestException as exc:
        logger.warning("Mail transport failed: %s", type(exc).__name__)
        raise MailFunctionError("Почтовый сервис временно недоступен") from exc
    logger.info("Mail response received: status=%s", r.status_code)
    if r.status_code >= 400:
        raise MailFunctionError("Ошибка почтового сервиса")

    try:
        data = r.json()
    except json.JSONDecodeError:
        logger.info("Mail service returned a non-JSON success response")
        return {"accepted": True}

    if not isinstance(data, dict):
        raise MailFunctionError("Некорректный ответ почтового сервиса")
    status_code = data.get("statusCode", r.status_code)
    try:
        status_code = int(status_code)
    except (TypeError, ValueError):
        raise MailFunctionError("Некорректный ответ почтового сервиса") from None
    if not 200 <= status_code < 300:
        raise MailFunctionError("Ошибка почтового сервиса")
    logger.info("Mail request completed")
    return data


def schedule_task_assigned_email(to_email: str, title: str, due_str: str, status_name: str) -> None:
    """Почта в daemon-потоке (стабильнее, чем FastAPI BackgroundTasks при uvicorn --workers > 1)."""
    threading.Thread(
        target=send_task_assigned_email,
        args=(to_email, title, due_str, status_name),
        daemon=True,
    ).start()


def send_task_assigned_email(to_email: str, title: str, due_str: str, status_name: str) -> None:
    """Send asynchronously scheduled mail without logging personal content."""
    if not (os.getenv("YC_MAIL_FUNCTION_URL") or "").strip():
        logger.warning("mail[task]: пропуск — YC_MAIL_FUNCTION_URL не задан")
        return
    subject = f"Новая задача: {title}"
    body = f"Вам назначена задача «{title}».\nСрок: {due_str}\nСтатус: {status_name}"
    try:
        invoke_mail_function(to_email=to_email, subject=subject, message=body)
    except Exception as e:
        logger.warning("Mail delivery failed: %s", type(e).__name__)
