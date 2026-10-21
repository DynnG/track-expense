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
def test_access_logs_redact_sensitive_query_parameters():
    import logging
    from backend.app import SafeAccessLog
    record = logging.LogRecord('uvicorn.access', logging.INFO, '', 0, '%s - "%s %s HTTP/%s" %d', ('client', 'GET', '/api/v1/transactions?search=secret', '1.1', 303), None)
    SafeAccessLog().filter(record)
    assert 'secret' not in record.getMessage()

@pytest.fixture(autouse=True)
def clean():
    Base.metadata.create_all(engine)
    with Session(engine) as db:
        for model in [Transaction, Budget, LoginSession, RecoveryToken, AuditEvent, Category, RateBucket, User]:
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

def test_removed_google_routes_and_email_auth_still_work():
    with TestClient(app) as client:
        for path in ['/auth/providers', '/auth/google/start', '/auth/google/status', '/auth/google/callback?code=ignored']:
            assert client.get('/api/v1' + path, follow_redirects=False).status_code == 404
        assert client.post('/api/v1/auth/google/link', json={}).status_code == 404
        headers = account(client)
        assert client.get('/api/v1/auth/me').status_code == 200
        assert client.post('/api/v1/auth/logout', headers=headers, json={}).status_code == 204
        assert client.post('/api/v1/auth/login', json={'email': 'one@example.com', 'password': 'VeryGoodPass123!'}).status_code == 200

def test_aggregated_reports_track_edits_deletes_and_month_boundaries():
    from sqlalchemy import event
    with TestClient(app) as client:
        headers = account(client)
        expense_category = category(client)
        income_category = category(client, 'INCOME')
        tx = transaction(client, headers, amount='0.10', date='2026-01-31').json()
        transaction(client, headers, amount='0.20', date='2026-01-31')
        transaction(client, headers, amount='5.00', date='2025-12-31')
        transaction(client, headers, amount='99.00', date='2026-02-01')
        transaction(client, headers, amount='123.45', date='2025-07-31')
        transaction(client, headers, amount='1.00', date='2026-01-01', category_id=income_category, type='INCOME')
        calls = []
        def count_queries(conn, cursor, statement, parameters, context, executemany):
            if statement.lstrip().upper().startswith('SELECT') and 'FROM transactions' in statement:
                calls.append(statement)
        event.listen(engine, 'before_cursor_execute', count_queries)
        try:
            report = client.get('/api/v1/reports/monthly?month=2026-01').json()
        finally:
            event.remove(engine, 'before_cursor_execute', count_queries)
        assert len(calls) == 2
        assert all('GROUP BY' in query for query in calls)
        assert report['expense'] == '0.30' and report['balance'] == '0.70' and report['count'] == 3
        assert report['trends'][0]['month'] == '2025-08'
        assert report['previous']['expense'] == '5.00'
        assert report['days'][-1] == {'date': '2026-01-31', 'income': '0.00', 'expense': '0.30'}
        assert report['breakdown'] == [{'category_id': expense_category, 'amount': '0.30'}]
        assert report['breakdown'] == client.get('/api/v1/reports/categories?month=2026-01').json()
        data = {k: v for k, v in tx.items() if k != 'id'}
        assert client.patch('/api/v1/transactions/' + tx['id'], headers=headers, json={**data, 'amount': '0.40'}).status_code == 200
        assert client.get('/api/v1/reports/monthly?month=2026-01').json()['expense'] == '0.60'
        assert client.delete('/api/v1/transactions/' + tx['id'], headers=headers).status_code == 204
        assert client.get('/api/v1/reports/monthly?month=2026-01').json()['expense'] == '0.20'
        empty = client.get('/api/v1/reports/monthly?month=2000-01').json()
        assert empty['expense'] == '0.00' and empty['count'] == 0 and empty['breakdown'] == []

def test_transaction_pagination_filters_and_stable_date_order():
    with TestClient(app) as client:
        headers = account(client)
        for day in range(1, 13):
            transaction(client, headers, date=f'2026-10-{day:02d}', description=f'Expense {day}')
        first = client.get('/api/v1/transactions?month=2026-10&page_size=10').json()
        second = client.get('/api/v1/transactions?month=2026-10&page_size=10&page=2').json()
        assert first['total'] == 12 and len(first['items']) == 10 and len(second['items']) == 2
        assert first['items'][0]['transaction_date'] == '2026-10-12'
        assert not ({t['id'] for t in first['items']} & {t['id'] for t in second['items']})
        assert client.get('/api/v1/transactions?month=2026-10&search=Expense%2012&type=EXPENSE').json()['total'] == 1
