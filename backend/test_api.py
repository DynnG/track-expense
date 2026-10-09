import os
import tempfile
from pathlib import Path

# Never run destructive test setup against the development or production DB.
temp_dir = tempfile.TemporaryDirectory(dir=Path(__file__).resolve().parent.parent / '.tmp')
os.environ['DATABASE_URL'] = 'sqlite:///' + str(Path(temp_dir.name) / 'test.db').replace('\\', '/')
os.environ['APP_ENV'] = 'test'

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete, select
from sqlalchemy.orm import Session
from backend.app import app, engine, Base, User, Category, Transaction, RateBucket, LoginSession, RecoveryToken, AuditEvent, Budget, digest
from backend.google_auth import GoogleIdentity, OAuthAttempt

@pytest.fixture
def google(monkeypatch):
    import backend.google_auth as provider
    monkeypatch.setattr(provider, 'CLIENT_ID', 'test-client')
    monkeypatch.setattr(provider, 'CLIENT_SECRET', 'test-secret')
    monkeypatch.setattr(provider, 'exchange', lambda code, verifier: 'test-token')
    monkeypatch.setattr(provider, 'verify', lambda token, nonce: {'sub': 'google-subject', 'email': 'google@example.com', 'name': 'Google tester'})
    return provider

def google_begin(client):
    from urllib.parse import parse_qs, urlparse
    response = client.get('/api/v1/auth/google/start', follow_redirects=False)
    assert response.status_code == 303
    query = parse_qs(urlparse(response.headers['location']).query)
    assert query['scope'] == ['openid email profile']
    assert query['code_challenge_method'] == ['S256']
    assert 'HttpOnly' in response.headers['set-cookie']
    return query['state'][0]

def google_finish(client, state):
    return client.get('/api/v1/auth/google/callback', params={'state': state, 'code': 'test-code'}, follow_redirects=False)

def test_google_new_returning_session_rotation_and_replay(google):
    with TestClient(app) as client:
        state = google_begin(client)
        assert 'auth_error' not in google_finish(client, state).headers['location']
        profile = client.get('/api/v1/auth/me').json()
        assert profile['email'] == 'google@example.com'
        assert len(client.get('/api/v1/categories').json()) == 10
        old_cookie = client.cookies.get('track_session')
        assert 'invalid_flow' in google_finish(client, state).headers['location']
        state = google_begin(client)
        assert 'auth_error' not in google_finish(client, state).headers['location']
        assert client.cookies.get('track_session') != old_cookie
        assert client.get('/api/v1/auth/me').json()['id'] == profile['id']
        assert transaction(client, {'X-CSRF-Token': profile['csrf']}).status_code == 403

def test_google_browser_binding_expiry_and_denial(google):
    with TestClient(app) as client, TestClient(app) as other:
        state = google_begin(client)
        assert 'invalid_flow' in google_finish(other, state).headers['location']
        assert 'invalid_flow' in google_finish(client, 'wrong-state').headers['location']
        with Session(engine) as session:
            attempt = session.get(OAuthAttempt, digest(state))
            attempt.expires = 1
            session.commit()
        assert 'invalid_flow' in google_finish(client, state).headers['location']
        state = google_begin(client)
        response = client.get('/api/v1/auth/google/callback', params={'state': state, 'error': 'access_denied'}, follow_redirects=False)
        assert 'cancelled' in response.headers['location']
        assert client.get('/api/v1/auth/me').status_code == 401

def test_google_email_collision_requires_explicit_csrf_link(google):
    from urllib.parse import parse_qs, urlparse
    with TestClient(app) as owner, TestClient(app) as guest:
        headers = account(owner, 'google@example.com')
        owner_id = owner.get('/api/v1/auth/me').json()['id']
        assert 'account_exists' in google_finish(guest, google_begin(guest)).headers['location']
        assert guest.get('/api/v1/auth/me').status_code == 401
        assert owner.post('/api/v1/auth/google/link', json={}).status_code == 403
        link = owner.post('/api/v1/auth/google/link', headers=headers, json={})
        assert link.status_code == 200
        state = parse_qs(urlparse(link.json()['url']).query)['state'][0]
        assert 'google_linked=1' in google_finish(owner, state).headers['location']
        assert owner.get('/api/v1/auth/google/status').json()['connected']
        assert 'auth_error' not in google_finish(guest, google_begin(guest)).headers['location']
        assert guest.get('/api/v1/auth/me').json()['id'] == owner_id

def test_google_link_cannot_survive_logout_or_bind_to_other_session(google):
    from urllib.parse import parse_qs, urlparse
    with TestClient(app) as owner:
        headers = account(owner)
        link = owner.post('/api/v1/auth/google/link', headers=headers, json={})
        state = parse_qs(urlparse(link.json()['url']).query)['state'][0]
        owner.post('/api/v1/auth/logout', headers=headers, json={})
        assert 'invalid_flow' in google_finish(owner, state).headers['location']
        with Session(engine) as session:
            assert session.scalar(select(GoogleIdentity)) is None

