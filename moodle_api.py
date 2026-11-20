import logging
import os
import re
from typing import Any, Literal, NamedTuple, Optional, Tuple

import httpx

logger = logging.getLogger(__name__)


class MoodleAPIError(Exception):
    """Ошибка обращения к Moodle Web Services."""

    def __init__(self, message: str, *, code: str = ""):
        super().__init__(message)
        self.code = code


def _reject_moodle_exception(body):
    if isinstance(body, dict) and (body.get("exception") or body.get("errorcode")):
        code = body.get("errorcode")
        safe_code = code if isinstance(code, str) and re.fullmatch(r"[a-zA-Z0-9_]{1,80}", code) else "unknown"
        raise MoodleAPIError("Moodle отклонил запрос", code=safe_code)


def _moodle_post(function: str, data: dict, *, allow_empty: bool = False):
    url, token = _moodle_config()
    if not url or not token:
        raise MoodleAPIError("Moodle не настроен")
    try:
        with httpx.Client(timeout=12.0) as client:
            response = client.post(url, data={**data, "wstoken": token, "wsfunction": function, "moodlewsrestformat": "json"})
            response.raise_for_status()
    except httpx.HTTPError:
        logger.warning("Moodle request failed function=%s", function)
        raise MoodleAPIError("Не удалось выполнить запрос к Moodle") from None
    if allow_empty and not response.content.strip():
        return None
    try:
        body = response.json()
    except ValueError:
        raise MoodleAPIError("Некорректный ответ Moodle") from None
    _reject_moodle_exception(body)
    return body


def _moodle_config() -> Tuple[str, str]:
    url = (os.getenv("MOODLE_WS_URL") or os.getenv("MOODLE_WS_URL_DEFAULT") or "").strip()
    token = (os.getenv("MOODLE_WS_TOKEN") or "").strip()
    return url, token


def moodle_sync_enabled() -> bool:
    url, token = _moodle_config()
    return bool(url and token)


def moodle_username_from_email(email: str) -> str:
    """Логин Moodle: допустимые символы, без пробелов; из email."""
    s = email.lower().strip()
    s = s.replace("@", "_").replace(".", "_")
    s = re.sub(r"[^a-z0-9_.-]", "_", s)
    s = re.sub(r"_+", "_", s).strip("_")
    if not s:
        s = "user"
    return s[:100]


def register_user_in_moodle(
    *,
    username: str,
    email: str,
    password: str,
    first_name: str,
    last_name: str,
) -> Optional[int]:
    """
    POST на Moodle REST server.php. Параметры как у core_user_create_users.
    Поле users[0][username] в Moodle совпадает с username в локальной БД.
    Ничего не делает, если MOODLE_WS_URL или MOODLE_WS_TOKEN не заданы.
    Возвращает id пользователя в Moodle или None, если синхронизация отключена.
    """
    url, token = _moodle_config()
    if not url or not token:
        return None

    data = {
        "wstoken": token,
        "wsfunction": "core_user_create_users",
        "moodlewsrestformat": "json",
        "users[0][username]": username,
        "users[0][password]": password,
        "users[0][firstname]": first_name,
        "users[0][lastname]": last_name,
        "users[0][email]": email,
    }

    try:
        with httpx.Client(timeout=30.0) as client:
            response = client.post(url, data=data)
    except httpx.HTTPError as e:
        logger.exception("Moodle HTTP error: %s", e)
        raise MoodleAPIError("Не удалось выполнить запрос к Moodle") from e

    if response.status_code >= 400:
        raise MoodleAPIError(
            f"Moodle HTTP {response.status_code}: {response.text[:500]}"
        )

    try:
        body: Any = response.json()
    except ValueError as e:
        raise MoodleAPIError(f"Некорректный ответ Moodle: {response.text[:200]}") from e

    if isinstance(body, dict) and body.get("exception"):
        msg = body.get("message") or str(body)
        raise MoodleAPIError(msg)

    if isinstance(body, list) and body:
        first = body[0]
        if isinstance(first, dict) and first.get("exception"):
            raise MoodleAPIError(first.get("message") or str(first))
        if isinstance(first, dict):
            raw_id = first.get("id")
            if raw_id is None:
                raise MoodleAPIError("Moodle не вернул id созданного пользователя")
            try:
                return int(raw_id)
            except (TypeError, ValueError) as e:
                raise MoodleAPIError(f"Некорректный id в ответе Moodle: {raw_id!r}") from e

    raise MoodleAPIError(f"Неожиданный ответ Moodle: {body!r}")


def list_moodle_courses(*, course_id: int | None = None) -> list[dict[str, Any]]:
    """Каталог реальных курсов Moodle, при необходимости для одного ID."""
    fields = {"options[ids][0]": str(course_id)} if course_id is not None else {}
    body = _moodle_post("core_course_get_courses", fields)
    if not isinstance(body, list):
        raise MoodleAPIError(f"Неожиданный ответ Moodle: {body!r}")

    out: list[dict[str, Any]] = []
    for c in body:
        if not isinstance(c, dict) or c.get("format") == "site" or c.get("categoryid") in (0, "0"):
            # Moodle returns its Site home in core_course_get_courses as well.
            continue
        raw_id = c.get("id")
        if raw_id is None:
            continue
        try:
            cid = int(raw_id)
        except (TypeError, ValueError):
            continue
        out.append(
            {
                "id": cid,
                "fullname": str(c.get("fullname") or ""),
                "shortname": str(c.get("shortname") or ""),
            }
        )
    return out


class MoodleProgress(NamedTuple):
    percent: float | None
    done: int
    total: int
    course_completed: bool
    basis: Literal["course_criteria", "activities", "unavailable"]


