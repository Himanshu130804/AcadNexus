import crypto from "crypto";
import mongoose from "mongoose";
import ResultImportBatch from "../models/ResultImportBatch.js";
import OfficialResult from "../models/OfficialResult.js";
import User from "../models/User.js";
import AcademicMaster from "../models/AcademicMaster.js";
import AuditLog from "../models/AuditLog.js";
import Notification from "../models/Notification.js";
import AcademicApplication from "../models/AcademicApplication.js";
import { sameSemester, normalizeSemester } from "../utils/academicValues.js";
import { RESULT_FILE_KINDS, resultFileKind, csvTemplateText } from "../utils/resultFileKind.js";

const managers = ["edp", "super_admin", "institute_admin", "vice_chancellor"];
const publisher = ["super_admin", "institute_admin", "vice_chancellor"];
const institutionOf = (user) => user?.institution?._id || user?.institution || null;
const tenant = (req) => institutionOf(req.user) ? { institutionId: institutionOf(req.user) } : { institutionId: { $exists: false, $eq: null } };
const mlUrl = () => { const value = String(process.env.ML_SERVICE_URL || "").trim(); if (!value) return ""; return (value.startsWith("http://") || value.startsWith("https://") ? value : `http://${value}`).replace(/\/$/, ""); };

async function parseWorkbook(file) {
  const kind = resultFileKind(file.originalname);
  if (!kind) { const error = new Error("Upload a valid .xlsx workbook or .csv file."); error.status = 415; throw error; }
  if (!mlUrl() || !process.env.ML_SERVICE_API_KEY) { const error = new Error("Secure result-file parsing service is not configured."); error.status = 503; throw error; }
  const body = new FormData();
  body.append("file", new Blob([file.buffer], { type: file.mimetype }), file.originalname);
  const response = await fetch(`${mlUrl()}${RESULT_FILE_KINDS[kind].parserPath}`, { method: "POST", headers: { "x-ml-service-key": process.env.ML_SERVICE_API_KEY }, body, signal: AbortSignal.timeout(25000) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) { const error = new Error(data.detail?.message || data.detail || "Workbook validation failed."); error.status = response.status; throw error; }
  return data;
}

async function validateRows(req, parsed) {
  const institutionId = institutionOf(req.user);
  const attemptType = String(req.body.examinationType || "regular").trim().toLowerCase();
  if (!["regular", "supplementary", "improvement", "revaluation"].includes(attemptType)) { const error = new Error("Examination type must be regular, supplementary, improvement or revaluation."); error.status = 422; throw error; }
  const rows = parsed.records || [];
  const candidates = [];
  const seen = new Set();
  const norm = (v) => String(v ?? "").trim();
  for (const source of rows) {
    const raw = source.record || {};
    const parsedMarks = raw.marks === "" || raw.marks == null ? null : Number(raw.marks);
    const parsedMax = raw.maxMarks === "" || raw.maxMarks == null ? null : Number(raw.maxMarks);
    const record = { rollNumber: norm(raw.rollNumber), uploadedStudentName: norm(raw.studentName), courseCode: norm(raw.courseCode), courseName: norm(raw.courseName), semester: norm(raw.semester), examSession: norm(raw.examSession), marks: Number.isFinite(parsedMarks) ? parsedMarks : null, maxMarks: Number.isFinite(parsedMax) ? parsedMax : null, grade: norm(raw.grade) };
    const rowErrors = [...(source.errors || [])];
    for (const key of ["rollNumber", "courseCode", "courseName", "semester", "examSession"]) if (!record[key]) rowErrors.push(`Missing ${key}`);
    if (!Number.isFinite(parsedMarks) || !Number.isFinite(parsedMax) || parsedMax < 1 || parsedMarks < 0 || parsedMarks > parsedMax) rowErrors.push("Marks must be numeric, non-negative and not exceed maxMarks");
    const key = [record.rollNumber, record.courseCode, record.semester, record.examSession].map(x => x.toLowerCase()).join("|");
    if (seen.has(key)) rowErrors.push("Duplicate student/course/semester/session row in workbook");
    seen.add(key);
    candidates.push({ sourceRow: Number(source.sourceRow) || 0, ...record, errors: rowErrors, warnings: [], attemptType });
  }
  const rollNumbers = [...new Set(candidates.map(r => r.rollNumber).filter(Boolean))];
  const codes = [...new Set(candidates.map(r => r.courseCode).filter(Boolean))];
  const [students, subjects] = await Promise.all([
    User.find({ institution: institutionId, role: "student", isActive: true, rollNumber: { $in: rollNumbers } }).select("_id rollNumber name department programme semester").lean(),
    AcademicMaster.find({ institutionId, type: { $in: ["subject", "course"] }, isActive: true, code: { $in: codes } }).select("code name semester programme department").lean(),
  ]);
  const studentMap = new Map(students.map(s => [s.rollNumber, s]));
  const subjectMap = new Map(subjects.map(s => [s.code, s]));
  for (const row of candidates) {
    const student = studentMap.get(row.rollNumber);
    const subject = subjectMap.get(row.courseCode);
    if (!student) row.errors.push("Unknown student roll number in the authenticated institution");
    else {
      row.student = student._id; row.studentName = student.name || "";
      if (row.uploadedStudentName && row.uploadedStudentName.toLowerCase() !== String(student.name || "").toLowerCase()) row.warnings.push("Uploaded student name differs from the authoritative roll-number mapping");
      if (req.body.department && student.department && String(req.body.department).toLowerCase() !== String(student.department).toLowerCase()) row.errors.push("Student does not belong to the selected department");
      if (student.semester && !sameSemester(student.semester, row.semester)) row.errors.push("Semester does not match the student academic mapping");
    }
    if (req.body.subjectCode && String(req.body.subjectCode).toLowerCase() !== row.courseCode.toLowerCase()) row.errors.push("Row subject code does not match the selected subject");
    if (!subject) row.errors.push("Unknown subject/course code in the institution academic master");
    else {
      if (subject.semester && !sameSemester(subject.semester, row.semester)) row.errors.push("Semester does not match the configured subject mapping");
      if (req.body.department && subject.department && String(req.body.department).toLowerCase() !== String(subject.department).toLowerCase()) row.errors.push("Subject does not belong to the selected department");
      if (subject.programme && student?.programme && String(subject.programme).toLowerCase() !== String(student.programme).toLowerCase()) row.errors.push("Subject programme does not match the student's programme");
      if (subject.name && row.courseName && subject.name.toLowerCase() !== row.courseName.toLowerCase()) row.warnings.push("Uploaded course name differs from the academic master; the configured subject name will be used");
      row.courseName = subject.name || row.courseName;
      row.semester = subject.semester || student?.semester || row.semester;
    }
  }
  const existingQuery = candidates.filter(r => r.student && r.courseCode && r.examSession).map(r => ({ student: r.student, courseCode: r.courseCode, examSession: r.examSession, ...(attemptType === "regular" ? { $or: [{ attemptType: "regular" }, { attemptType: { $exists: false } }] } : { attemptType }) }));
  const existing = existingQuery.length ? await OfficialResult.find({ institutionId, $or: existingQuery }).select("student courseCode semester examSession attemptType").lean() : [];
  const existingKeys = new Set(existing.map(r => [String(r.student), r.courseCode, normalizeSemester(r.semester), r.examSession].join("|")));
  for (const row of candidates) {
    const key = [String(row.student || ""), row.courseCode, normalizeSemester(row.semester), row.examSession].join("|");
    if (row.student && existingKeys.has(key)) row.errors.push("An official result already exists for this student/course/semester/session and examination type");
  }
  if (attemptType !== "regular") {
    const applicationQuery = candidates.filter(r => r.student).map(r => ({ student: r.student, courseCode: r.courseCode, examSession: r.examSession, type: attemptType, status: { $in: ["approved", "registered", "completed"] } }));
    const applications = applicationQuery.length ? await AcademicApplication.find({ institutionId, $or: applicationQuery }).select("_id student courseCode semester examSession officialResult revisedMarks status").lean() : [];
    const applicationMap = new Map(applications.map(app => [[String(app.student), app.courseCode, normalizeSemester(app.semester), app.examSession].join("|"), app]));
    for (const row of candidates) {
      const app = applicationMap.get([String(row.student || ""), row.courseCode, normalizeSemester(row.semester), row.examSession].join("|"));
      if (!app) row.errors.push(`No approved ${attemptType} application exists for this student/course/session`);
      else {
        row.application = app._id; row.supersedes = app.officialResult;
        if (app.revisedMarks != null && Number(app.revisedMarks) !== Number(row.marks)) row.errors.push("Imported marks differ from the marks approved in the application review");
      }
    }
  }
  return candidates;
}

function counts(rows) {
  return { totalRows: rows.length, validRows: rows.filter(r => !(r.validationErrors || r.errors || []).length).length, rejectedRows: rows.filter(r => (r.validationErrors || r.errors || []).length).length, warningsCount: rows.reduce((n, r) => n + r.warnings.length, 0) };
}

async function writeAudit(req, action, batch) {
  try { await AuditLog.create({ action, admin: req.user._id, adminRole: req.user.role, status: action, remarks: `Result import batch ${batch._id}: ${action}`, institutionId: institutionOf(req.user) }); }
  catch { /* the batch's persisted history remains the primary workflow audit */ }
}

export async function previewImportWorkbook(req, res, next) {
  try {
    if (!managers.includes(req.user.role) || !institutionOf(req.user)) return res.status(403).json({ message: "Institution result-management access is required." });
    if (!req.file) return res.status(400).json({ message: "Select an XLSX workbook or CSV file." });
    const parsed = await parseWorkbook(req.file);
    if (!parsed.records?.length) return res.status(422).json({ message: "The uploaded file contains no result rows." });
    const rows = await validateRows(req, parsed);
    const summary = counts(rows);
    const session = String(req.body.examSession || rows.find(r => r.examSession)?.examSession || "").trim();
    if (!session || rows.some(r => r.examSession && r.examSession !== session)) return res.status(422).json({ message: "Select one examination session; every row must match it." });
    res.json({ success: true, preview: { filename: req.file.originalname, sheet: parsed.sheet, ...summary, rows: rows.map(r => ({ sourceRow: r.sourceRow, rollNumber: r.rollNumber, studentName: r.studentName, courseCode: r.courseCode, courseName: r.courseName, semester: r.semester, examSession: r.examSession, marks: r.marks, maxMarks: r.maxMarks, errors: r.errors, warnings: r.warnings })) } });
  } catch (error) { next(error); }
}

export async function createImportBatch(req, res, next) {
  try {
    if (!managers.includes(req.user.role) || !institutionOf(req.user)) return res.status(403).json({ message: "Institution result-management access is required." });
    if (!req.file) return res.status(400).json({ message: "Select an XLSX workbook." });
    const parsed = await parseWorkbook(req.file);
    if (!parsed.records?.length) return res.status(422).json({ message: "The workbook contains no result rows." });
    const rows = await validateRows(req, parsed);
    const summary = counts(rows);
    const session = String(req.body.examSession || rows.find(r => r.examSession)?.examSession || "").trim();
    if (!session || rows.some(r => r.examSession && r.examSession !== session)) return res.status(422).json({ message: "Select one examination session; every row must match it." });
    const digest = crypto.createHash("sha256").update(req.file.buffer).digest("hex");
    const duplicate = await ResultImportBatch.findOne({ ...tenant(req), fileSha256: digest, status: { $in: ["needs_correction", "ready", "confirmed", "published"] } }).select("_id status").lean();
    if (duplicate) return res.status(409).json({ message: "This exact workbook has already been submitted.", batchId: duplicate._id, status: duplicate.status });
    const batch = await ResultImportBatch.create({ institutionId: institutionOf(req.user), department: String(req.body.department || ""), academicYear: String(req.body.academicYear || ""), subjectCode: String(req.body.subjectCode || ""), examinationType: String(req.body.examinationType || "regular").trim().toLowerCase(), examSession: session, filename: req.file.originalname.slice(0, 180), fileSha256: digest, uploadedBy: req.user._id, status: summary.rejectedRows ? "needs_correction" : "ready", rows: rows.map(({ errors, ...row }) => ({ ...row, validationErrors: errors })), ...summary, history: [{ action: "uploaded_and_validated", actor: req.user._id, metadata: summary }] });
    await writeAudit(req, "result_import_uploaded", batch, summary);
    res.status(201).json({ success: true, batch: { _id: batch._id, status: batch.status, ...summary }, rows: batch.rows.map(r => ({ _id: r._id, sourceRow: r.sourceRow, rollNumber: r.rollNumber, courseCode: r.courseCode, courseName: r.courseName, errors: r.validationErrors, warnings: r.warnings })) });
  } catch (error) { if (error?.code === 11000) return res.status(409).json({ message: "This workbook has already been submitted in an import batch." }); next(error); }
}

export async function listImportBatches(req, res, next) {
  try {
    if (!managers.includes(req.user.role) || !institutionOf(req.user)) return res.status(403).json({ message: "Not authorized." });
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));
    const [items, total] = await Promise.all([ResultImportBatch.find(tenant(req)).select("filename department academicYear subjectCode examinationType examSession uploadedBy status totalRows validRows rejectedRows warningsCount confirmedAt publishedAt createdAt").populate("uploadedBy", "name email").sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(), ResultImportBatch.countDocuments(tenant(req))]);
    res.json({ success: true, items, page, limit, total });
  } catch (error) { next(error); }
}

