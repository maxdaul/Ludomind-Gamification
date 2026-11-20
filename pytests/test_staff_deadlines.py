from datetime import datetime, timedelta, timezone
from unittest.mock import Mock

import pytest
from sqlalchemy import inspect, text

from auth import create_access_token
from database import Competition, Participant, Task, TaskDeadlineNotification, TaskStatus, User, migrate_staff_and_notifications
from db import SessionLocal, engine
import deadline_notifications
import mail_yc_function


@pytest.fixture
def staff(client, monkeypatch):
    monkeypatch.setattr('routes_post.schedule_task_assigned_email', lambda *args: None)
    monkeypatch.setattr('routes_chat.schedule_task_assigned_email', lambda *args: None)
    with SessionLocal.begin() as session:
        for user_id, role, manager in [(1, 'admin', None), (2, 'manager', None), (3, 'manager', None),
                                       (4, 'user', 2), (5, 'user', 3), (6, 'user', None)]:
            session.add(User(id=user_id, first_name='User', last_name=str(user_id), username=f'staff{user_id}',
                             email=f'staff{user_id}@example.com', password_hash='unused', role=role, manager_id=manager))
        for status_id,code in enumerate(('todo','hold done','done','wasted'),1):
            session.add(TaskStatus(id=status_id,code=code,name=code))
        now = datetime.now(timezone.utc).replace(tzinfo=None,microsecond=0)
        session.add(Competition(id=1,title='Test',start_date=now-timedelta(days=2),end_date=now+timedelta(days=2)))
        session.flush()
        session.add_all([Participant(user_id=i,competition_id=1,score=0) for i in (4,5,6)])
    return now


def headers(user_id, role):
    return {'Authorization':'Bearer '+create_access_token(str(user_id),role,f'staff{user_id}@example.com')}


def test_manager_scope_on_lists_stats_and_assignment(client, staff):
    manager = headers(2,'manager')
    admin = headers(1,'admin')
    assert [u['id'] for u in client.get('/users/only',headers=manager).json()] == [4]
    assert [u['id'] for u in client.get('/participants/users',headers=manager).json()] == [4]
    assert client.get('/users/me/statistics?user_id=5',headers=manager).status_code == 403
    assert client.get('/users/me/statistics?user_id=4',headers=manager).status_code == 200
    task = {'title':'Тестовая задача','description':'Проверить один отчёт','status_id':1,'competition_id':1,
            'due_date':(staff+timedelta(hours=6)).isoformat()+'Z'}
    response = client.post('/tasks/4',json=task,headers=manager)
    assert response.status_code == 201,response.text
    assert response.json()['user_id'] == 4
    for employee_id in (5,6):
        assert client.post(f'/tasks/{employee_id}',json=task,headers=manager).status_code == 403
    batch = {key:task[key] for key in ('title','description','competition_id','due_date')}
    response = client.post('/chat',json={**batch,'user_ids':[4,5]},headers=manager)
    assert response.status_code == 403
    valid = client.post('/api/chat',json={**batch,'user_ids':[4]},headers=manager)
    assert valid.status_code == 200 and valid.json()['task_created']['user_id'] == 4
    assert client.post('/tasks/5',json=task,headers=admin).status_code == 201
    tasks = client.get('/manager/competitions/1/tasks',headers=manager).json()
    assert len(tasks) == 2 and {t['user_id'] for t in tasks} == {4}


def test_only_admin_can_reassign_and_old_manager_loses_access(client, staff):
    admin,manager,employee,new_manager = headers(1,'admin'),headers(2,'manager'),headers(4,'user'),headers(3,'manager')
    assert client.put('/admin/users/4',json={'manager_id':3},headers=manager).status_code == 403
    assert client.put('/admin/users/4',json={'manager_id':1},headers=admin).status_code == 400
    assert client.put('/admin/users/4',json={'manager_id':4},headers=admin).status_code == 400
    assert client.put('/admin/users/4',json={'manager_id':3},headers=admin).json()['manager_id'] == 3
    client.put('/users/me',json={'manager_id':2},headers=employee)
    assert client.get('/users/only',headers=manager).json() == []
    assert {u['id'] for u in client.get('/users/only',headers=new_manager).json()} == {4,5}
    assert client.put('/admin/users/3',json={'role':'user'},headers=admin).status_code == 200
    users = {u['id']:u for u in client.get('/users',headers=admin).json()}
    assert users[4]['manager_id'] is None and users[5]['manager_id'] is None


