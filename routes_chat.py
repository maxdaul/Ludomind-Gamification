from database import utc_naive, commit_checked, validate_period, validate_assignment, task_reason, reward_task_id, adjust_task_score, analyze_for_api, create_validated_task, SYSTEM_STATUSES
import hashlib
import json
import re  # Импорт модуля для работы с регулярными выражениями
import sys
from typing import Optional, List  # Импорт типов для аннотаций: Optional (опциональное значение) и List (список)
from datetime import datetime, timedelta, timezone  # Импорт класса datetime для работы с датами и временем
from fastapi import APIRouter, Depends, HTTPException  # Импорт компонентов FastAPI: роутер, зависимости и исключения
from sqlalchemy.orm import Session  # Импорт сессии SQLAlchemy для работы с базой данных
from jose import JWTError, jwt
from auth import ALGORITHM, SECRET_KEY
from pydantic import BaseModel, Field, model_validator  # Импорт базового класса для создания моделей данных с валидацией
import requests  # Импорт библиотеки для HTTP-запросов
from ml.ai_analyzer import analyze_task_with_commands, YandexRateLimitError, \
    YandexAPIError  # Импорт функций анализа задач и исключений AI-сервиса
from db import get_db
from database import lock_managed_employees, override_task_analysis, require_employee_access
from database import User, Task, TaskStatus, Tag, TaskTag, \
    Competition  # Импорт моделей базы данных: пользователь, задача, статус, тег, связь задачи с тегом, соревнование
from schemas import TaskResponse  # Импорт схемы ответа для задачи
from dependencies import get_current_user, require_manager  # Импорт функции для получения текущего авторизованного пользователя
from mail_yc_function import schedule_task_assigned_email

router = APIRouter()  # Создание роутера для группировки эндпоинтов


PREVIEW_AUDIENCE = "task-analysis-preview"


class TaskAnalysisInput(BaseModel):
    title: str = Field(min_length=1, max_length=500)
    description: str = Field(min_length=1, max_length=10000)

    @model_validator(mode="after")
    def validate_text(self):
        if not self.title.strip() or not self.description.strip():
            raise ValueError("Укажите название и описание задачи")
        return self


def task_text_digest(title: str, description: str) -> str:
    encoded = json.dumps([title, description], ensure_ascii=False).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


@router.post("/task-analysis")
def preview_task_analysis(payload: TaskAnalysisInput, current_user: dict = Depends(require_manager)):
    analysis = analyze_for_api(payload.title, payload.description)
    receipt = jwt.encode({
        "aud": PREVIEW_AUDIENCE,
        "sub": str(current_user["user"].id),
        "exp": datetime.now(timezone.utc) + timedelta(minutes=30),
        "text_digest": task_text_digest(payload.title, payload.description),
        "analysis": analysis,
    }, SECRET_KEY, algorithm=ALGORITHM)
    return {"analysis": analysis, "receipt": receipt}


def confirmed_analysis(chat, actor):
    if not chat.analysis_receipt:
        return analyze_for_api(chat.title, chat.description)
    try:
        claims = jwt.decode(chat.analysis_receipt, SECRET_KEY, algorithms=[ALGORITHM],
                            audience=PREVIEW_AUDIENCE, subject=str(actor.id),
                            options={"require_exp": True, "require_aud": True, "require_sub": True})
    except JWTError:
        raise HTTPException(422, "Оценка устарела. Получите её заново.") from None
    if claims["text_digest"] != task_text_digest(chat.title, chat.description):
        raise HTTPException(422, "Текст задачи изменился. Получите оценку заново.")
    return claims["analysis"]


class ChatMessage(BaseModel):  # Определение модели данных для входящего сообщения чата
    message: str | None = Field(default=None, min_length=1, max_length=10000)
    title: str | None = Field(default=None, min_length=1, max_length=500)
    description: str | None = Field(default=None, min_length=1, max_length=10000)

    analysis_receipt: str | None = Field(default=None, min_length=1, max_length=16000)
    estimated_points: int | None = Field(default=None, ge=1, le=100, strict=True)

    @model_validator(mode="after")
    def validate_task_input(self):
        if self.title is None and self.description is None:
            if self.message is None:
                raise ValueError("Укажите сообщение или название и описание задачи")
            if self.analysis_receipt is not None or self.estimated_points is not None:
                raise ValueError("Предварительная и ручная оценки доступны при создании по форме")
        elif self.message is not None or not (self.title or "").strip() or not (self.description or "").strip():
            raise ValueError("Укажите название и описание задачи без поля message")
        return self

    user_ids: Optional[List[
        int]] = None  # Опциональный список ID пользователей, для которых создается задача (если None, то для текущего пользователя)
    due_date: Optional[
        datetime] = None  # Опциональная дата выполнения задачи, передаётся клиентом (например, из календаря на фронтенде)
    competition_id: Optional[int] = None  # ID соревнования, для которого создаётся задача (с страницы менеджера)
    tag_ids: Optional[List[int]] = None  # ID тегов из таблицы tags для привязки к задаче через task_tags (с страницы менеджера)



