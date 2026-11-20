import pytest
import uuid
from sqlalchemy import text


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
        conn.execute(text("UPDATE users SET role = 'admin' WHERE id = :user_id"),
                     {"user_id": user["id"]})
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
        conn.execute(text("UPDATE users SET role = 'manager' WHERE id = :user_id"),
                     {"user_id": user["id"]})
        conn.commit()
    login_res = client.post("/login", json={"email": email, "password": password})
    token = login_res.json()["access_token"]
    return {"user": user, "token": token}


# Подготовка данных
@pytest.fixture
def sample_task_status(client, registered_admin):
    headers = {"Authorization": f"Bearer {registered_admin['token']}"}
    status = client.post("/task-statuses", json={"code": "del_test", "name": "Del Test"},
                        headers=headers).json()
    return status


@pytest.fixture
def sample_tag(client, registered_admin):
    headers = {"Authorization": f"Bearer {registered_admin['token']}"}
    tag = client.post("/tags", json={"name": "Del Tag"}, headers=headers).json()
    return tag


@pytest.fixture
def sample_task(client, registered_user, sample_task_status):
    headers = {"Authorization": f"Bearer {registered_user['token']}"}
    task = client.post("/tasks", json={
        "title": "Del Test Task",
        "status_id": sample_task_status["id"],
        "due_date": "2025-12-31T23:59:59"
    }, headers=headers).json()
    return task


@pytest.fixture
def sample_reward_type(client, registered_admin):
    headers = {"Authorization": f"Bearer {registered_admin['token']}"}
    rt = client.post("/reward-types", json={"code": "del_test", "name": "Del Test Reward"},
                    headers=headers).json()
    return rt


@pytest.fixture
def sample_reward(client, registered_user, registered_admin, sample_reward_type):
    headers = {"Authorization": f"Bearer {registered_admin['token']}"}
    reward = client.post("/rewards", json={
        "user_id": registered_user["user"]["id"],
        "type_id": sample_reward_type["id"],
        "points_amount": 10,
        "reason": "Del test reward"
    }, headers=headers).json()
    return reward


@pytest.fixture
def sample_competition(client, registered_manager):
    headers = {"Authorization": f"Bearer {registered_manager['token']}"}
    comp = client.post("/competitions", json={
        "title": "Del Test Comp",
        "description": "For DELETE tests",
        "start_date": "2025-06-01T00:00:00",
        "end_date": "2025-08-31T23:59:59"
    }, headers=headers).json()
    return comp


# Тесты
# /users/me
def test_delete_own_account(client, registered_user):
    """
    Тест удаления собственного аккаунта пользователем.
    Проверяет что пользователь может удалить свой аккаунт через DELETE /users/me.
    """
    headers = {"Authorization": f"Bearer {registered_user['token']}"}
    response = client.delete("/users/me", headers=headers)
    assert response.status_code == 204

    # Проверяем что пользователь удалён
    db = registered_user["user"]
    from db import engine
    with engine.connect() as conn:
        res = conn.execute(text("SELECT 1 FROM users WHERE id = :id"), {"id": db["id"]})
        assert res.fetchone() is None


# /admin/users/{id}
def test_delete_user_by_admin(client, registered_admin, registered_user):
    """
    Тест удаления пользователя администратором.
    Проверяет что администратор может удалить любого пользователя через DELETE /admin/users/{id}.
    """
    headers = {"Authorization": f"Bearer {registered_admin['token']}"}
    user_id = registered_user["user"]["id"]
    response = client.delete(f"/admin/users/{user_id}", headers=headers)
    assert response.status_code == 204

    # Проверим удаление
    from db import engine
    with engine.connect() as conn:
        res = conn.execute(text("SELECT 1 FROM users WHERE id = :id"), {"id": user_id})
        assert res.fetchone() is None


def test_delete_nonexistent_user_by_admin(client, registered_admin):
    """
    Тест удаления несуществующего пользователя администратором.
    Проверяет что при попытке удалить несуществующего пользователя возвращается 404.
    """
    headers = {"Authorization": f"Bearer {registered_admin['token']}"}
    response = client.delete("/admin/users/999999", headers=headers)
    assert response.status_code == 404


def test_delete_user_by_non_admin_forbidden(client, registered_user):
    """
    Тест запрета удаления пользователя не-администратором.
    Проверяет что обычный пользователь не может удалять других пользователей (403 Forbidden).
    """
    headers = {"Authorization": f"Bearer {registered_user['token']}"}
    response = client.delete("/admin/users/1", headers=headers)
    assert response.status_code == 403


