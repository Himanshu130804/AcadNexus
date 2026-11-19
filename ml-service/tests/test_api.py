import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def test_health_is_public():
    response = client.get('/health')
    assert response.status_code == 200
    assert response.json()['status'] == 'ok'

def test_analysis_requires_service_key():
    response = client.post('/v1/analyze', json={})
    assert response.status_code == 401

def test_analysis_returns_explainable_signals(monkeypatch):
    import app.main as service
    monkeypatch.setattr(service, 'SERVICE_KEY', 'unit-test-secret')
    response = client.post('/v1/analyze', headers={'X-ML-Service-Key': 'unit-test-secret'}, json={
        'attendanceRate': 62.5,
        'attendanceSessions': 8,
        'assignmentCompletionRate': 40,
        'assignmentsTotal': 5,
        'results': [
            {'subject': 'Structures', 'marks': 30, 'maxMarks': 100, 'semester': '1'},
            {'subject': 'History', 'marks': 75, 'maxMarks': 100, 'semester': '2'},
            {'subject': 'Design', 'marks': 40, 'maxMarks': 100, 'semester': '3'},
            {'subject': 'Services', 'marks': 42, 'maxMarks': 100, 'semester': '4'},
        ]
    })
    assert response.status_code == 200
    body = response.json()
    assert body['summary']['averagePercentage'] == 46.75
    assert body['attentionSignals']
    assert all('evidence' in item for item in body['attentionSignals'])
    assert body['prediction']['available'] is False

def test_analysis_rejects_out_of_range_attendance(monkeypatch):
    import app.main as service
    monkeypatch.setattr(service, 'SERVICE_KEY', 'unit-test-secret')
    response = client.post('/v1/analyze', headers={'X-ML-Service-Key': 'unit-test-secret'}, json={'attendanceRate': 130})
    assert response.status_code == 422

def test_cohort_clustering_requires_six_and_returns_aggregate_profiles(monkeypatch):
    import app.main as service
    monkeypatch.setattr(service, 'SERVICE_KEY', 'unit-test-secret')
    rows = [{'attendanceRate': 55 + i * 5, 'averagePercentage': 45 + i * 6, 'assignmentCompletionRate': 50 + i * 5} for i in range(6)]
    response = client.post('/v1/clusters', headers={'X-ML-Service-Key': 'unit-test-secret'}, json={'students': rows})
    assert response.status_code == 200
    body = response.json()
    assert body['clusters']
    assert sum(item['count'] for item in body['clusters']) == 6
    assert all('description' in item for item in body['clusters'])

def test_regression_evaluation_uses_chronological_holdout(monkeypatch):
    import app.main as service
    monkeypatch.setattr(service, 'SERVICE_KEY', 'unit-test-secret')
    rows = [{'features': [i, i % 4], 'target': 20 + i * 1.5 + (i % 4)} for i in range(25)]
    response = client.post('/v1/evaluate-regression', headers={'X-ML-Service-Key': 'unit-test-secret'}, json={'rows': rows})
    assert response.status_code == 200
    body = response.json()
    assert body['available'] is True
    assert body['evaluation']['trainRecords'] == 20
    assert body['evaluation']['testRecords'] == 5
    assert body['evaluation']['mae'] >= 0