def test_google_invalid_identity_fails_closed(google, monkeypatch):
    def reject(*args):
        raise ValueError('untrusted identity')
    monkeypatch.setattr(google, 'verify', reject)
    with TestClient(app) as client:
        assert 'verification_failed' in google_finish(client, google_begin(client)).headers['location']
        assert client.get('/api/v1/auth/me').status_code == 401

def test_google_signed_token_validation(monkeypatch):
    import time
    import jwt
    from types import SimpleNamespace
    from cryptography.hazmat.primitives.asymmetric import rsa
    import backend.google_auth as provider
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    monkeypatch.setattr(provider, 'CLIENT_ID', 'test-client')
    monkeypatch.setattr(provider.JWKS, 'get_signing_key_from_jwt', lambda token: SimpleNamespace(key=key.public_key()))
    claims = {'iss': 'https://accounts.google.com', 'aud': 'test-client', 'sub': 'subject', 'iat': int(time.time()), 'exp': int(time.time()) + 300, 'nonce': 'expected', 'email': 'verified@example.com', 'email_verified': True}
    token = lambda values: jwt.encode(values, key, algorithm='RS256', headers={'kid': 'test'})
    assert provider.verify(token(claims), 'expected')['sub'] == 'subject'
    for field, value in [('aud', 'other-client'), ('iss', 'https://evil.example'), ('nonce', 'wrong'), ('exp', 1), ('email_verified', False), ('azp', 'other-client')]:
        with pytest.raises((ValueError, jwt.PyJWTError)):
            provider.verify(token({**claims, field: value}), 'expected')
    other_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    with pytest.raises(jwt.PyJWTError):
        provider.verify(jwt.encode(claims, other_key, algorithm='RS256'), 'expected')
    with pytest.raises(jwt.PyJWTError):
        provider.verify(jwt.encode(claims, 'untrusted', algorithm='HS256'), 'expected')

def test_access_logs_redact_oauth_codes():
    import logging
    from backend.app import SafeAccessLog
    record = logging.LogRecord('uvicorn.access', logging.INFO, '', 0, '%s - "%s %s HTTP/%s" %d', ('client', 'GET', '/api/v1/auth/google/callback?code=secret&state=secret', '1.1', 303), None)
    SafeAccessLog().filter(record)
    assert 'secret' not in record.getMessage()

@pytest.fixture(autouse=True)
def clean():
    Base.metadata.create_all(engine)
    with Session(engine) as db:
        for model in [GoogleIdentity, OAuthAttempt, Transaction, Budget, LoginSession, RecoveryToken, AuditEvent, Category, RateBucket, User]:
            db.execute(delete(model))
        db.commit()

@pytest.fixture(scope='session', autouse=True)
def close_test_database():
    yield
    engine.dispose()
    temp_dir.cleanup()

def account(client, email='one@example.com'):
    response = client.post('/api/v1/auth/register', json={'name': 'Test user', 'email': email, 'password': 'VeryGoodPass123!'})
    assert response.status_code == 201, response.text
    return {'X-CSRF-Token': response.json()['csrf']}

def category(client, kind='EXPENSE'):
    return next(c['id'] for c in client.get('/api/v1/categories').json() if c['type'] == kind)

def transaction(client, headers, amount='12.34', date='2026-10-09', **extra):
    return client.post('/api/v1/transactions', headers=headers, json={'amount': amount, 'category_id': category(client), 'type': 'EXPENSE', 'description': 'Lunch', 'transaction_date': date, **extra})

def test_auth_csrf_and_logout():
    with TestClient(app) as client:
        assert client.get('/api/v1/transactions?month=2026-10').status_code == 401
        headers = account(client)
        assert 'HttpOnly' in client.cookies.__repr__() or client.cookies.get('track_session')
        assert transaction(client, {}).status_code == 403
        assert transaction(client, headers).status_code == 201
        assert client.post('/api/v1/auth/logout', headers=headers, json={}).status_code == 204
        assert client.get('/api/v1/auth/me').status_code == 401

def test_validation_and_decimal_totals():
    with TestClient(app) as client:
        headers = account(client)
        for value in ['0', '-5', '1.001', '1e3', 12.34, '10000000000.00']:
            assert transaction(client, headers, amount=value).status_code == 422
        assert transaction(client, headers, amount='0.10').status_code == 201
        assert transaction(client, headers, amount='0.20', date='2026-10-31').status_code == 201
        assert transaction(client, headers, amount='999.00', date='2026-11-01').status_code == 201
        report = client.get('/api/v1/reports/monthly?month=2026-10').json()
        assert report['expense'] == '0.30'
        assert report['balance'] == '-0.30'
        assert client.get('/api/v1/reports/monthly?month=2026-13').status_code == 422
        assert transaction(client, headers, user_id='someone-else').status_code == 422

