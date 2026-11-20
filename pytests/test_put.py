import pytest
from jose import jwt
from datetime import datetime, timedelta, timezone
import uuid
from sqlalchemy import text
from auth import SECRET_KEY, ALGORITHM


def create_token(user_id: int, email: str, role: str = "user"):
    payload = {
        "sub": email,
        "user_id": user_id,
        "role": role,
        "exp": datetime.utcnow() + timedelta(hours=1)
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


from db import engine


def assign_test_manager(employee, manager):
    with engine.begin() as connection:
        connection.execute(text("UPDATE users SET manager_id = :manager WHERE id = :employee"),
                           {"manager":manager["user"]["id"], "employee":employee["user"]["id"]})


def unique_email():
    return f"test_{uuid.uuid4()}@example.com"


def unique_username():
    return "t" + uuid.uuid4().hex

@pytest.fixture
def registered_user(client):
    email = unique_email()
    password = "userpass"
    res = client.post("/register", json={
        "first_name": "User",
        "last_name": "Test",
        "username": unique_username(),
        "email": email,
        "password": password
    })
    user = res.json()
    login_res = client.post("/login", json={"email": email, "password": password})
    token = login_res.json()["access_token"]
    return {"user": user, "token": token}


@pytest.fixture
def registered_admin(client):
    email = unique_email()
    password = "adminpass"
    res = client.post("/register", json={
        "first_name": "Admin",
        "last_name": "Test",
        "username": unique_username(),
        "email": email,
        "password": password
    })
    user = res.json()
    from db import engine
    with engine.connect() as conn:
        conn.execute(text("UPDATE users SET role = 'admin' WHERE id = :user_id"), {"user_id": user["id"]})
        conn.commit()
    login_res = client.post("/login", json={"email": email, "password": password})
    token = login_res.json()["access_token"]
    return {"user": user, "token": token}


@pytest.fixture
def registered_manager(client):
    email = unique_email()
    password = "managerpass"
    res = client.post("/register", json={
        "first_name": "Manager",
        "last_name": "Test",
        "username": unique_username(),
        "email": email,
        "password": password
    })
    user = res.json()
    from db import engine
    with engine.connect() as conn:
        conn.execute(text("UPDATE users SET role = 'manager' WHERE id = :user_id"), {"user_id": user["id"]})
        conn.commit()
    login_res = client.post("/login", json={"email": email, "password": password})
    token = login_res.json()["access_token"]
    return {"user": user, "token": token}

@pytest.fixture
def sample_competition(client, registered_manager):
    headers = {"Authorization": f"Bearer {registered_manager['token']}"}
    comp = client.post("/competitions", json={
        "title": "PUT Test Comp",
        "description": "For PUT tests",
        "start_date": (datetime.now(timezone.utc) - timedelta(days=1)).isoformat(),
        "end_date": (datetime.now(timezone.utc) + timedelta(days=1)).isoformat()
    }, headers=headers).json()
    return comp


@pytest.fixture
def sample_task_status(client, registered_admin):
    headers = {"Authorization": f"Bearer {registered_admin['token']}"}
    status = client.post("/task-statuses", json={"code": "put_test", "name": "PUT Test"},
                        headers=headers).json()
    return status


@pytest.fixture
def sample_tag(client, registered_admin):
    headers = {"Authorization": f"Bearer {registered_admin['token']}"}
    tag = client.post("/tags", json={"name": "PUT Tag"}, headers=headers).json()
    return tag


@pytest.fixture
def sample_task(client, registered_user, sample_task_status):
    headers = {"Authorization": f"Bearer {registered_user['token']}"}
    task = client.post("/tasks", json={
        "title": "PUT Test Task",
        "status_id": sample_task_status["id"],
        "due_date": "2025-12-31T23:59:59"
    }, headers=headers).json()
    return task


@pytest.fixture
def sample_reward_type(client, registered_admin):
    headers = {"Authorization": f"Bearer {registered_admin['token']}"}
    rt = client.post("/reward-types", json={"code": "put_test", "name": "PUT Test Reward"},
                    headers=headers).json()
    return rt


@pytest.fixture
def sample_reward(client, registered_user, registered_admin, sample_reward_type):
    headers = {"Authorization": f"Bearer {registered_admin['token']}"}
    reward = client.post("/rewards", json={
        "user_id": registered_user["user"]["id"],
        "type_id": sample_reward_type["id"],
        "points_amount": 10,
        "reason": "PUT test reward"
    }, headers=headers).json()
    return reward



# Тесты
# /users/me
def test_update_own_user_success(client, registered_user):
    """
    Тест успешного обновления собственного профиля пользователем.
    Проверяет что пользователь может обновить свои данные через PUT /users/me.
    """
    headers = {"Authorization": f"Bearer {registered_user['token']}"}
    new_email = unique_email()
    response = client.put("/users/me", json={
        "email": new_email,
        "first_name": "Updated"
    }, headers=headers)
    assert response.status_code == 200
    data = response.json()
    assert data["email"] == new_email
    assert data["first_name"] == "Updated"


def test_update_own_user_duplicate_email(client, registered_user):
    """
    Тест обновления профиля с дублирующимся email.
    Проверяет что пользователь не может обновить свой email на уже существующий (400 Bad Request).
    """
    # Создаём второго пользователя
    other_email = unique_email()
    client.post("/register", json={
        "first_name": "Other",
        "last_name": "User",
        "username": unique_username(),
        "email": other_email,
        "password": "pass123"
    })
    # Пытаемся обновить email на существующий
    headers = {"Authorization": f"Bearer {registered_user['token']}"}
    response = client.put("/users/me", json={"email": other_email}, headers=headers)
    assert response.status_code == 400


# /admin/users/{id}

def test_update_user_by_admin(client, registered_admin, registered_user):
    """
    Тест обновления пользователя администратором.
    Проверяет что администратор может обновить данные любого пользователя через PUT /admin/users/{id}.
    """
    headers = {"Authorization": f"Bearer {registered_admin['token']}"}
    new_email = unique_email()  # ← Генерируем уникальный!
    response = client.put(f"/admin/users/{registered_user['user']['id']}", json={
        "role": "manager",
        "email": new_email  # Используем уникальный
    }, headers=headers)
    assert response.status_code == 200
    data = response.json()
    assert data["role"] == "manager"
    assert data["email"] == new_email


def test_update_user_by_non_admin_forbidden(client, registered_user):
    """
    Тест запрета обновления пользователя не-администратором.
    Проверяет что обычный пользователь не может обновлять других пользователей через админский эндпоинт (403 Forbidden).
    """
    headers = {"Authorization": f"Bearer {registered_user['token']}"}
    response = client.put("/admin/users/1", json={"email": "hacker@test.com"}, headers=headers)
    assert response.status_code == 403


def test_update_nonexistent_user_by_admin(client, registered_admin):
    """
    Тест обновления несуществующего пользователя администратором.
    Проверяет что при попытке обновить несуществующего пользователя возвращается 404 Not Found.
    """
    headers = {"Authorization": f"Bearer {registered_admin['token']}"}
    response = client.put("/admin/users/999999", json={"first_name": "Ghost"}, headers=headers)
    assert response.status_code == 404


# Назначение пользователя на соревнование через POST /participants
def test_assign_user_to_competition(client, registered_manager, registered_user, sample_competition):
    """
    Тест назначения пользователя на соревнование менеджером через POST /participants.
    После добавления в участники current_competition_id в GET /users/me совпадает с соревнованием.
    """
    assign_test_manager(registered_user, registered_manager)
    headers = {"Authorization": f"Bearer {registered_manager['token']}"}
    response = client.post("/participants", json={
        "competition_id": sample_competition["id"],
        "user_id": registered_user["user"]["id"]
    }, headers=headers)
    assert response.status_code == 201
    me = client.get("/users/me", headers={"Authorization": f"Bearer {registered_user['token']}"}).json()
    assert me["current_competition_id"] == sample_competition["id"]


def test_remove_user_from_competition(client, registered_manager, registered_user, sample_competition):
    """
    Тест снятия пользователя с соревнования менеджером через DELETE участника.
    """
    assign_test_manager(registered_user, registered_manager)
    headers_manager = {"Authorization": f"Bearer {registered_manager['token']}"}
    client.post("/participants", json={
        "competition_id": sample_competition["id"],
        "user_id": registered_user["user"]["id"]
    }, headers=headers_manager)
    response = client.delete(
        f"/participants/competition/{sample_competition['id']}/user/{registered_user['user']['id']}",
        headers=headers_manager
    )
    assert response.status_code == 204
    me = client.get("/users/me", headers={"Authorization": f"Bearer {registered_user['token']}"}).json()
    # После удаления единственного участия current_competition_id станет None
    assert me["current_competition_id"] is None


def test_assign_to_nonexistent_competition(client, registered_manager, registered_user):
    """
    Тест назначения пользователя на несуществующее соревнование через POST /participants.
    """
    headers = {"Authorization": f"Bearer {registered_manager['token']}"}
    response = client.post("/participants", json={
        "competition_id": 999999,
        "user_id": registered_user["user"]["id"]
    }, headers=headers)
    assert response.status_code == 404


# /task-statuses/{id}
def test_update_task_status_by_admin(client, registered_admin, sample_task_status):
    """
    Тест обновления статуса задачи администратором.
    Проверяет что администратор может обновить статус задачи через PUT /task-statuses/{id}.
    """
    headers = {"Authorization": f"Bearer {registered_admin['token']}"}
    new_code = "updated_put"
    response = client.put(f"/task-statuses/{sample_task_status['id']}", json={
        "code": new_code,
        "name": "Updated PUT"
    }, headers=headers)
    assert response.status_code == 200
    assert response.json()["code"] == new_code


def test_update_task_status_duplicate_code(client, registered_admin, sample_task_status):
    """
    Тест обновления статуса задачи с дублирующимся кодом.
    Проверяет что попытка обновить статус на уже существующий код возвращает 400 Bad Request.
    """
    # Создаём второй статус
    client.post("/task-statuses", json={"code": "conflict", "name": "Conflict"},
                headers={"Authorization": f"Bearer {registered_admin['token']}"})
    # Пытаемся обновить первый на код второго
    headers = {"Authorization": f"Bearer {registered_admin['token']}"}
    response = client.put(f"/task-statuses/{sample_task_status['id']}", json={
        "code": "conflict"
    }, headers=headers)
    assert response.status_code == 400


# /tags/{id}
def test_update_tag_by_admin(client, registered_admin, sample_tag):
    """
    Тест обновления тега администратором.
    Проверяет что администратор может обновить тег через PUT /tags/{id}.
    """
    headers = {"Authorization": f"Bearer {registered_admin['token']}"}
    new_name = "Updated PUT Tag"
    response = client.put(f"/tags/{sample_tag['id']}", json={"name": new_name}, headers=headers)
    assert response.status_code == 200
    assert response.json()["name"] == new_name


def test_update_tag_duplicate_name(client, registered_admin, sample_tag):
    """
    Тест обновления тега с дублирующимся именем.
    Проверяет что попытка обновить тег на уже существующее имя возвращает 400 Bad Request.
    """
    # Создаём второй тег
    client.post("/tags", json={"name": "conflict_tag"},
                headers={"Authorization": f"Bearer {registered_admin['token']}"})
    # Пытаемся обновить первый на имя второго
    headers = {"Authorization": f"Bearer {registered_admin['token']}"}
    response = client.put(f"/tags/{sample_tag['id']}", json={"name": "conflict_tag"}, headers=headers)
    assert response.status_code == 400


# /tasks/{id}
def test_update_task_success(client, registered_user, sample_task, sample_task_status):
    """
    Тест успешного обновления задачи владельцем.
    Проверяет что владелец задачи может обновить свою задачу через PUT /tasks/{id}.
    """
    headers = {"Authorization": f"Bearer {registered_user['token']}"}
    response = client.put(f"/tasks/{sample_task['id']}", json={
        "title": "Updated PUT Task",
        "description": "Updated description"
    }, headers=headers)
    assert response.status_code == 200
    data = response.json()
    assert data["title"] == "Updated PUT Task"
    assert data["description"] == "Updated description"


def test_user_submits_task_for_manager_confirmation(
    client, registered_user, sample_competition, registered_admin, registered_manager
):
    assign_test_manager(registered_user, registered_manager)
    admin_headers = {"Authorization": f"Bearer {registered_admin['token']}"}
    manager_headers = {"Authorization": f"Bearer {registered_manager['token']}"}
    user_headers = {"Authorization": f"Bearer {registered_user['token']}"}
    assert client.post("/participants", json={"competition_id": sample_competition["id"],
                       "user_id": registered_user["user"]["id"]}, headers=manager_headers).status_code == 201
    ids = {}
    for code in ("todo", "hold done", "done"):
        response = client.post("/task-statuses", json={"code": code, "name": code}, headers=admin_headers)
        assert response.status_code == 201
        ids[code] = response.json()["id"]
    task = client.post("/tasks", json={"title": "Task for confirmation", "status_id": ids["todo"],
                       "due_date": sample_competition["end_date"], "competition_id": sample_competition["id"]}, headers=user_headers)
    assert task.status_code == 201
    response = client.put(f"/tasks/{task.json()['id']}", json={"status_id": ids["done"]}, headers=user_headers)
    assert response.status_code == 200
    assert response.json()["status_id"] == ids["hold done"]


def test_update_task_nonexistent(client, registered_user):
    """
    Тест обновления несуществующей задачи.
    Проверяет что при попытке обновить несуществующую задачу возвращается 404 Not Found.
    """
    headers = {"Authorization": f"Bearer {registered_user['token']}"}
    response = client.put("/tasks/999999", json={"title": "Ghost"}, headers=headers)
    assert response.status_code == 404


# /reward-types/{id}
def test_update_reward_type_by_admin(client, registered_admin, sample_reward_type):
    """
    Тест обновления типа награды администратором.
    Проверяет что администратор может обновить тип награды через PUT /reward-types/{id}.
    """
    headers = {"Authorization": f"Bearer {registered_admin['token']}"}
    response = client.put(f"/reward-types/{sample_reward_type['id']}", json={
        "name": "Updated PUT Reward",
        "description": "Updated description"
    }, headers=headers)
    assert response.status_code == 200
    data = response.json()
    assert data["name"] == "Updated PUT Reward"


# /rewards/{id}
def test_update_reward_requires_manager(client, registered_user, registered_admin, sample_reward):
    path = f"/rewards/{sample_reward['id']}"
    user_headers = {"Authorization": f"Bearer {registered_user['token']}"}
    admin_headers = {"Authorization": f"Bearer {registered_admin['token']}"}
    assert client.put(path, headers=user_headers, json={"points_amount": 25, "reason": "Updated reason"}).status_code == 403
    response = client.put(path, headers=admin_headers, json={"points_amount": 25, "reason": "Updated reason"})
    assert response.status_code == 200
    assert response.json()["points_amount"] == 25


# /competitions/{id}
def test_update_competition_by_manager(client, registered_manager, sample_competition):
    """
    Тест обновления соревнования менеджером.
    Проверяет что менеджер может обновить соревнование через PUT /competitions/{id}.
    """
    headers = {"Authorization": f"Bearer {registered_manager['token']}"}
    new_title = "Updated PUT Competition"
    response = client.put(f"/competitions/{sample_competition['id']}", json={
        "title": new_title,
        "description": "Updated description"
    }, headers=headers)
    assert response.status_code == 200
    assert response.json()["title"] == new_title


def test_update_competition_by_user_forbidden(client, registered_user, sample_competition):
    """
    Тест запрета обновления соревнования обычным пользователем.
    Проверяет что обычный пользователь не может обновлять соревнования (403 Forbidden).
    """
    headers = {"Authorization": f"Bearer {registered_user['token']}"}
    response = client.put(f"/competitions/{sample_competition['id']}", json={"title": "Hack"}, headers=headers)
    assert response.status_code == 403
