from unittest.mock import Mock

import pytest

import moodle_api as moodle
import routes_post
from auth import create_access_token
from database import User
from db import SessionLocal


def test_course_catalog_omits_site_home(monkeypatch):
    monkeypatch.setattr(moodle, '_moodle_post', lambda *_: [
        {'id': 1, 'format': 'site', 'categoryid': 0, 'fullname': 'MoodleGamification'},
        {'id': 7, 'format': 'topics', 'categoryid': 1, 'fullname': 'Курс', 'shortname': 'course'},
    ])
    assert moodle.list_moodle_courses() == [{'id': 7, 'fullname': 'Курс', 'shortname': 'course'}]


@pytest.mark.parametrize('statuses,expected', [
    ([], moodle.MoodleProgress(None, 0, 0, False, 'unavailable')),
    ([{'state': 2, 'tracking': 2}, {'state': 3, 'tracking': 2}, {'state': 1, 'tracking': 0}],
     moodle.MoodleProgress(50.0, 1, 2, False, 'activities')),
])
def test_progress_falls_back_only_for_missing_criteria(monkeypatch, statuses, expected):
    post = Mock(side_effect=[moodle.MoodleAPIError('No criteria', code='nocriteriaset'), {'statuses': statuses}])
    monkeypatch.setattr(moodle, '_moodle_post', post)
    assert moodle.moodle_completion_summary(17, 2) == expected
    assert [args[0] for args, _ in post.call_args_list] == [
        'core_completion_get_course_completion_status', 'core_completion_get_activities_completion_status',
    ]


def test_course_criteria_used_before_activity_fallback(monkeypatch):
    post = Mock(return_value={'completionstatus': {'completed': False, 'completions': [
        {'complete': True}, {'complete': False}, {'complete': 1}, {'complete': 0},
    ]}})
    monkeypatch.setattr(moodle, '_moodle_post', post)
    assert moodle.moodle_completion_pie_rows(17, 7) == [{'Выполнено': 50.0, 'Осталось': 50.0}]
    post.assert_called_once()


def test_remote_error_is_not_reported_as_no_progress(monkeypatch):
    post = Mock(side_effect=moodle.MoodleAPIError('Access denied', code='accessexception'))
    monkeypatch.setattr(moodle, '_moodle_post', post)
    with pytest.raises(moodle.MoodleAPIError):
        moodle.moodle_completion_summary(17, 2)
    post.assert_called_once()


def test_enrolment_rejects_site_home_and_uses_allowed_course(client, monkeypatch):
    with SessionLocal.begin() as db:
        admin = User(first_name='Admin', last_name='Test', email='admin@example.com', username='admin',
                     password_hash='test-only', role='admin', moodle_id=11)
        employee = User(first_name='Employee', last_name='Test', email='user@example.com', username='employee',
                        password_hash='test-only', role='user', moodle_id=17)
        db.add_all([admin, employee])
        db.flush()
        employee_id = employee.id
        headers = {'Authorization': 'Bearer ' + create_access_token(str(admin.id), admin.role, admin.email)}

    monkeypatch.setattr(routes_post, 'moodle_sync_enabled', lambda: True)
    monkeypatch.setattr(routes_post, 'list_moodle_courses', lambda *, course_id: [{'id': 7}] if course_id == 7 else [])
    permission = Mock(return_value=False)
    courses = Mock(return_value=[])
    enrol = Mock()
    monkeypatch.setattr(routes_post, 'can_moodle_user_enrol', permission)
    monkeypatch.setattr(routes_post, 'list_moodle_user_courses', courses)
    monkeypatch.setattr(routes_post, 'enrol_user_in_moodle_course', enrol)

    assert client.post('/moodle/enrol', headers=headers, json={'user_id': employee_id, 'course_id': 1}).status_code == 404
    enrol.assert_not_called()
    payload = {'user_id': employee_id, 'course_id': 7}
    assert client.post('/moodle/enrol', headers=headers, json=payload).status_code == 403
    permission.return_value = True
    assert client.post('/moodle/enrol', headers=headers, json=payload).status_code == 204
    enrol.assert_called_once_with(moodle_user_id=17, course_id=7)
    enrol.reset_mock()
    courses.return_value = [{'id': 7}]
    assert client.post('/moodle/enrol', headers=headers, json=payload).status_code == 204
    enrol.assert_not_called()
    courses.return_value = []
    enrol.side_effect = moodle.MoodleAPIError('Raw provider error', code='wsnoinstance')
    error = client.post('/moodle/enrol', headers=headers, json=payload)
    assert error.status_code == 409 and 'отключено ручное зачисление' in error.json()['detail']
