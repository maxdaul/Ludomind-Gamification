from sqlalchemy import inspect, text

from auth import create_access_token
from database import User, migrate_staff_and_notifications
from db import SessionLocal, engine


def add_people():
    with SessionLocal.begin() as db:
        users = [User(first_name="Test", last_name=role, username=role, email=f"{role}@example.com",
                      password_hash="test-only", role=role)
                 for role in ("admin", "manager", "user")]
        db.add_all(users)
        db.flush()
        return {user.role: (user.id, {"Authorization": "Bearer " +
                create_access_token(str(user.id), user.role, user.email)}) for user in users}


def test_organization_crud_and_assignment(client):
    people = add_people()
    employee_id, employee = people["user"]
    admin, manager = people["admin"][1], people["manager"][1]
    base = "/admin/organization"
    employee_path = f"/admin/users/{employee_id}"
    assert client.get(base).status_code == 401
    assert client.get(base, headers=manager).status_code == 403
    assert client.post(f"{base}/positions", headers=manager, json={"name": "Инженер"}).status_code == 403
    assert client.get(base, headers=admin).json() == {"positions": [], "departments": []}
    assert client.post(f"{base}/positions", headers=admin, json={"name": "   "}).status_code == 422
    position = client.post(f"{base}/positions", headers=admin, json={"name": "  Инженер  "})
    department = client.post(f"{base}/departments", headers=admin, json={"name": "Разработка"})
    assert position.status_code == department.status_code == 201
    assert position.json()["name"] == "Инженер"
    assert client.post(f"{base}/positions", headers=admin, json={"name": "ИНЖЕНЕР"}).status_code == 409
    position_id, department_id = position.json()["id"], department.json()["id"]
    links = {"position_id": position_id, "department_id": department_id}
    assert client.put(employee_path, headers=manager, json=links).status_code == 403
    assert client.put(employee_path, headers=admin, json={**links, "department_id": 999}).status_code == 404
    assert client.get("/users/me", headers=employee).json()["position_id"] is None
    assigned = client.put(employee_path, headers=admin, json=links)
    assert assigned.status_code == 200 and assigned.json()["department_id"] == department_id
    assert client.put("/users/me", headers=employee, json={"position_id": None}).json()["position_id"] == position_id
    assert client.put(employee_path, headers=admin, json={"first_name": "Updated"}).json()["position_id"] == position_id

    position_path = f"{base}/positions/{position_id}"
    department_path = f"{base}/departments/{department_id}"
    assert client.put(position_path, headers=admin, json={"name": "Старший инженер"}).status_code == 200
    assert client.get(base, headers=admin).json()["positions"] == [{"id": position_id, "name": "Старший инженер"}]
    assert client.delete(position_path, headers=admin).status_code == 409
    assert client.delete(department_path, headers=admin).status_code == 409
    cleared = client.put(employee_path, headers=admin, json={"position_id": None, "department_id": None})
    assert cleared.json()["position_id"] is None and cleared.json()["department_id"] is None
    assert client.delete(position_path, headers=admin).status_code == 204
    assert client.delete(department_path, headers=admin).status_code == 204
    assert client.get(base, headers=admin).json() == {"positions": [], "departments": []}


def test_upgrade_from_database_without_organization_fields(client):
    people = add_people()
    with engine.begin() as connection:
        connection.execute(text("ALTER TABLE users DROP COLUMN position_id, DROP COLUMN department_id"))
        connection.execute(text("DROP TABLE positions, departments"))

    migrate_staff_and_notifications()
    migrate_staff_and_notifications()
    inspector = inspect(engine)
    assert inspector.has_table("positions") and inspector.has_table("departments")
    links = {column: fk["options"]["ondelete"] for fk in inspector.get_foreign_keys("users")
             for column in fk["constrained_columns"]}
    assert links["position_id"] == links["department_id"] == "RESTRICT"
    with SessionLocal() as db:
        assert db.query(User).count() == len(people)
        assert db.get(User, people["user"][0]).position_id is None