def test_xlsx_template_and_parser_are_service_authenticated(monkeypatch):
    import io
    import app.main as service
    from openpyxl import Workbook
    monkeypatch.setattr(service, 'SERVICE_KEY', 'unit-test-secret')
    template = client.get('/v1/result-template', headers={'X-ML-Service-Key': 'unit-test-secret'})
    assert template.status_code == 200
    assert template.headers['content-type'].startswith('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    workbook = Workbook()
    sheet = workbook.active
    sheet.append(['rollNumber', 'courseCode', 'courseName', 'semester', 'examSession', 'marks', 'maxMarks', 'grade'])
    sheet.append(['R001', 'CS101', 'Computing', '1', 'May 2026', 80, 100, 'A'])
    output = io.BytesIO()
    workbook.save(output)
    parsed = client.post('/v1/parse-xlsx', headers={'X-ML-Service-Key': 'unit-test-secret'}, files={'file': ('results.xlsx', output.getvalue(), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')})
    assert parsed.status_code == 200
    assert parsed.json()['totalRows'] == 1
    assert parsed.json()['records'][0]['record']['rollNumber'] == 'R001'


def test_xlsx_parser_rejects_formula_cells(monkeypatch):
    import io
    import app.main as service
    from openpyxl import Workbook
    monkeypatch.setattr(service, 'SERVICE_KEY', 'unit-test-secret')
    workbook = Workbook()
    sheet = workbook.active
    sheet.append(['rollNumber', 'courseCode', 'courseName', 'semester', 'examSession', 'marks', 'maxMarks'])
    sheet.append(['R001', 'CS101', 'Computing', '1', 'May 2026', '=40+40', 100])
    output = io.BytesIO()
    workbook.save(output)
    response = client.post('/v1/parse-xlsx', headers={'X-ML-Service-Key': 'unit-test-secret'}, files={'file': ('results.xlsx', output.getvalue(), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')})
    assert response.status_code == 200
    assert response.json()['records'][0]['errors'] == ['Formula cells are not permitted']


def test_prediction_model_is_unavailable_without_training_data(monkeypatch, tmp_path):
    import app.main as service
    monkeypatch.setattr(service, 'SERVICE_KEY', 'unit-test-secret')
    monkeypatch.setattr(service, 'MODEL_DIR', str(tmp_path))
    monkeypatch.setattr(service, 'MODEL_PATH', str(tmp_path / 'academic-outcome.joblib'))
    status = client.get('/v1/model-status', headers={'X-ML-Service-Key': 'unit-test-secret'})
    assert status.status_code == 200
    assert status.json()['available'] is False
    prediction = client.post('/v1/predict-regression', headers={'X-ML-Service-Key': 'unit-test-secret'}, json={'features': [1, 2]})
    assert prediction.status_code == 503


def test_prediction_training_uses_chronological_period_holdout(monkeypatch, tmp_path):
    import app.main as service
    monkeypatch.setattr(service, 'SERVICE_KEY', 'unit-test-secret')
    monkeypatch.setattr(service, 'MODEL_DIR', str(tmp_path))
    monkeypatch.setattr(service, 'MODEL_PATH', str(tmp_path / 'academic-outcome.joblib'))
    rows = [{'period': f'2025-{period:02d}', 'features': [i, i % 5], 'target': 30 + i * 1.2} for period in range(1, 7) for i in range(5)]
    trained = client.post('/v1/train-regression', headers={'X-ML-Service-Key': 'unit-test-secret'}, json={'rows': rows})
    assert trained.status_code == 200
    body = trained.json()
    assert body['available'] is True
    assert body['evaluation']['trainRecords'] == 20
    assert body['evaluation']['testRecords'] == 10
    prediction = client.post('/v1/predict-regression', headers={'X-ML-Service-Key': 'unit-test-secret'}, json={'features': [4, 4]})
    assert prediction.status_code == 200
    assert prediction.json()['isOfficialResult'] is False


def test_xlsx_parser_rejects_unmapped_columns(monkeypatch):
    import io
    import app.main as service
    from openpyxl import Workbook
    monkeypatch.setattr(service, 'SERVICE_KEY', 'unit-test-secret')
    workbook = Workbook()
    sheet = workbook.active
    sheet.append(['rollNumber', 'courseCode', 'courseName', 'semester', 'examSession', 'marks', 'maxMarks', 'internalMarks'])
    sheet.append(['R001', 'CS101', 'Computing', '1', 'May 2026', 80, 100, 20])
    output = io.BytesIO()
    workbook.save(output)
    response = client.post('/v1/parse-xlsx', headers={'X-ML-Service-Key': 'unit-test-secret'}, files={'file': ('results.xlsx', output.getvalue(), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')})
    assert response.status_code == 422
    assert 'Unsupported spreadsheet columns' in response.text


def test_prediction_training_rejects_non_chronological_rows(monkeypatch, tmp_path):
    import app.main as service
    monkeypatch.setattr(service, 'SERVICE_KEY', 'unit-test-secret')
    monkeypatch.setattr(service, 'MODEL_DIR', str(tmp_path))
    monkeypatch.setattr(service, 'MODEL_PATH', str(tmp_path / 'academic-outcome.joblib'))
    rows = [{'period': f'2025-{period:02d}', 'features': [i, i % 5], 'target': 40 + i} for period in range(1, 7) for i in range(5)]
    rows[0], rows[-1] = rows[-1], rows[0]
    response = client.post('/v1/train-regression', headers={'X-ML-Service-Key': 'unit-test-secret'}, json={'rows': rows})
    assert response.status_code == 422


def test_csv_parser_requires_service_key_and_parses_records(monkeypatch):
    import app.main as service
    monkeypatch.setattr(service, 'SERVICE_KEY', 'unit-test-secret')
    body = b'rollNumber,courseCode,courseName,semester,examSession,marks,maxMarks\r\nR001,CS101,Computing,1,May 2026,80,100\r\n'
    unauthenticated = client.post('/v1/parse-csv', files={'file': ('results.csv', body, 'text/csv')})
    assert unauthenticated.status_code == 401
    parsed = client.post('/v1/parse-csv', headers={'X-ML-Service-Key': 'unit-test-secret'}, files={'file': ('results.csv', body, 'text/csv')})
    assert parsed.status_code == 200
    assert parsed.json()['totalRows'] == 1
    assert parsed.json()['records'][0]['record']['courseCode'] == 'CS101'


def test_csv_parser_rejects_wrong_extension_and_unmapped_columns(monkeypatch):
    import app.main as service
    monkeypatch.setattr(service, 'SERVICE_KEY', 'unit-test-secret')
    headers = {'X-ML-Service-Key': 'unit-test-secret'}
    assert client.post('/v1/parse-csv', headers=headers, files={'file': ('results.xlsx', b'a,b', 'text/csv')}).status_code == 415
    assert client.post('/v1/parse-csv', headers=headers, files={'file': ('results.csv', b'rollNumber,bogus\r\n1,2', 'text/csv')}).status_code == 422
    template = client.get('/v1/result-template.csv', headers=headers)
    assert template.status_code == 200 and template.text.startswith('rollNumber,studentName')
