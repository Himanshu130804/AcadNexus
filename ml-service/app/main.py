from __future__ import annotations

import hmac
import os
import tempfile
import joblib
from datetime import datetime, timezone
from typing import Any

import numpy as np
from fastapi import Depends, FastAPI, Header, HTTPException, UploadFile, File, Response
from pydantic import BaseModel, Field, ConfigDict
from sklearn.cluster import KMeans
from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sklearn.preprocessing import StandardScaler
from sklearn.pipeline import Pipeline
from openpyxl import load_workbook, Workbook
from io import BytesIO
from zipfile import ZipFile

from .result_parsing import ResultFileError, map_headers, parse_csv_bytes, csv_template

SERVICE_KEY = os.getenv("ML_SERVICE_API_KEY", "")
MODEL_VERSION = "acadnexus-analytics-1.1.0"
MODEL_DIR = os.getenv("ACADNEXUS_MODEL_DIR", "/tmp/acadnexus-models")
MODEL_PATH = os.path.join(MODEL_DIR, "academic-outcome.joblib")
app = FastAPI(title="AcadNexus ML Service", version=MODEL_VERSION)

def authorize(x_ml_service_key: str | None = Header(default=None)) -> None:
    if not SERVICE_KEY or not x_ml_service_key or not hmac.compare_digest(SERVICE_KEY, x_ml_service_key):
        raise HTTPException(status_code=401, detail="Service authentication failed")




class ResultItem(BaseModel):
    model_config = ConfigDict(extra="ignore")
    subject: str = Field(min_length=1, max_length=120)
    marks: float = Field(ge=0)
    maxMarks: float = Field(gt=0)
    semester: str | None = None
    examSession: str | None = None


class AnalysisRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")
    attendanceRate: float | None = Field(default=None, ge=0, le=100)
    attendanceSessions: int = Field(default=0, ge=0, le=100000)
    assignmentCompletionRate: float | None = Field(default=None, ge=0, le=100)
    assignmentsTotal: int = Field(default=0, ge=0, le=100000)
    results: list[ResultItem] = Field(default_factory=list, max_length=500)


@app.post("/v1/parse-xlsx", dependencies=[Depends(authorize)])
async def parse_xlsx(file: UploadFile = File(...)) -> dict[str, Any]:
    """Parse an uploaded XLSX without evaluating formulas or external workbook links."""
    name = (file.filename or "").lower()
    if not name.endswith(".xlsx"):
        raise HTTPException(status_code=415, detail="Only .xlsx workbooks are accepted")
    raw = await file.read(5 * 1024 * 1024 + 1)
    if len(raw) > 5 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Workbook exceeds the 5 MB limit")
    try:
        with ZipFile(BytesIO(raw)) as archive:
            entries = archive.infolist()
            if len(entries) > 100 or sum(entry.file_size for entry in entries) > 50 * 1024 * 1024:
                raise HTTPException(status_code=413, detail="Workbook expands beyond the safe archive limits")
            if any(entry.filename.startswith("/") or ".." in entry.filename.split("/") for entry in entries):
                raise HTTPException(status_code=422, detail="Workbook contains unsafe archive paths")
        workbook = load_workbook(BytesIO(raw), read_only=True, data_only=False, keep_links=False)
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=422, detail="Workbook is malformed or cannot be opened")
    if len(workbook.sheetnames) != 1:
        workbook.close()
        raise HTTPException(status_code=422, detail="Use a workbook with exactly one worksheet")
    sheet = workbook.active
    if sheet.sheet_state != "visible":
        workbook.close()
        raise HTTPException(status_code=422, detail="The result worksheet must be visible")
    rows = sheet.iter_rows()
    try:
        header_cells = next(rows)
    except StopIteration:
        workbook.close()
        raise HTTPException(status_code=422, detail="Worksheet is empty")
    if any(cell.data_type == "f" for cell in header_cells):
        workbook.close()
        raise HTTPException(status_code=422, detail="Formula cells are not permitted")
    headers = [str(cell.value or "").strip() for cell in header_cells]
    while headers and not headers[-1]:
        headers.pop()
    try:
        mapped = map_headers(headers)
    except ResultFileError as error:
        workbook.close()
        raise HTTPException(status_code=error.status, detail=error.detail)
    records = []
    for row_number, cells in enumerate(rows, start=2):
        if all(cell.value is None for cell in cells):
            continue
        if any(cell.data_type == "f" for cell in cells):
            records.append({"sourceRow": row_number, "record": {}, "errors": ["Formula cells are not permitted"]})
            continue
        record: dict[str, Any] = {}
        for index, field_name in enumerate(mapped):
            if field_name and field_name not in record:
                value = cells[index].value if index < len(cells) else None
                if isinstance(value, datetime):
                    value = value.isoformat()
                record[field_name] = value
        records.append({"sourceRow": row_number, "record": record, "errors": []})
        if len(records) > 5000:
            workbook.close()
            raise HTTPException(status_code=413, detail="Workbook exceeds the 5,000 data row limit")
    workbook.close()
    return {"sheet": sheet.title, "headers": headers, "records": records, "totalRows": len(records)}


