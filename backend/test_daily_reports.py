import csv
import io

from fastapi.testclient import TestClient
from backend.test_api import app, account, category, transaction, clean, close_test_database


def test_daily_totals_history_and_export_are_date_scoped_and_private():
    with TestClient(app) as a, TestClient(app) as b:
        headers = account(a)
        assert transaction(a, headers, '0.10', '2026-01-01').status_code == 201
        assert transaction(a, headers, '0.20', '2026-01-01', description='=1+1').status_code == 201
        assert transaction(a, headers, '10.00', '2025-12-31').status_code == 201
        assert transaction(a, headers, '999.00', '2026-01-02').status_code == 201
        assert transaction(a, headers, '50.00', '2026-01-01', type='INCOME', category_id=category(a, 'INCOME')).status_code == 201
        other = account(b, 'other@example.com')
        assert transaction(b, other, '444.00', '2026-01-01').status_code == 201
        response = a.get('/api/v1/reports/daily?day=2026-01-01')
        assert response.status_code == 200
        report = response.json()
        assert (report['income'], report['expense'], report['balance'], report['count']) == ('50.00', '0.30', '49.70', 3)
        assert report['breakdown'] == [{'category_id': category(a), 'amount': '0.30'}]
        assert report['previous'] == {'date': '2025-12-31', 'income': '0.00', 'expense': '10.00'}
        assert len(report['days']) == 7
        assert report['days'][0] == {'date': '2025-12-26', 'income': '0.00', 'expense': '0.00'}
        assert report['days'][-1] == {'date': '2026-01-01', 'income': '50.00', 'expense': '0.30'}
        download = a.get('/api/v1/reports/export?day=2026-01-01')
        assert download.status_code == 200
        assert 'track-expense-2026-01-01.csv' in download.headers['content-disposition']
        rows = list(csv.reader(io.StringIO(download.content.decode('utf-8-sig'))))
        assert len(rows) == 4
        assert all(row[0] == '2026-01-01' for row in rows[1:])
        assert any(row[3] == "'=1+1" for row in rows[1:])
        assert a.get('/api/v1/reports/export?month=2026-01').status_code == 200
        assert b.get('/api/v1/reports/daily?day=2026-01-01').json()['expense'] == '444.00'


def test_daily_empty_dates_validation_and_authentication():
    with TestClient(app) as client:
        assert client.get('/api/v1/reports/daily?day=2026-10-29').status_code == 401
        assert client.get('/api/v1/reports/export?day=2026-10-29').status_code == 401
        account(client)
        empty = client.get('/api/v1/reports/daily?day=2024-03-01').json()
        assert (empty['income'], empty['expense'], empty['balance'], empty['count'], empty['breakdown']) == ('0.00', '0.00', '0.00', 0, [])
        assert empty['previous']['date'] == '2024-02-29'
        for day in ['2026-02-29', '2026-13-01', '20261029', '1999-12-31', '2101-01-01']:
            assert client.get('/api/v1/reports/daily', params={'day': day}).status_code == 422
            assert client.get('/api/v1/reports/export', params={'day': day}).status_code == 422
        assert client.get('/api/v1/reports/export').status_code == 422
        assert client.get('/api/v1/reports/export?day=2026-10-29&month=2026-10').status_code == 422