export async function getImportBatch(req, res, next) {
  try {
    if (!managers.includes(req.user.role) || !institutionOf(req.user)) return res.status(403).json({ message: "Not authorized." });
    const record = await ResultImportBatch.findOne({ _id: req.params.id, ...tenant(req) }).populate("uploadedBy", "name email").populate("confirmedBy", "name").populate("publishedBy", "name").populate("history.actor", "name");
    if (!record) return res.status(404).json({ message: "Import batch not found." });
    const batch = record.toObject();
    batch.rows = batch.rows.map(({ validationErrors, ...row }) => ({ ...row, errors: validationErrors || [] }));
    res.json({ success: true, batch });
  } catch (error) { next(error); }
}

export async function correctImportRow(req, res, next) {
  try {
    if (!managers.includes(req.user.role)) return res.status(403).json({ message: "Not authorized." });
    const batch = await ResultImportBatch.findOne({ _id: req.params.id, ...tenant(req) });
    if (!batch || !["needs_correction", "ready"].includes(batch.status)) return res.status(409).json({ message: "Only unconfirmed batches can be corrected." });
    const row = batch.rows.id(req.params.rowId);
    if (!row) return res.status(404).json({ message: "Import row not found." });
    const allowed = ["rollNumber", "courseCode", "courseName", "semester", "examSession", "marks", "maxMarks", "grade"];
    for (const key of allowed) if (req.body[key] !== undefined) {
      if (key === "marks" || key === "maxMarks") { const value = Number(req.body[key]); if (req.body[key] == null || req.body[key] === "" || !Number.isFinite(value) || (key === "maxMarks" && value < 1)) return res.status(422).json({ message: `${key} must be numeric${key === "maxMarks" ? " and at least 1" : ""}.` }); row[key] = value; }
      else row[key] = String(req.body[key]).trim();
    }
    row.correctedAt = new Date(); row.correctedBy = req.user._id;
    const validation = await validateRows({ ...req, body: { ...req.body, department: batch.department, subjectCode: batch.subjectCode, examinationType: batch.examinationType } }, { records: batch.rows.map(r => ({ sourceRow: r.sourceRow, record: { ...r.toObject(), studentName: r.uploadedStudentName } })) });
    validation.forEach((v, i) => { batch.rows[i].validationErrors = v.errors; batch.rows[i].warnings = v.warnings; batch.rows[i].student = v.student; batch.rows[i].studentName = v.studentName; batch.rows[i].courseName = v.courseName; batch.rows[i].application = v.application; batch.rows[i].supersedes = v.supersedes; });
    Object.assign(batch, counts(batch.rows));
    batch.status = batch.rejectedRows ? "needs_correction" : "ready";
    batch.history.push({ action: "row_corrected", actor: req.user._id, metadata: { sourceRow: row.sourceRow, changedFields: allowed.filter(k => req.body[k] !== undefined) } });
    await batch.save(); await writeAudit(req, "result_import_row_corrected", batch, { sourceRow: row.sourceRow });
    res.json({ success: true, batch });
  } catch (error) { if (error?.name === "VersionError") return res.status(409).json({ message: "This batch changed during correction. Reload it before trying again." }); next(error); }
}