@app.post("/v1/parse-csv", dependencies=[Depends(authorize)])
async def parse_csv(file: UploadFile = File(...)) -> dict[str, Any]:
    """Parse an official-result CSV using the same column contract and safety rules as XLSX."""
    name = (file.filename or "").lower()
    if not name.endswith(".csv"):
        raise HTTPException(status_code=415, detail="Only .csv files are accepted")
    raw = await file.read(5 * 1024 * 1024 + 1)
    try:
        return parse_csv_bytes(raw)
    except ResultFileError as error:
        raise HTTPException(status_code=error.status, detail=error.detail)


@app.get("/v1/result-template.csv", dependencies=[Depends(authorize)])
def result_template_csv() -> Response:
    return Response(content=csv_template(), media_type="text/csv; charset=utf-8", headers={"Content-Disposition": "attachment; filename=acadnexus-result-template.csv"})


@app.get("/v1/result-template", dependencies=[Depends(authorize)])
def result_template() -> Response:
    workbook = Workbook()
    sheet = workbook.active
    sheet.title = "Official Results"
    sheet.append(["rollNumber", "studentName", "courseCode", "courseName", "semester", "examSession", "marks", "maxMarks", "grade"])
    sheet.freeze_panes = "A2"
    for column, width in {"A": 22, "B": 26, "C": 18, "D": 28, "E": 12, "F": 20, "G": 14, "H": 14, "I": 12}.items():
        sheet.column_dimensions[column].width = width
    output = BytesIO()
    workbook.save(output)
    return Response(content=output.getvalue(), media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", headers={"Content-Disposition": "attachment; filename=acadnexus-result-template.xlsx"})


class CohortStudent(BaseModel):
    attendanceRate: float = Field(ge=0, le=100)
    averagePercentage: float = Field(ge=0, le=100)
    assignmentCompletionRate: float = Field(ge=0, le=100)


class CohortRequest(BaseModel):
    students: list[CohortStudent] = Field(min_length=6, max_length=2000)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "modelVersion": MODEL_VERSION}


@app.post("/v1/analyze", dependencies=[Depends(authorize)])
def analyze(payload: AnalysisRequest) -> dict[str, Any]:
    percentages = [round((r.marks / r.maxMarks) * 100, 2) for r in payload.results]
    average = float(np.mean(percentages)) if percentages else None
    sorted_results = payload.results  # Preserve the backend chronological order.
    trend = "insufficient_data"
    trend_delta = None
    semester_groups: dict[str, list[float]] = {}
    for result, value in zip(sorted_results, percentages):
        group_key = f"{result.semester or 'unspecified'}|{result.examSession or 'unspecified'}"
        semester_groups.setdefault(group_key, []).append(value)
    group_averages = [float(np.mean(values)) for values in semester_groups.values()]
    if len(group_averages) >= 2:
        # Compare semester/exam-session averages rather than unrelated adjacent subjects.
        trend_delta = round(group_averages[-1] - group_averages[-2], 2)
        trend = "improving" if trend_delta >= 3 else "declining" if trend_delta <= -3 else "stable"

    anomalies: list[dict[str, Any]] = []
    if len(percentages) >= 4:
        median = float(np.median(percentages))
        for result, value in zip(sorted_results, percentages):
            if value <= median - 20:
                anomalies.append({"type": "result_deviation", "subject": result.subject,
                                  "value": value, "referenceMedian": round(median, 2),
                                  "evidence": f"This result is {round(median - value, 1)} percentage points below the available-record median."})

    attention: list[dict[str, str]] = []
    if payload.attendanceRate is not None and payload.attendanceSessions >= 3 and payload.attendanceRate < 75:
        attention.append({"signal": "attendance", "severity": "high" if payload.attendanceRate < 60 else "moderate",
                          "evidence": f"Attendance is {payload.attendanceRate:.1f}% across {payload.attendanceSessions} recorded sessions."})
    if average is not None and len(percentages) >= 2 and average < 45:
        attention.append({"signal": "academic_performance", "severity": "moderate",
                          "evidence": f"Average published result is {average:.1f}% across {len(percentages)} result records."})
    if payload.assignmentCompletionRate is not None and payload.assignmentsTotal >= 3 and payload.assignmentCompletionRate < 60:
        attention.append({"signal": "assignment_completion", "severity": "moderate",
                          "evidence": f"Completion is {payload.assignmentCompletionRate:.1f}% across {payload.assignmentsTotal} tracked assignments."})

    strengths = sorted([{"subject": r.subject, "percentage": p} for r, p in zip(sorted_results, percentages)],
                       key=lambda x: x["percentage"], reverse=True)
    recommendations: list[dict[str, str]] = []
    if payload.attendanceRate is not None and payload.attendanceRate < 85:
        recommendations.append({"type": "attendance", "title": "Review attendance", "reason": "Check missed sessions and plan to attend upcoming classes consistently."})
    if strengths and strengths[-1]["percentage"] < 60:
        recommendations.append({"type": "subject_revision", "title": f"Review {strengths[-1]['subject']}", "reason": "It is the lowest percentage among the available published result records."})
    if payload.assignmentCompletionRate is not None and payload.assignmentCompletionRate < 80:
        recommendations.append({"type": "assignments", "title": "Plan assignment submissions", "reason": "Review pending work and upcoming deadlines."})

    return {"modelVersion": MODEL_VERSION, "generatedAt": datetime.now(timezone.utc).isoformat(),
            "dataQuality": {"resultRecords": len(percentages), "attendanceSessions": payload.attendanceSessions,
                            "assignmentRecords": payload.assignmentsTotal},
            "summary": {"averagePercentage": round(average, 2) if average is not None else None,
                        "trend": trend, "trendDelta": trend_delta,
                        "attendanceRate": payload.attendanceRate,
                        "assignmentCompletionRate": payload.assignmentCompletionRate},
            "subjectResults": strengths, "anomalies": anomalies,
            "attentionSignals": attention, "recommendations": recommendations,
            "prediction": {"available": False, "reason": "A reliable time-aware training dataset with sufficient prior student outcomes is not supplied to this request."}}


