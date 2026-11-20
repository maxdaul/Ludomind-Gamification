import json
from datetime import datetime, timedelta, timezone

import pytest
import requests
from fastapi import HTTPException
from fastapi.testclient import TestClient
from jose import jwt
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

import auth
import dependencies
import main
import ml.ai_analyzer as ai
from database import Base, User
from db import get_db


@pytest.fixture
def api(tmp_path, monkeypatch):
    engine = create_engine('sqlite://', connect_args={'check_same_thread': False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    session = Session(engine)
    password_hash = auth.get_password_hash('test-password')
    for user_id, role in [(1, 'admin'), (2, 'manager'), (3, 'user')]:
        session.add(User(id=user_id, first_name='Test', last_name='User', username=f'user{user_id}',
                         email=f'user{user_id}@example.com', password_hash=password_hash, role=role))
    session.commit()
    main.app.dependency_overrides[get_db] = lambda: session
    static = tmp_path / 'dist'
    static.mkdir()
    (static / 'index.html').write_text('SPA CONTENT', encoding='utf-8')
    (static / 'logo.png').write_bytes(b'public image')
    (tmp_path / 'private.env').write_text('secret-canary', encoding='utf-8')
    monkeypatch.setattr(main, 'STATIC_ROOT', static.resolve())
    with TestClient(main.app, raise_server_exceptions=False) as client:
        yield client, session
    main.app.dependency_overrides.clear()
    session.close()
    engine.dispose()


def token(user_id, role):
    return auth.create_access_token(str(user_id), role, f'user{user_id}@example.com')


def bearer(value):
    return {'Authorization': 'Bearer ' + value}


def test_token_claims_and_one_hour_expiry():
    before = datetime.now(timezone.utc).timestamp()
    claims = jwt.decode(token(3, 'user'), auth.SECRET_KEY, algorithms=['HS256'])
    assert claims['sub'] == 'user3@example.com' and claims['user_id'] == '3' and claims['role'] == 'user'
    assert 3598 <= claims['exp'] - before <= 3601


def test_current_database_role_overrides_old_claim(api):
    client, session = api
    value = token(1, 'admin')
    assert client.get('/openapi.json', headers=bearer(value)).status_code == 200
    session.get(User, 1).role = 'user'
    session.commit()
    assert client.get('/openapi.json', headers=bearer(value)).status_code == 403
    assert client.get('/users/me', headers=bearer(value)).json()['role'] == 'user'


@pytest.mark.parametrize('payload', [
    {'sub': '3', 'role': 'user'},
    {'sub': 'wrong@example.com', 'user_id': '3', 'role': 'user'},
    {'sub': 'user3@example.com', 'user_id': 'bad', 'role': 'user'},
    {'sub': 'user3@example.com', 'user_id': True, 'role': 'user'},
    {'sub': 'user3@example.com', 'user_id': '3', 'role': 'root'},
])
def test_invalid_identity_claims_are_401(api, payload):
    client, _ = api
    value = jwt.encode({**payload, 'exp': datetime.now(timezone.utc) + timedelta(hours=1)}, auth.SECRET_KEY, algorithm='HS256')
    assert client.get('/users/me', headers=bearer(value)).status_code == 401


def test_missing_expired_and_wrongly_signed_tokens_are_401(api):
    client, _ = api
    assert client.get('/users/me').status_code == 401
    expired = jwt.encode({'sub': 'user3@example.com', 'user_id': '3', 'role': 'user',
                         'exp': datetime.now(timezone.utc) - timedelta(seconds=1)}, auth.SECRET_KEY, algorithm='HS256')
    assert client.get('/users/me', headers=bearer(expired)).status_code == 401
    assert client.get('/users/me', headers=bearer('not.a.token')).status_code == 401


@pytest.mark.parametrize('path', ['/docs', '/openapi.json'])
def test_documentation_requires_current_admin_and_supports_browser_basic(api, path):
    client, _ = api
    result = client.get(path)
    assert result.status_code == 401 and result.headers['www-authenticate'].startswith('Basic ')
    assert client.get(path, auth=('user1@example.com', 'wrong')).status_code == 401
    assert client.get(path, auth=('user3@example.com', 'test-password')).status_code == 403
    assert client.get(path, headers=bearer(token(2, 'manager'))).status_code == 403
    result = client.get(path, auth=('user1@example.com', 'test-password'))
    assert result.status_code == 200
    if path == '/docs':
        assert '/openapi.json' in result.text and 'SwaggerUIBundle' in result.text
    else:
        assert 'paths' in result.json()


@pytest.mark.parametrize('path', ['/', '/login', '/leaderboards', '/profile', '/statistics', '/manager', '/admin'])
def test_known_spa_routes_still_work(api, path):
    client, _ = api
    assert client.get(path).text == 'SPA CONTENT'


@pytest.mark.parametrize('path', ['/api/missing', '/unknown', '/private.env', '/%2e%2e/private.env', '/%2e%2e%5cprivate.env', '/assets/not-here.js'])
def test_unknown_paths_and_traversal_do_not_return_spa_or_private_files(api, path):
    client, _ = api
    result = client.get(path)
    assert result.status_code == 404
    assert 'secret-canary' not in result.text and 'SPA CONTENT' not in result.text


def test_public_file_only_inside_static_root(api):
    client, _ = api
    assert client.get('/logo.png').content == b'public image'


def test_validation_does_not_reflect_secret_input(api):
    client, _ = api
    response = client.post('/login', json={'email': 'secret-canary-invalid-email', 'password': 'secret-password'})
    assert response.status_code == 422
    assert 'secret-canary' not in response.text and 'secret-password' not in response.text


def test_global_unexpected_error_is_sanitized_and_logged(api, monkeypatch, caplog):
    import routes_post
    client, _ = api
    def failure(*args):
        raise RuntimeError('private-database-password-canary')
    monkeypatch.setattr(routes_post, 'verify_password', failure)
    result = client.post('/login', json={'email': 'user1@example.com', 'password': 'test-password'})
    assert result.status_code == 500
    assert 'private-database-password-canary' not in result.text
    assert result.json()['detail'].startswith('Внутренняя ошибка сервера')


def test_http_server_error_is_sanitized(api, monkeypatch):
    import routes_post
    client, _ = api
    def failure(*args):
        raise HTTPException(status_code=503, detail='private-provider-response-canary')
    monkeypatch.setattr(routes_post, 'verify_password', failure)
    result = client.post('/login', json={'email': 'user1@example.com', 'password': 'test-password'})
    assert result.status_code == 503
    assert 'private-provider-response-canary' not in result.text


def test_identity_missing_expiry_is_rejected(api):
    client, _ = api
    value = jwt.encode({'sub': 'user3@example.com', 'user_id': '3', 'role': 'user'}, auth.SECRET_KEY, algorithm='HS256')
    assert client.get('/users/me', headers=bearer(value)).status_code == 401


def test_inactive_account_is_rejected_even_with_valid_token(api):
    client, session = api
    user = session.get(User, 3)
    user.is_active = False
    assert client.get('/users/me', headers=bearer(token(3, 'user'))).status_code == 401


def response(status=200, content=None):
    result = requests.Response()
    result.status_code = status
    envelope = content if content is not None else {'result': {'alternatives': [{'message': {'text': '{"estimated_points": 17}'}}]}}
    result._content = json.dumps(envelope).encode('utf-8')
    return result


@pytest.fixture
def enabled(monkeypatch):
    monkeypatch.setattr(ai, 'YANDEX_API_KEY', 'private-key-canary')
    monkeypatch.setattr(ai, 'MODEL_NAME', 'gpt://test-folder/yandexgpt/latest')
    monkeypatch.setattr(ai.time, 'sleep', lambda *_: None)


def test_offline_preserves_original_text_and_fixed_points(monkeypatch):
    monkeypatch.setattr(ai, 'YANDEX_API_KEY', '')
    monkeypatch.setattr(ai.requests, 'post', lambda *a, **k: pytest.fail('Unexpected network'))
    original = 'Исходный текст\nбез переписывания'
    result = ai.analyze_task_with_commands(original)['commands'][0]['task_data']
    assert result['title'] == original and result['description'] == original and result['estimated_points'] == 10
    assert ai.analyze_task(original)['estimated_points'] == 10


def test_enabled_ai_normalizes_and_limits_fields(enabled, monkeypatch):
    calls = []
    def fake(messages, **kwargs):
        calls.append(messages)
        return {'estimated_points': 35, 'confidence': .9, 'explanation': 'Оценка'}
    monkeypatch.setattr(ai, '_call_yandex_with_messages', fake)
    assert ai.analyze_task('  Тест   задачи  ', 'Первая\r\n\r\n\r\nвторая')['estimated_points'] == 35
    assert calls[0][1]['content'] == 'Название: Тест задачи\nОписание: Первая\n\nвторая'
    with pytest.raises(ai.YandexAPIError):
        ai.analyze_task('x' * (ai.MAX_TITLE_LENGTH + 1))
    assert len(calls) == 1


@pytest.mark.parametrize('status', [400, 401, 403, 404, 422])
def test_permanent_provider_failures_do_not_retry_or_leak(enabled, monkeypatch, status, caplog):
    calls = []
    monkeypatch.setattr(ai.requests, 'post', lambda *a, **k: (calls.append(k), response(status, {'secret': 'private-response-canary'}))[1])
    with pytest.raises(ai.YandexAPIError) as error:
        ai._call_yandex_with_messages([{'role': 'user', 'content': 'Test'}], json_mode=True)
    assert len(calls) == 1
    assert 'private-response-canary' not in str(error.value) + caplog.text
    assert 'private-key-canary' not in str(error.value) + caplog.text


@pytest.mark.parametrize('status,exception', [(429, ai.YandexRateLimitError), (503, ai.YandexAPIError)])
def test_transient_provider_failure_retries_are_bounded(enabled, monkeypatch, status, exception):
    calls = []
    monkeypatch.setattr(ai.requests, 'post', lambda *a, **k: (calls.append(k), response(status))[1])
    with pytest.raises(exception):
        ai._call_yandex_with_messages([{'role': 'user', 'content': 'Test'}])
    assert len(calls) == 3 and all(c['timeout'] == ai.REQUEST_TIMEOUT for c in calls)


def test_transient_network_failure_retries_are_bounded(enabled, monkeypatch):
    calls = []
    def failure(*args, **kwargs):
        calls.append(1)
        raise requests.Timeout('private-key-canary')
    monkeypatch.setattr(ai.requests, 'post', failure)
    with pytest.raises(ai.YandexAPIError) as error:
        ai._call_yandex_with_messages([{'role': 'user', 'content': 'Test'}])
    assert len(calls) == 3 and 'private-key-canary' not in str(error.value)


@pytest.mark.parametrize('points,confidence', [(0, .5), (101, .5), (1.5, .5), (True, .5), (10, -1), (10, 2), (10, float('nan')), ('10', .5)])
def test_invalid_model_points_and_confidence_are_rejected(points, confidence):
    with pytest.raises(ai.YandexAPIError):
        ai._validated_analysis({'estimated_points': points, 'confidence': confidence, 'explanation': 'Test'})


def test_meaningless_analysis_is_validated_too():
    result = ai._validated_analysis({'estimated_points': None, 'confidence': .8, 'explanation': 'Уточните задачу'})
    assert result['is_meaningless'] is True and result['estimated_points'] is None
    with pytest.raises(ai.YandexAPIError):
        ai._validated_analysis({'estimated_points': None, 'confidence': 10, 'explanation': 'Test'})


@pytest.mark.parametrize('body', [{'wrong': True}, {'result': {'alternatives': []}}, {'result': {'alternatives': [{'message': {'text': 'broken json'}}]}}])
def test_broken_provider_json_is_rejected_without_retry(enabled, monkeypatch, body):
    calls = []
    monkeypatch.setattr(ai.requests, 'post', lambda *a, **k: (calls.append(1), response(200, body))[1])
    with pytest.raises(ai.YandexAPIError):
        ai._call_yandex_with_messages([{'role': 'user', 'content': 'Test'}], json_mode=True)
    assert len(calls) == 1


def test_command_uses_current_dictionary_and_ignores_model_date(enabled, monkeypatch):
    outputs = iter([
        {'reply': 'OK', 'commands': [{'action': 'create_task', 'task_data': {
            'title': ' Тест  задачи ', 'description': 'Описание', 'status_code': 'todo',
            'tags': ['Custom', 'Unknown', 'Custom'], 'due_date': '2020-01-01',
        }}]},
        {'estimated_points': 27, 'confidence': .9, 'explanation': 'Оценка'},
    ])
    calls = []

    def complete(messages, **kwargs):
        calls.append(messages)
        return next(outputs)

    monkeypatch.setattr(ai, '_call_yandex_with_messages', complete)
    data = ai.analyze_task_with_commands('Тест', available_tags=['Custom'], available_statuses=[{'code': 'todo', 'name': 'К выполнению'}])['commands'][0]['task_data']
    assert data['title'] == 'Тест задачи' and data['tags'] == ['Custom'] and data['due_date'] is None
    assert data['estimated_points'] == 27
    assert data['ai_analysis_metadata']['confidence'] == .9
    assert calls[1][1]['content'].endswith('Контекст: Тест')


def test_request_uses_configured_model_json_and_disables_provider_logging(enabled, monkeypatch):
    def complete(url, **kwargs):
        assert url == ai.YANDEX_API_URL
        assert kwargs['headers']['Authorization'] == 'Api-Key private-key-canary'
        assert kwargs['headers']['x-data-logging-enabled'] == 'false'
        assert kwargs['json']['modelUri'] == 'gpt://test-folder/yandexgpt/latest'
        assert kwargs['json']['jsonObject'] is True
        assert kwargs['allow_redirects'] is False
        return response()

    monkeypatch.setattr(ai.requests, 'post', complete)
    assert ai._call_yandex_with_messages([{'role': 'user', 'content': 'Test'}], json_mode=True) == {'estimated_points': 17}