class ChatResponse(BaseModel):  # Определение модели данных для ответа чата
    reply: str  # Текст ответа от AI или системы
    task_created: TaskResponse | None = None  # Опциональный объект созданной задачи (если задача была создана)


@router.post("/api/chat", response_model=ChatResponse)  # Регистрация POST-эндпоинта /api/chat с указанием модели ответа
@router.post("/chat",
             response_model=ChatResponse)  # Регистрация альтернативного POST-эндпоинта /chat с указанием модели ответа
def chat_with_ai(  # Определение функции обработки запроса на создание задачи через чат
        chat: ChatMessage,  # Параметр: входящее сообщение чата (валидируется через Pydantic)
        current_user: dict = Depends(get_current_user),
        db: Session = Depends(get_db)  # Параметр: сессия базы данных (получается через зависимость)
):
    """
    Принимает естественный язык и создаёт задачу.
    Пример: "Создай задачу 'Купить фрукты' на 12.12.2025, статус В работе, тег срочно"
    """
    actor = current_user["user"]
    if chat.title is not None and actor.role not in ("admin", "manager"):
        raise HTTPException(403, "Создание по форме доступно руководителю")
    requested_users = list(dict.fromkeys(chat.user_ids or [actor.id]))
    if len(requested_users) > 100:
        raise HTTPException(400, "За один запрос можно назначить не более 100 исполнителей")
    if actor.role not in ("admin", "manager") and requested_users != [actor.id]:
        raise HTTPException(403, "Нельзя назначать задачи другим пользователям")
    for user_id in requested_users:
        target = db.query(User).filter_by(id=user_id).first()
        if not target:
            raise HTTPException(404, "Исполнитель не найден")
        require_employee_access(actor, target, allow_self=actor.role == "user")
        validate_assignment(db, user_id, chat.competition_id, chat.due_date)
    for tag_id in chat.tag_ids or []:
        if not db.query(Tag).filter_by(id=tag_id).first():
            raise HTTPException(400, "Тег не найден")
    statuses = [{"code": s.code, "name": s.name} for s in db.query(
        TaskStatus).all()]  # Получение всех статусов задач из БД и преобразование в список словарей с кодом и названием
    tags = [t.name for t in db.query(Tag).all()]  # Получение всех тегов из БД и преобразование в список названий

    try:  # Начало блока обработки исключений при обращении к AI
        if chat.title is not None:
            analysis = confirmed_analysis(chat, actor)
            if chat.estimated_points is not None and chat.estimated_points != analysis["estimated_points"]:
                analysis = override_task_analysis(analysis, chat.estimated_points)
            ai_response = {
                "reply": "",
                "commands": [{"action": "create_task", "task_data": {
                    "title": chat.title,
                    "description": chat.description,
                    "status_code": "todo",
                    "estimated_points": analysis["estimated_points"],
                    "ai_analysis_metadata": analysis,
                }}],
            }
        else:
            ai_response = analyze_task_with_commands(
                user_message=chat.message,
                available_statuses=statuses,
                available_tags=tags,
            )
    except YandexRateLimitError as e:  # Обработка исключения превышения лимита запросов к Yandex API
        # Специальная обработка ошибки rate limit - пробрасываем HTTP 429
        # Это позволит тестам фиксировать ошибку
        raise HTTPException(  # Выброс HTTP-исключения с кодом 429 (Too Many Requests)
            status_code=429,  # Установка HTTP-кода статуса 429
            detail="Слишком много запросов к AI. Пожалуйста, подождите несколько секунд и попробуйте снова."
            # Сообщение об ошибке для пользователя
        )
    except YandexAPIError as e:  # Обработка других ошибок Yandex Cloud API
        # Обработка других ошибок Yandex Cloud API
        raise HTTPException(  # Выброс HTTP-исключения с кодом 503 (Service Unavailable)
            status_code=503,  # Установка HTTP-кода статуса 503
            detail="Сервис оценки задач временно недоступен"  # Сообщение об ошибке с деталями исключения
        )
    except requests.exceptions.HTTPError as e:  # Обработка HTTP-ошибок из библиотеки requests (на случай если они не были перехвачены)
        # Обработка других HTTP ошибок (на случай если они не были перехвачены)
        if e.response.status_code == 429:  # Проверка, является ли ошибка превышением лимита запросов
            raise HTTPException(  # Выброс HTTP-исключения с кодом 429
                status_code=429,  # Установка HTTP-кода статуса 429
                detail="Слишком много запросов к AI. Пожалуйста, подождите несколько секунд и попробуйте снова."
                # Сообщение об ошибке
            )
        raise HTTPException(  # Выброс HTTP-исключения с кодом 500 для других HTTP-ошибок
            status_code=500,  # Установка HTTP-кода статуса 500 (Internal Server Error)
            detail="Сервис оценки задач временно недоступен"  # Сообщение об ошибке с деталями
        )
    except HTTPException:
        raise
    except Exception as e:  # Обработка всех остальных неожиданных исключений
        # Обработка всех остальных ошибок
        raise HTTPException(  # Выброс HTTP-исключения с кодом 500
            status_code=500,  # Установка HTTP-кода статуса 500
            detail="Не удалось обработать запрос. Повторите позже."  # Сообщение об общей внутренней ошибке с деталями
        )

    if not ai_response.get(
            "commands"):  # Проверка наличия команд в ответе AI (если команд нет, значит AI просто ответил, но не создал задачу)
        return ChatResponse(reply=ai_response["reply"])  # Возврат ответа только с текстом от AI, без создания задачи

    cmd = ai_response["commands"][0]  # Извлечение первой команды из списка команд (обычно команда создания задачи)
    if cmd.get("action") != "create_task":  # Проверка, что действие команды - создание задачи
        return ChatResponse(
            reply="Я пока умею только создавать задачи.")  # Возврат сообщения, если команда не для создания задачи

    task_data = cmd.get("task_data", {})  # Извлечение данных задачи из команды (словарь с полями задачи)
    title = str(task_data.get("title",
                              "")).strip()  # Получение названия задачи, преобразование в строку и удаление пробелов по краям
    if not title:  # Проверка, что название задачи не пустое
        return ChatResponse(
            reply="Не удалось определить название задачи.")  # Возврат ошибки, если название не определено

    if len(title) > 500:
        raise HTTPException(422, "Название задачи не должно превышать 500 символов")

    status_code = str(task_data.get("status_code",
                                    "todo")).strip()  # Получение кода статуса задачи (по умолчанию "todo"), преобразование в строку и удаление пробелов
    if status_code in ("done", "hold done", "wasted"):
        status_code = "todo"
    status_obj = db.query(TaskStatus).filter(
        TaskStatus.code == status_code).first()  # Поиск объекта статуса в БД по коду
    if not status_obj:  # Проверка, найден ли статус в БД
        fallback_status = db.query(
            TaskStatus).first()  # Получение первого доступного статуса из БД как запасной вариант
        if fallback_status:  # Проверка, есть ли хотя бы один статус в БД
            status_obj = fallback_status  # Использование первого найденного статуса
        else:  # Если в БД нет ни одного статуса
            status_obj = TaskStatus(code="todo", name="К выполнению")  # Создание нового статуса по умолчанию
            db.add(status_obj)  # Добавление статуса в сессию БД
            commit_checked(db)  # Сохранение изменений в БД
            db.refresh(status_obj)  # Обновление объекта статуса из БД (получение ID)

    # Дата выполнения задачи теперь всегда должна приходить явно от клиента (например, из календаря),
    # мы больше не используем и не парсим дату из текста команды AI.
    due_date = chat.due_date

    # Нормализуем дату: если она с таймзоной (offset-aware), переводим в UTC и делаем naive,
    # чтобы можно было корректно сравнивать с датами соревнований из БД (которые без таймзоны).
    if due_date and isinstance(due_date, datetime) and due_date.tzinfo is not None:
        due_date = due_date.astimezone(timezone.utc).replace(tzinfo=None)

    if not due_date:  # Проверка наличия даты выполнения задачи
        return ChatResponse(  # Возврат ответа с ошибкой, если дата не указана
            reply="Дата выполнения задачи не указана. Пожалуйста, выберите дату в календаре и повторите запрос."
        )

    description = str(task_data.get("description",
                                    "")).strip()  # Получение описания задачи, преобразование в строку и удаление пробелов по краям

    if len(description) > 10000:
        raise HTTPException(422, "Описание задачи не должно превышать 10000 символов")

    normalized_title = re.sub(r"\s+", " ",
                              title.lower())  # Нормализация названия: приведение к нижнему регистру и замена множественных пробелов одним
    normalized_desc = re.sub(r"\s+", " ",
                             description.lower())  # Нормализация описания: приведение к нижнему регистру и замена множественных пробелов одним

    banned_fragments = [  # Определение списка запрещенных фрагментов текста
        "покур", "раскур", "курить", "курев", "сигарет", "кальян",  # Слова, связанные с курением
    ]
    if any(frag in normalized_title or frag in normalized_desc for frag in
           banned_fragments):  # Проверка наличия запрещенных фрагментов в названии или описании
        return ChatResponse(  # Возврат ответа с ошибкой, если найдены запрещенные слова
            reply=(
                    ai_response.get("reply", "")  # Получение ответа от AI
                    + " Я не могу создавать задачи, связанные с курением или подобными действиями. "  # Добавление сообщения о запрете
                      "Пожалуйста, переформулируйте запрос в безопасном и рабочем контексте."
            # Добавление инструкции по переформулировке
            ).strip()  # Удаление лишних пробелов
        )

    if not description:  # Проверка наличия описания задачи (не пустое ли оно)
        return ChatResponse(  # Возврат ответа с ошибкой, если описание отсутствует
            reply=(
                    ai_response.get("reply", "")  # Получение ответа от AI
                    + " Описание задачи отсутствует или получилось пустым. "  # Добавление сообщения об отсутствии описания
                      "Пожалуйста, добавьте краткое, понятное описание: что именно нужно сделать и к какому результату прийти."
            # Добавление инструкции по заполнению описания
            ).strip()  # Удаление лишних пробелов
        )

    if normalized_desc == normalized_title and len(
            normalized_desc.split()) <= 3 and chat.title is None and ai_response.get("model_used") != "disabled":  # Проверка, что описание не отличается от названия и содержит не более 3 слов
        return ChatResponse(  # Возврат ответа с ошибкой, если описание слишком короткое и повторяет заголовок
            reply=(
                    ai_response.get("reply", "")  # Получение ответа от AI
                    + " Описание задачи слишком короткое и повторяет заголовок. "  # Добавление сообщения о недостаточности описания
                      "Пожалуйста, уточните, что именно нужно сделать, где и к какому результату прийти."
            # Добавление инструкции по уточнению описания
            ).strip()  # Удаление лишних пробелов
        )

    ai_analysis = task_data["ai_analysis_metadata"]
    estimated_points = ai_analysis["estimated_points"]

    user_ids_to_create = requested_users

    users = db.query(User).filter(
        User.id.in_(user_ids_to_create)).all()  # Получение всех пользователей из БД по списку ID
    if len(users) != len(user_ids_to_create):  # Проверка, что все указанные пользователи найдены в БД
        return ChatResponse(
            reply="Один или несколько указанных пользователей не найдены.")  # Возврат ошибки, если не все пользователи найдены

    # Проверка, что дата выполнения задачи находится в рамках дедлайна соревнования (если передан competition_id)
    competition_id = chat.competition_id
    if competition_id and due_date:
        competition = db.query(Competition).filter(Competition.id == competition_id).first()
        if competition:
            if due_date < competition.start_date or due_date > competition.end_date:
                return ChatResponse(
                    reply=(
                        ai_response.get("reply", "")
                        + f" Дата выполнения задачи ({due_date.strftime('%d.%m.%Y') if isinstance(due_date, datetime) else str(due_date)}) выходит за рамки "
                        f"соревнования «{competition.title}» (с {competition.start_date.strftime('%d.%m.%Y')} "
                        f"по {competition.end_date.strftime('%d.%m.%Y')}). "
                        "Пожалуйста, укажите дату в пределах периода соревнования."
                    ).strip()
                )

    lock_managed_employees(db, actor, requested_users)
    created_tasks = []  # Инициализация списка созданных задач
    attached_tags = []  # Инициализация списка прикрепленных тегов

    for user_id in user_ids_to_create:  # Перебор всех пользователей, для которых создается задача
        new_task = Task(  # Создание нового объекта задачи
            user_id=user_id,  # Установка ID пользователя-владельца задачи
            competition_id=competition_id,  # ID соревнования (со страницы менеджера)
            status_id=status_obj.id,  # Установка ID статуса задачи
            title=title,  # Установка названия задачи
            description=description,  # Установка описания задачи
            estimated_points=estimated_points,  # Установка оценки сложности задачи
            ai_analysis_metadata=ai_analysis,  # Установка метаданных анализа AI
            due_date=due_date,  # Установка даты выполнения задачи
            awarded_points=0  # Установка начисленных баллов (по умолчанию 0)
        )
        db.add(new_task)  # Добавление задачи в сессию БД
        db.flush()  # Принудительная отправка SQL-запроса в БД для получения ID задачи (без коммита)

        for tag_name in task_data.get("tags", []):  # Перебор всех тегов из данных команды
            if not isinstance(tag_name, str) or not tag_name.strip():  # Проверка, что тег - непустая строка
                continue  # Пропуск некорректных тегов
            tag_name = tag_name.strip()  # Удаление пробелов по краям названия тега
            tag = db.query(Tag).filter(Tag.name == tag_name).first()  # Поиск тега в БД по названию
            if not tag:  # Проверка, существует ли тег в БД
                tag = Tag(name=tag_name)  # Создание нового тега, если его нет
                db.add(tag)  # Добавление тега в сессию БД
                db.flush()  # Принудительная отправка SQL-запроса для получения ID тега
            existing = db.query(TaskTag).filter(  # Поиск существующей связи задачи с тегом
                TaskTag.task_id == new_task.id,  # Фильтр по ID задачи
                TaskTag.tag_id == tag.id  # Фильтр по ID тега
            ).first()
            if not existing:  # Проверка, что связь еще не существует
                db.add(TaskTag(task_id=new_task.id, tag_id=tag.id))  # Создание связи задачи с тегом
                if tag_name not in attached_tags:  # Проверка, что тег еще не добавлен в список
                    attached_tags.append(tag_name)  # Добавление названия тега в список для отчета

        # Привязка тегов по ID от клиента (например, с страницы менеджера)
        for tag_id in (chat.tag_ids or []):  # Перебор переданных ID тегов
            tag = db.query(Tag).filter(Tag.id == tag_id).first()  # Поиск тега в БД
            if not tag:  # Пропуск несуществующего тега
                continue
            existing = db.query(TaskTag).filter(
                TaskTag.task_id == new_task.id, TaskTag.tag_id == tag.id
            ).first()
            if not existing:  # Проверка, что связь еще не существует
                db.add(TaskTag(task_id=new_task.id, tag_id=tag.id))  # Создание связи задачи с тегом
                if tag.name not in attached_tags:
                    attached_tags.append(tag.name)

        created_tasks.append(new_task)  # Добавление созданной задачи в список

    commit_checked(db)  # Сохранение всех изменений в БД (задачи, теги, связи)

    for task in created_tasks:  # Перебор всех созданных задач
        db.refresh(task)  # Обновление объектов задач из БД (получение актуальных данных, включая ID)

    by_id = {u.id: u for u in users}
    for task in created_tasks:
        user = by_id.get(task.user_id)
        if user and user.email:
            due_str = task.due_date.strftime("%d.%m.%Y") if task.due_date else "—"
            schedule_task_assigned_email(user.email, task.title, due_str, status_obj.name)

    reply = f" Задача «{title}» создана"  # Начало формирования ответа с названием задачи
    if len(created_tasks) > 1:  # Проверка, создана ли задача для нескольких пользователей
        reply += f" для {len(created_tasks)} пользователей"  # Добавление информации о количестве пользователей
    if due_date:  # Проверка наличия даты выполнения
        reply += f" Срок: {due_date}."  # Добавление информации о сроке выполнения
    if attached_tags:  # Проверка наличия прикрепленных тегов
        reply += f" Теги: {', '.join(attached_tags)}."  # Добавление списка тегов через запятую
    reply += f" Статус: {status_obj.name}."  # Добавление информации о статусе задачи

    first_task = created_tasks[
        0] if created_tasks else None  # Получение первой созданной задачи (или None, если задач нет)

    return ChatResponse(  # Возврат ответа с результатом создания задачи
        reply=ai_response["reply"] + " " + reply,  # Объединение ответа AI с информацией о созданной задаче
        task_created=TaskResponse.from_orm(first_task) if first_task else None
        # Преобразование первой задачи в схему ответа (или None)
    )