@app.post("/v1/clusters", dependencies=[Depends(authorize)])
def clusters(payload: CohortRequest) -> dict[str, Any]:
    matrix = np.array([[s.attendanceRate, s.averagePercentage, s.assignmentCompletionRate] for s in payload.students], dtype=float)
    scaler = StandardScaler()
    scaled = scaler.fit_transform(matrix)
    model = KMeans(n_clusters=min(3, len(payload.students)), random_state=42, n_init=10)
    labels = model.fit_predict(scaled)
    profiles = []
    for label in sorted(set(labels.tolist())):
        members = matrix[labels == label]
        profiles.append({"cluster": int(label) + 1, "count": int(len(members)),
                         "meanAttendance": round(float(members[:, 0].mean()), 1),
                         "meanPerformance": round(float(members[:, 1].mean()), 1),
                         "meanAssignmentCompletion": round(float(members[:, 2].mean()), 1),
                         "description": "Descriptive cohort pattern only; not a student label or eligibility decision."})
    return {"modelVersion": MODEL_VERSION, "clusters": profiles}


@app.get("/v1/model-status", dependencies=[Depends(authorize)])
def model_status() -> dict[str, Any]:
    if not os.path.exists(MODEL_PATH):
        return {"available": False, "modelVersion": None, "reason": "No institution-approved historical model has been trained and persisted."}
    try:
        artifact = joblib.load(MODEL_PATH)
        return {"available": True, "modelVersion": artifact.get("modelVersion"), "trainedAt": artifact.get("trainedAt"), "evaluation": artifact.get("evaluation"), "featureCount": artifact.get("featureCount")}
    except Exception:
        return {"available": False, "modelVersion": None, "reason": "Saved model artifact could not be loaded; retraining is required."}