def _parse_completion_counts(body: dict[str, Any]) -> MoodleProgress:
    cs = body.get("completionstatus")
    if not isinstance(cs, dict):
        raise MoodleAPIError("Moodle не вернул статус завершения курса")
    overall = cs.get("completed") in (1, True, "1", "true")
    completions = cs.get("completions")
    criteria = [item for item in completions if isinstance(item, dict)] if isinstance(completions, list) else []
    if not criteria:
        if overall:
            return MoodleProgress(100.0, 0, 0, True, "course_criteria")
        return MoodleProgress(None, 0, 0, False, "unavailable")
    done = sum(item.get("complete") in (1, True, "1", "true") for item in criteria)
    return MoodleProgress(round(100.0 * done / len(criteria), 1), done, len(criteria), overall, "course_criteria")


def list_moodle_user_courses(moodle_user_id: int) -> list[dict[str, Any]]:
    """core_enrol_get_users_courses — курсы, на которые зачислён пользователь Moodle."""
    body = _moodle_post("core_enrol_get_users_courses", {"userid": str(moodle_user_id)})
    if not isinstance(body, list):
        raise MoodleAPIError(f"Неожиданный ответ Moodle: {body!r}")

    out: list[dict[str, Any]] = []
    for c in body:
        if not isinstance(c, dict):
            continue
        raw_id = c.get("id")
        if raw_id is None:
            continue
        try:
            cid = int(raw_id)
        except (TypeError, ValueError):
            continue
        out.append(
            {
                "id": cid,
                "fullname": str(c.get("fullname") or ""),
                "shortname": str(c.get("shortname") or ""),
            }
        )
    return out


def moodle_completion_summary(moodle_user_id: int, course_id: int) -> MoodleProgress:
    fields = {"userid": str(moodle_user_id), "courseid": str(course_id)}
    try:
        body = _moodle_post("core_completion_get_course_completion_status", fields)
    except MoodleAPIError as error:
        if error.code not in {"nocriteriaset", "completionnotenabled"}:
            raise
    else:
        if not isinstance(body, dict):
            raise MoodleAPIError("Некорректный статус завершения курса")
        progress = _parse_completion_counts(body)
        if progress.basis != "unavailable":
            return progress

    try:
        body = _moodle_post("core_completion_get_activities_completion_status", fields)
    except MoodleAPIError as error:
        if error.code != "completionnotenabled":
            raise
        return MoodleProgress(None, 0, 0, False, "unavailable")
    if not isinstance(body, dict) or not isinstance(body.get("statuses"), list):
        raise MoodleAPIError("Некорректный статус активностей Moodle")
    states = [entry.get("state") for entry in body["statuses"]
              if isinstance(entry, dict) and entry.get("tracking") in (1, 2)]
    if not states:
        return MoodleProgress(None, 0, 0, False, "unavailable")
    done = sum(state in (1, 2) for state in states)
    return MoodleProgress(round(100.0 * done / len(states), 1), done, len(states), False, "activities")


def moodle_completion_pie_rows(moodle_user_id: int, course_id: int) -> list[dict[str, Any]]:
    progress = moodle_completion_summary(moodle_user_id, course_id)
    if progress.percent is None:
        return []
    return [{"Выполнено": progress.percent, "Осталось": round(100.0 - progress.percent, 1)}]


def moodle_enrolled_user_ids_with_capability(course_id: int, capability: str) -> list[int]:
    """
    core_enrol_get_enrolled_users с опцией withcapability — id пользователей, у которых в контексте курса
    есть указанная capability (например права преподавателя с редактированием).

    Требует у пользователя токена веб-сервиса Moodle права moodle/role:review в контексте курса
    (у типичного администратора сервиса это есть).
    """
    body = _moodle_post("core_enrol_get_enrolled_users", {
        "courseid": str(course_id),
        "options[0][name]": "withcapability",
        "options[0][value]": capability,
    })
    if not isinstance(body, list):
        raise MoodleAPIError(f"Неожиданный ответ Moodle: {body!r}")

    ids: list[int] = []
    for u in body:
        if not isinstance(u, dict):
            continue
        raw_id = u.get("id")
        if raw_id is None:
            continue
        try:
            ids.append(int(raw_id))
        except (TypeError, ValueError):
            continue
    return ids


MANUAL_ENROL_CAPABILITY = "enrol/manual:enrol"


def can_moodle_user_enrol(moodle_user_id: int, course_id: int) -> bool:
    return moodle_user_id in moodle_enrolled_user_ids_with_capability(course_id, MANUAL_ENROL_CAPABILITY)


def list_moodle_courses_for_editing_teacher(moodle_user_id: int) -> list[dict[str, Any]]:
    """Курсы, где текущему пользователю Moodle разрешено ручное зачисление."""
    filtered = []
    for course in list_moodle_courses():
        try:
            if can_moodle_user_enrol(moodle_user_id, course["id"]):
                filtered.append(course)
        except MoodleAPIError:
            logger.warning("Moodle enrolment permission check failed course_id=%s", course["id"])
    return filtered


def enrol_user_in_moodle_course(*, moodle_user_id: int, course_id: int) -> None:
    role_id = (os.getenv("MOODLE_STUDENT_ROLE_ID") or "5").strip()
    if not role_id.isdecimal() or int(role_id) < 1:
        raise MoodleAPIError("Некорректная роль учащегося", code="invalid_student_role")
    body = _moodle_post("enrol_manual_enrol_users", {
        "enrolments[0][roleid]": role_id,
        "enrolments[0][userid]": str(moodle_user_id),
        "enrolments[0][courseid]": str(course_id),
    }, allow_empty=True)
    if body is not None:
        raise MoodleAPIError("Неожиданный ответ о зачислении Moodle")