def test_deadline_emails_deduplicate_reschedules_and_retry(client, staff, monkeypatch):
    now = staff
    mail = Mock()
    monkeypatch.setattr(deadline_notifications,'invoke_mail_function',mail)
    tasks = [(1,'Soon',1,4,now+timedelta(hours=23)),(2,'Late',4,4,now-timedelta(minutes=1)),
             (3,'Awaiting confirmation',2,4,now-timedelta(hours=1)),(4,'Done',3,4,now-timedelta(hours=1)),
             (5,'Unassigned',4,6,now-timedelta(hours=1)),(6,'Future',1,4,now+timedelta(hours=25))]
    with SessionLocal.begin() as session:
        session.add_all([Task(id=i,title=title,status_id=status,user_id=user,due_date=due) for i,title,status,user,due in tasks])
    deadline_notifications.run_once(now)
    deadline_notifications.run_once(now)
    assert [(args.kwargs['to_email'],args.kwargs['subject']) for args in mail.call_args_list] == [
        ('staff4@example.com','Приближается срок задачи: Soon'),('staff2@example.com','Просрочена задача: Late')]
    with SessionLocal.begin() as session:
        session.get(Task,1).due_date = now+timedelta(hours=10)
    mail.side_effect = mail_yc_function.MailFunctionError('test only')
    deadline_notifications.run_once(now+timedelta(minutes=1))
    deadline_notifications.run_once(now+timedelta(minutes=2))
    assert mail.call_count == 3
    mail.side_effect = None
    deadline_notifications.run_once(now+timedelta(minutes=16))
    assert mail.call_count == 4 and mail.call_args.kwargs['to_email'] == 'staff4@example.com'
    with SessionLocal() as session:
        assert session.query(TaskDeadlineNotification).filter(TaskDeadlineNotification.sent_at.is_not(None)).count() == 3


def test_mail_cloud_function_passes_api_key(monkeypatch):
    monkeypatch.setenv('YC_MAIL_FUNCTION_URL','https://mock.example.test/mail')
    monkeypatch.setenv('YC_MAIL_FUNCTION_API_KEY','test-only')
    response = Mock(status_code=200)
    response.json.return_value = {'statusCode':202}
    send = Mock(return_value=response)
    monkeypatch.setattr(mail_yc_function.requests,'post',send)
    mail_yc_function.invoke_mail_function(to_email='staff4@example.com',subject='Test',message='Test')
    assert send.call_args.kwargs['headers']['Authorization'] == 'Api-Key test-only'
    response.json.return_value = {'statusCode':401}
    with pytest.raises(mail_yc_function.MailFunctionError):
        mail_yc_function.invoke_mail_function(to_email='staff4@example.com',subject='Test',message='Test')


def test_additive_migration_preserves_existing_rows(client, staff):
    with engine.begin() as connection:
        connection.execute(text('DROP TABLE task_deadline_notifications'))
        connection.execute(text('ALTER TABLE users DROP COLUMN manager_id'))
    migrate_staff_and_notifications()
    migrate_staff_and_notifications()
    with SessionLocal() as session:
        assert session.query(User).count() == 6
        assert session.query(Participant).count() == 3
        assert session.query(User).filter(User.manager_id.is_not(None)).count() == 0
    assert inspect(engine).has_table('task_deadline_notifications')
    assert any(fk['options'].get('ondelete') == 'SET NULL' for fk in inspect(engine).get_foreign_keys('users'))


def test_preview_is_bound_to_text_and_author_and_preserves_original_score(client, staff, monkeypatch):
    analysis = {'estimated_points': 51, 'explanation': 'Проверить совместимость и выполнить несколько шагов.',
                'confidence': 0.9, 'model_used': 'test'}
    estimate = Mock(return_value=analysis)
    monkeypatch.setattr('ml.ai_analyzer.analyze_task', estimate)
    manager = headers(2, 'manager')
    draft = {'title': 'Обновить FastAPI', 'description': 'Проверить совместимость и прогнать тесты'}
    assert client.post('/task-analysis', json=draft, headers=headers(4, 'user')).status_code in (401, 403)
    result = client.post('/task-analysis', json=draft, headers=manager)
    assert result.status_code == 200, result.text
    assert result.json()['analysis'] == analysis
    payload = {**draft, 'user_ids': [4], 'competition_id': 1,
               'due_date': (staff + timedelta(hours=6)).isoformat() + 'Z',
               'analysis_receipt': result.json()['receipt'], 'estimated_points': 24}
    assert client.post('/chat', json={**payload, 'title': 'Другой текст'}, headers=manager).status_code == 422
    assert client.post('/chat', json=payload, headers=headers(1, 'admin')).status_code == 422
    result = client.post('/chat', json=payload, headers=manager)
    assert result.status_code == 200, result.text
    task = result.json()['task_created']
    assert task['estimated_points'] == 24 and task['difficulty'] == 'Средняя'
    assert task['ai_analysis_metadata'] == {**analysis, 'estimated_points': 24,
                                           'model_estimated_points': 51, 'manual_override': True}
    estimate.assert_called_once_with(draft['title'], draft['description'])

    result = client.put(f"/tasks/{task['id']}", json={'title': 'Обновить FastAPI и Pydantic'}, headers=manager)
    assert result.status_code == 200, result.text
    assert result.json()['ai_analysis_metadata'] == analysis
    assert estimate.call_count == 2