def test_ownership_across_all_private_operations():
    with TestClient(app) as a, TestClient(app) as b:
        ah = account(a)
        tx = transaction(a, ah).json()
        budget = a.post('/api/v1/budgets', headers=ah, json={'amount': '100.00', 'month': '2026-10'}).json()
        bh = account(b, 'two@example.com')
        assert b.get(f"/api/v1/transactions/{tx['id']}").status_code == 404
        assert b.delete(f"/api/v1/transactions/{tx['id']}", headers=bh).status_code == 404
        assert b.patch(f"/api/v1/transactions/{tx['id']}", headers=bh, json={k: v for k, v in tx.items() if k != 'id'}).status_code == 404
        assert b.delete(f"/api/v1/budgets/{budget['id']}", headers=bh).status_code == 404
        assert b.get('/api/v1/transactions?month=2026-10').json()['total'] == 0
        assert b.get('/api/v1/budgets?month=2026-10').json() == []
        assert 'Lunch' not in b.get('/api/v1/reports/export?month=2026-10').text
        assert transaction(b, bh, category_id=tx['category_id']).status_code == 422

def test_budget_upsert_export_and_month_filters():
    with TestClient(app) as client:
        headers = account(client)
        for amount in ['100.00', '250.00']:
            assert client.post('/api/v1/budgets', headers=headers, json={'amount': amount, 'month': '2026-10'}).status_code == 200
        budgets = client.get('/api/v1/budgets?month=2026-10').json()
        assert len(budgets) == 1 and budgets[0]['amount'] == '250.00'
        assert transaction(client, headers, description='=HYPERLINK("bad")').status_code == 201
        assert "'=HYPERLINK" in client.get('/api/v1/reports/export?month=2026-10').text
        assert client.get('/api/v1/transactions?month=2026-10&search=HYPERLINK').json()['total'] == 1
        assert client.get('/api/v1/transactions?month=2026-10&page_size=101').status_code == 422
        assert client.get('/api/v1/transactions?month=2026-11').json()['total'] == 0

def test_origin_cookie_rotation_expiry_and_rate_limit():
    with TestClient(app) as client:
        headers = account(client)
        old = client.cookies.get('track_session')
        login = client.post('/api/v1/auth/login', json={'email': 'one@example.com', 'password': 'VeryGoodPass123!'})
        assert login.status_code == 200
        assert 'httponly' in login.headers['set-cookie'].lower()
        assert 'samesite=lax' in login.headers['set-cookie'].lower()
        assert client.cookies.get('track_session') != old
        headers = {'X-CSRF-Token': login.json()['csrf']}
        assert transaction(client, {**headers, 'Origin': 'https://evil.example'}).status_code == 403
        with Session(engine) as db:
            session = db.get(LoginSession, digest(client.cookies.get('track_session')))
            session.touched -= 1801
            db.commit()
        assert client.get('/api/v1/auth/me').status_code == 401
        for _ in range(4):
            assert client.post('/api/v1/auth/login', json={'email': 'one@example.com', 'password': 'wrong'}).status_code == 401
        assert client.post('/api/v1/auth/login', json={'email': 'one@example.com', 'password': 'wrong'}).status_code == 429

def test_recovery_token_single_use_revokes_sessions():
    import time
    with TestClient(app) as client:
        account(client)
        user = client.get('/api/v1/auth/me').json()
        token = 'test-recovery-token-that-is-long-and-random'
        with Session(engine) as db:
            db.add(RecoveryToken(token_hash=digest(token), user_id=user['id'], expires=int(time.time()) + 600))
            db.commit()
        data = {'token': token, 'password': 'NewVeryGoodPass123!'}
        assert client.post('/api/v1/auth/reset', json=data).status_code == 200
        assert client.get('/api/v1/auth/me').status_code == 401
        assert client.post('/api/v1/auth/reset', json=data).status_code == 400
        assert client.post('/api/v1/auth/login', json={'email': 'one@example.com', 'password': data['password']}).status_code == 200

def test_health_and_sanitized_errors():
    with TestClient(app) as client:
        assert client.get('/api/v1/health/live').json()['status'] == 'ok'
        assert client.get('/api/v1/health/ready').json()['status'] == 'ready'
        invalid = client.post('/api/v1/auth/login', json={'email': 'bad', 'password': 'secret'})
        assert invalid.status_code == 422
        assert 'secret' not in invalid.text
        assert 'X-Request-ID' in invalid.headers