# /task-statuses/{id}
def test_delete_task_status_by_admin(client, registered_admin, sample_task_status):
    """
    Тест удаления статуса задачи администратором.
    Проверяет что администратор может удалить статус задачи через DELETE /task-statuses/{id}.
    """
    headers = {"Authorization": f"Bearer {registered_admin['token']}"}
    response = client.delete(f"/task-statuses/{sample_task_status['id']}", headers=headers)
    assert response.status_code == 204


def test_delete_nonexistent_task_status(client, registered_admin):
    """
    Тест удаления несуществующего статуса задачи.
    Проверяет что при попытке удалить несуществующий статус возвращается 404.
    """
    headers = {"Authorization": f"Bearer {registered_admin['token']}"}
    response = client.delete("/task-statuses/999999", headers=headers)
    assert response.status_code == 404


# /tags/{id}
def test_delete_tag_by_admin(client, registered_admin, sample_tag):
    """
    Тест удаления тега администратором.
    Проверяет что администратор может удалить тег через DELETE /tags/{id}.
    """
    headers = {"Authorization": f"Bearer {registered_admin['token']}"}
    response = client.delete(f"/tags/{sample_tag['id']}", headers=headers)
    assert response.status_code == 204


# /tasks/{id}
def test_delete_task_by_owner(client, registered_user, sample_task):
    """
    Тест удаления задачи владельцем.
    Проверяет что владелец задачи может удалить свою задачу через DELETE /tasks/{id}.
    """
    headers = {"Authorization": f"Bearer {registered_user['token']}"}
    response = client.delete(f"/tasks/{sample_task['id']}", headers=headers)
    assert response.status_code == 204


def test_delete_task_by_non_owner_forbidden(client, registered_user, registered_admin):
    """
    Тест запрета удаления чужой задачи.
    Проверяет что пользователь не может удалить задачу другого пользователя (404 Not Found).
    """
    # Создаём задачу от админа
    admin = registered_admin
    status = client.post("/task-statuses", json={"code": "del_task2", "name": "Del2"},
                        headers={"Authorization": f"Bearer {admin['token']}"})
    task = client.post("/tasks", json={
        "title": "Task of admin",
        "status_id": status.json()["id"],
        "due_date": "2025-12-31T23:59:59"
    }, headers={"Authorization": f"Bearer {admin['token']}"})
    task_id = task.json()["id"]

    # Пытаемся удалить как обычный пользователь
    headers = {"Authorization": f"Bearer {registered_user['token']}"}
    response = client.delete(f"/tasks/{task_id}", headers=headers)
    assert response.status_code == 404

# /reward-types/{id}
def test_delete_reward_type_by_admin(client, registered_admin, sample_reward_type):
    """
    Тест удаления типа награды администратором.
    Проверяет что администратор может удалить тип награды через DELETE /reward-types/{id}.
    """
    headers = {"Authorization": f"Bearer {registered_admin['token']}"}
    response = client.delete(f"/reward-types/{sample_reward_type['id']}", headers=headers)
    assert response.status_code == 204


# /rewards/{id}
def test_delete_reward_requires_manager(client, registered_user, registered_admin, sample_reward):
    path = f"/rewards/{sample_reward['id']}"
    user_headers = {"Authorization": f"Bearer {registered_user['token']}"}
    admin_headers = {"Authorization": f"Bearer {registered_admin['token']}"}
    assert client.delete(path, headers=user_headers).status_code == 403
    response = client.delete(path, headers=admin_headers)
    assert response.status_code == 204


# /competitions/{id}
def test_delete_competition_by_manager(client, registered_manager, sample_competition, registered_user):
    """
    Тест удаления соревнования менеджером.
    Участники добавляются через POST /participants; после удаления соревнования записей участников нет.
    """
    assign_test_manager(registered_user, registered_manager)
    headers = {"Authorization": f"Bearer {registered_manager['token']}"}
    comp_id = sample_competition["id"]

    client.post("/participants", json={
        "competition_id": comp_id,
        "user_id": registered_user["user"]["id"]
    }, headers=headers)

    response = client.delete(f"/competitions/{comp_id}", headers=headers)
    assert response.status_code == 204

    # Соревнование удалено — запрос участников возвращает 404
    resp = client.get(f"/participants/competition/{comp_id}", headers=headers)
    assert resp.status_code == 404

def test_delete_competition_by_user_forbidden(client, registered_user, sample_competition):
    """
    Тест запрета удаления соревнования обычным пользователем.
    Проверяет что обычный пользователь не может удалять соревнования (403 Forbidden).
    """
    headers = {"Authorization": f"Bearer {registered_user['token']}"}
    response = client.delete(f"/competitions/{sample_competition['id']}", headers=headers)
    assert response.status_code == 403