export async function reuploadImportBatch(req, res, next) {
  try {
    if (!managers.includes(req.user.role) || !req.file) return res.status(400).json({ message: "Select a corrected XLSX or CSV file." });
    const batch = await ResultImportBatch.findOne({ _id: req.params.id, ...tenant(req), status: { $in: ["needs_correction", "ready"] } });
    if (!batch) return res.status(409).json({ message: "Only unconfirmed batches can be replaced." });
    if (String(req.body.examinationType || batch.examinationType).trim().toLowerCase() !== batch.examinationType) return res.status(409).json({ message: "A corrected re-upload cannot change the examination type." });
    const parsed = await parseWorkbook(req.file);
    if (!parsed.records?.length) return res.status(422).json({ message: "The corrected workbook contains no result rows." });
    const rows = await validateRows({ ...req, body: { ...req.body, department: batch.department, subjectCode: batch.subjectCode, examinationType: batch.examinationType } }, parsed);
    const sessionName = String(req.body.examSession || rows.find(r => r.examSession)?.examSession || batch.examSession).trim();
    if (!sessionName || rows.some(r => r.examSession && r.examSession !== sessionName)) return res.status(422).json({ message: "Corrected workbook must contain one consistent examination session." });
    const digest = crypto.createHash("sha256").update(req.file.buffer).digest("hex");
    if (digest === batch.fileSha256) return res.status(409).json({ message: "The corrected workbook is identical to the previous version." });
    const previousRows = batch.rows.map(row => row.toObject());
    const previous = { filename: batch.filename, fileSha256: batch.fileSha256, totalRows: batch.totalRows, rejectedRows: batch.rejectedRows };
    const oldByKey = new Map(previousRows.map(row => [`${row.rollNumber}|${row.courseCode}|${row.semester}|${row.examSession}`, row]));
    const newByKey = new Map(rows.map(row => [`${row.rollNumber}|${row.courseCode}|${row.semester}|${row.examSession}`, row]));
    const changedRows = [];
    for (const [key, current] of newByKey) { const old = oldByKey.get(key); if (!old) continue; const fields = ["marks", "maxMarks", "grade", "courseName"].filter(field => String(old[field] ?? "") !== String(current[field] ?? "")); if (fields.length) changedRows.push({ sourceRow: current.sourceRow, changedFields: fields }); }
    const diff = { changed: changedRows.length, added: [...newByKey.keys()].filter(key => !oldByKey.has(key)).length, removed: [...oldByKey.keys()].filter(key => !newByKey.has(key)).length, changedRows: changedRows.slice(0, 250) };
    const summary = counts(rows);
    batch.filename = req.file.originalname.slice(0, 180); batch.fileSha256 = digest; batch.examSession = sessionName;
    batch.rows = rows.map(({ errors, ...row }) => ({ ...row, validationErrors: errors })); Object.assign(batch, summary); batch.status = summary.rejectedRows ? "needs_correction" : "ready";
    batch.history.push({ action: "corrected_file_reuploaded", actor: req.user._id, metadata: { previous, current: { filename: batch.filename, fileSha256: digest, ...summary }, diff } });
    await batch.save(); await writeAudit(req, "result_import_reuploaded", batch, summary);
    res.json({ success: true, batch: { _id: batch._id, status: batch.status, ...summary }, rows: batch.rows.map(r => ({ _id: r._id, sourceRow: r.sourceRow, rollNumber: r.rollNumber, courseCode: r.courseCode, errors: r.validationErrors, warnings: r.warnings })) });
  } catch (error) { if (error?.code === 11000) return res.status(409).json({ message: "This workbook is already attached to another import batch." }); if (error?.name === "VersionError") return res.status(409).json({ message: "This batch changed during re-upload. Reload and retry." }); next(error); }
}