@app.post("/v1/train-regression", dependencies=[Depends(authorize)])
def train_regression(payload: dict[str, Any]) -> dict[str, Any]:
    """Train only on supplied real, chronologically ordered, institution-authorized history."""
    rows = payload.get("rows", [])
    if not isinstance(rows, list) or len(rows) < 30:
        return {"available": False, "reason": "At least 30 real historical records are required; no model was trained."}
    try:
        periods = [str(row["period"]) for row in rows]
        x = np.asarray([[float(v) for v in row["features"]] for row in rows], dtype=float)
        y = np.asarray([float(row["target"]) for row in rows], dtype=float)
    except (KeyError, TypeError, ValueError):
        raise HTTPException(status_code=422, detail="Each row requires period, numeric features and numeric target")
    if x.ndim != 2 or x.shape[1] < 2 or not np.isfinite(x).all() or not np.isfinite(y).all():
        raise HTTPException(status_code=422, detail="Training data must contain at least two finite numeric features")
    if len(set(periods)) < 4 or periods != sorted(periods):
        raise HTTPException(status_code=422, detail="Records must be chronologically ordered and span at least four distinct periods")
    unique_periods = sorted(set(periods))
    split_period = max(1, min(len(unique_periods) - 1, int(len(unique_periods) * 0.8)))
    train_periods = set(unique_periods[:split_period])
    train_mask = np.asarray([period in train_periods for period in periods])
    test_mask = ~train_mask
    if int(train_mask.sum()) < 20 or int(test_mask.sum()) < 5:
        return {"available": False, "reason": "Chronological training/holdout split does not contain enough records."}
    model = Pipeline([("scale", StandardScaler()), ("regressor", RandomForestRegressor(n_estimators=200, random_state=42, min_samples_leaf=2))])
    model.fit(x[train_mask], y[train_mask])
    prediction = model.predict(x[test_mask])
    evaluation = {"trainRecords": int(train_mask.sum()), "testRecords": int(test_mask.sum()), "trainPeriods": sorted(train_periods), "testPeriods": sorted(set(np.asarray(periods)[test_mask].tolist())), "mae": round(float(mean_absolute_error(y[test_mask], prediction)), 3), "rmse": round(float(np.sqrt(mean_squared_error(y[test_mask], prediction))), 3), "r2": round(float(r2_score(y[test_mask], prediction)), 3) if int(test_mask.sum()) >= 2 else None}
    os.makedirs(MODEL_DIR, exist_ok=True)
    artifact = {"model": model, "featureCount": int(x.shape[1]), "modelVersion": f"acadnexus-regression-{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}", "trainedAt": datetime.now(timezone.utc).isoformat(), "evaluation": evaluation}
    fd, temp_path = tempfile.mkstemp(prefix="acadnexus-model-", suffix=".joblib", dir=MODEL_DIR)
    os.close(fd)
    try:
        joblib.dump(artifact, temp_path)
        os.replace(temp_path, MODEL_PATH)
    finally:
        if os.path.exists(temp_path): os.unlink(temp_path)
    return {"available": True, "modelVersion": artifact["modelVersion"], "evaluation": evaluation, "note": "Chronological holdout evaluation; this model is only as representative as the authorized training dataset supplied."}


@app.post("/v1/predict-regression", dependencies=[Depends(authorize)])
def predict_regression(payload: dict[str, Any]) -> dict[str, Any]:
    if not os.path.exists(MODEL_PATH):
        raise HTTPException(status_code=503, detail="No evaluated academic prediction model is available.")
    try:
        artifact = joblib.load(MODEL_PATH)
        features = np.asarray(payload.get("features", []), dtype=float).reshape(1, -1)
        if features.shape[1] != artifact["featureCount"] or not np.isfinite(features).all():
            raise ValueError("Feature count or values are invalid")
        value = float(artifact["model"].predict(features)[0])
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error))
    except Exception:
        raise HTTPException(status_code=503, detail="The saved prediction model is unavailable; retraining is required.")
    return {"available": True, "prediction": round(value, 3), "modelVersion": artifact["modelVersion"], "evaluation": artifact["evaluation"], "isOfficialResult": False, "note": "Decision-support estimate only; not an official result or guaranteed outcome."}


@app.post("/v1/evaluate-regression", dependencies=[Depends(authorize)])
def evaluate_regression(payload: dict[str, Any]) -> dict[str, Any]:
    """Offline evaluation helper. Requires chronological rows and at least 20 samples."""
    rows = payload.get("rows", [])
    if not isinstance(rows, list) or len(rows) < 20:
        return {"available": False, "reason": "At least 20 chronological historical records are required."}
    try:
        x = np.asarray([[float(v) for v in row["features"]] for row in rows], dtype=float)
        y = np.asarray([float(row["target"]) for row in rows], dtype=float)
    except (KeyError, TypeError, ValueError):
        raise HTTPException(status_code=422, detail="Each row requires numeric features and target")
    if x.ndim != 2 or not np.isfinite(x).all() or not np.isfinite(y).all():
        raise HTTPException(status_code=422, detail="Training data must be finite numeric values")
    split = max(1, int(len(rows) * 0.8))
    if len(rows) - split < 3:
        return {"available": False, "reason": "Insufficient chronological holdout records."}
    model = RandomForestRegressor(n_estimators=150, random_state=42, min_samples_leaf=2)
    model.fit(x[:split], y[:split])
    pred = model.predict(x[split:])
    return {"available": True, "modelVersion": MODEL_VERSION,
            "evaluation": {"trainRecords": split, "testRecords": len(rows)-split,
                           "mae": round(float(mean_absolute_error(y[split:], pred)), 3),
                           "rmse": round(float(np.sqrt(mean_squared_error(y[split:], pred))), 3),
                           "r2": round(float(r2_score(y[split:], pred)), 3) if len(pred) >= 2 else None},
            "note": "Chronological holdout evaluation only; this endpoint does not persist a production model."}