export async function confirmImportBatch(req, res, next) {
  try {
    if (!publisher.includes(req.user.role)) return res.status(403).json({ message: "A publishing-authorized administrator must confirm this batch." });
    const batch = await ResultImportBatch.findOne({ _id: req.params.id, ...tenant(req) });
    if (!batch || batch.status !== "ready" || batch.rejectedRows || !batch.rows.length) return res.status(409).json({ message: "Only a fully valid, unconfirmed batch can be confirmed." });
    batch.status = "confirmed"; batch.confirmedBy = req.user._id; batch.confirmedAt = new Date();
    batch.history.push({ action: "confirmed", actor: req.user._id, metadata: { totalRows: batch.totalRows } });
    await batch.save(); await writeAudit(req, "result_import_confirmed", batch, { totalRows: batch.totalRows });
    res.json({ success: true, status: batch.status, confirmedAt: batch.confirmedAt });
  } catch (error) { if (error?.name === "VersionError") return res.status(409).json({ message: "This batch changed while being confirmed. Reload and review it again." }); next(error); }
}

export async function publishImportBatch(req, res, next) {
  if (!publisher.includes(req.user.role)) return res.status(403).json({ message: "A publishing-authorized administrator must publish results." });
  const session = await mongoose.startSession();
  try {
    let published = 0;
    await session.withTransaction(async () => {
      const batch = await ResultImportBatch.findOne({ _id: req.params.id, ...tenant(req), status: "confirmed" }).session(session);
      if (!batch || !batch.rows.length || batch.rejectedRows) throw Object.assign(new Error("Batch is not confirmed and publishable."), { status: 409 });
      const studentIds = [...new Set(batch.rows.map(row => String(row.student)))];
      const courseCodes = [...new Set(batch.rows.map(row => row.courseCode))];
      const [currentStudents, currentSubjects] = await Promise.all([
        User.find({ _id: { $in: studentIds }, institution: batch.institutionId, role: "student", isActive: true }).select("_id department programme semester").session(session).lean(),
        AcademicMaster.find({ institutionId: batch.institutionId, type: { $in: ["subject", "course"] }, isActive: true, code: { $in: courseCodes } }).select("code name semester programme department").session(session).lean(),
      ]);
      if (currentStudents.length !== studentIds.length || currentSubjects.length !== courseCodes.length) throw Object.assign(new Error("Student or subject mappings changed after confirmation. The batch must be revalidated."), { status: 409 });
      const studentById = new Map(currentStudents.map(student => [String(student._id), student]));
      const subjectByCode = new Map(currentSubjects.map(subject => [subject.code, subject]));
      for (const row of batch.rows) {
        const student = studentById.get(String(row.student)); const subject = subjectByCode.get(row.courseCode);
        if (!student || !subject || (batch.department && student.department && student.department.toLowerCase() !== batch.department.toLowerCase()) || (subject.semester && !sameSemester(subject.semester, row.semester)) || (student.semester && !sameSemester(student.semester, row.semester)) || (subject.programme && student.programme && subject.programme.toLowerCase() !== student.programme.toLowerCase()) || (batch.department && subject.department && subject.department.toLowerCase() !== batch.department.toLowerCase()) || (batch.subjectCode && batch.subjectCode.toLowerCase() !== row.courseCode.toLowerCase())) throw Object.assign(new Error("Academic mappings changed after confirmation. The batch must be revalidated."), { status: 409 });
      }
      if (batch.examinationType !== "regular") {
        const originalIds = [...new Set(batch.rows.map(row => String(row.supersedes)).filter(Boolean))];
        const originals = await OfficialResult.find({ _id: { $in: originalIds }, institutionId: batch.institutionId, status: "published" }).select("_id student courseCode semester examSession").session(session).lean();
        const originalMap = new Map(originals.map(original => [String(original._id), original]));
        for (const row of batch.rows) { const original = originalMap.get(String(row.supersedes)); if (!original || String(original.student) !== String(row.student) || original.courseCode !== row.courseCode || original.examSession !== row.examSession || !sameSemester(original.semester, row.semester)) throw Object.assign(new Error("The original published result for an examination application changed or is unavailable. The batch was rolled back."), { status: 409 }); }
      }
      const docs = batch.rows.map(row => ({ institutionId: batch.institutionId, student: row.student, rollNumber: row.rollNumber, courseCode: row.courseCode, courseName: row.courseName, semester: row.semester, examSession: row.examSession, marks: row.marks, maxMarks: row.maxMarks, grade: row.grade, status: "published", attemptType: batch.examinationType, attemptNumber: batch.examinationType === "regular" ? 0 : 1, supersedes: row.supersedes || null, verificationCode: crypto.randomBytes(24).toString("hex"), publishedAt: new Date(), history: [{ action: "created", actor: batch.uploadedBy, reason: `Import batch ${batch._id}` }, { action: "published", actor: req.user._id, reason: "Confirmed batch publication" }] }));
      const createdResults = await OfficialResult.insertMany(docs, { session, ordered: true });
      if (batch.examinationType !== "regular") {
        for (let index = 0; index < batch.rows.length; index += 1) {
          const row = batch.rows[index];
          const application = await AcademicApplication.findOne({ _id: row.application, institutionId: batch.institutionId, student: row.student, courseCode: row.courseCode, examSession: row.examSession, type: batch.examinationType, officialResult: row.supersedes, status: { $in: ["approved", "registered", "completed"] } }).session(session);
          if (!application || !sameSemester(application.semester, row.semester)) throw Object.assign(new Error("An approved examination application changed before publication. The entire batch was rolled back."), { status: 409 });
          const previousStatus = application.status;
          application.status = "published"; application.activeKey = undefined; application.newOfficialResult = createdResults[index]._id; application.reviewedBy = req.user._id; application.reviewedAt = new Date();
          application.history.push({ action: "published_from_import_batch", actor: req.user._id, at: new Date(), from: previousStatus, to: "published", revisedMarks: row.marks, newOfficialResult: createdResults[index]._id });
          await application.save({ session });
        }
      }
      const studentCounts = new Map(); for (const doc of docs) studentCounts.set(String(doc.student), (studentCounts.get(String(doc.student)) || 0) + 1);
      const notifications = [...studentCounts.entries()].map(([student, count]) => ({ institutionId: batch.institutionId, user: student, title: "Official results published", message: `${count} official result record(s) from ${batch.examSession} are now available in your academic history.` }));
      if (notifications.length) await Notification.insertMany(notifications, { session, ordered: true });
      batch.status = "published"; batch.publishedBy = req.user._id; batch.publishedAt = new Date(); batch.history.push({ action: "published", actor: req.user._id, metadata: { publishedRecords: docs.length } });
      await batch.save({ session });
      await AuditLog.create([{ action: "result_import_published", admin: req.user._id, adminRole: req.user.role, status: "published", remarks: `Result import batch ${batch._id}: ${docs.length} records published`, institutionId: batch.institutionId }], { session });
      published = docs.length;
    });
    const batch = await ResultImportBatch.findById(req.params.id).select("status publishedAt").lean();
    res.json({ success: true, published, batch });
  } catch (error) {
    if (/Transaction numbers are only allowed|replica set|mongos/i.test(error.message)) return res.status(503).json({ message: "Atomic publication requires MongoDB Atlas or a replica-set deployment. No results were published." });
    if (error?.code === 11000) return res.status(409).json({ message: "A result already exists for one or more rows in this batch. No partial publication was committed." });
    if (error?.name === "VersionError") return res.status(409).json({ message: "This batch changed during publication. Reload and review it again." });
    next(error);
  } finally { await session.endSession(); }
}

export async function resultTemplate(req, res, next) {
  try {
    if (!managers.includes(req.user.role)) return res.status(403).json({ message: "Not authorized." });
    const format = String(req.query.format || "xlsx").toLowerCase();
    if (format === "csv") {
      // The CSV template is a header row only, so it needs no external service.
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", "attachment; filename=acadnexus-result-template.csv");
      return res.send(csvTemplateText());
    }
    if (format !== "xlsx") return res.status(422).json({ message: "Template format must be xlsx or csv." });
    if (!mlUrl() || !process.env.ML_SERVICE_API_KEY) return res.status(503).json({ message: "XLSX template service is not configured." });
    const response = await fetch(`${mlUrl()}/v1/result-template`, { headers: { "x-ml-service-key": process.env.ML_SERVICE_API_KEY }, signal: AbortSignal.timeout(10000) });
    if (!response.ok) return res.status(502).json({ message: "Unable to generate the XLSX template." });
    const bytes = Buffer.from(await response.arrayBuffer());
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", "attachment; filename=acadnexus-result-template.xlsx");
    res.send(bytes);
  } catch (error) { next(error); }
}
