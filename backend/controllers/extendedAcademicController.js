import mongoose from "mongoose";
import { randomBytes } from "node:crypto";
import User from "../models/User.js";
import AcademicMaster from "../models/AcademicMaster.js";
import OfficialResult from "../models/OfficialResult.js";
import AcademicRule from "../models/AcademicRule.js";
import AcademicApplication from "../models/AcademicApplication.js";
import StudentPortfolio from "../models/StudentPortfolio.js";
import TopicAssessment from "../models/TopicAssessment.js";
import Opportunity from "../models/Opportunity.js";
import OpportunityInteraction from "../models/OpportunityInteraction.js";
import AuditLog from "../models/AuditLog.js";
import Notification from "../models/Notification.js";
import { calculateSubjectScenario, calculateSemesterGpa } from "../utils/academicSimulator.js";
import { matchOpportunity } from "../utils/opportunityMatcher.js";
import { searchRegex } from "../utils/search.js";
import { sameSemester } from "../utils/academicValues.js";
import { buildBacklogReport } from "../utils/backlogTracker.js";

const tenant = (req) => ({ institutionId: req.user.institution?._id || req.user.institution });
const studentRole = (req) => req.user.role === "student";
const managers = ["teacher", "edp", "hod", "teacher_admin", "super_admin", "institute_admin", "vice_chancellor"];
const institutionalAdmins = ["hod", "teacher_admin", "super_admin", "institute_admin", "vice_chancellor"];
const applicationManagers = ["edp", "hod", "teacher_admin", "super_admin", "institute_admin", "vice_chancellor"];
const audit = async (req, action, remarks, student) => { try { await AuditLog.create({ action, admin: req.user._id, adminRole: req.user.role, student, status: "completed", remarks, institutionId: req.user.institution || undefined }); } catch { /* workflow mutation remains authoritative */ } };

export async function createAcademicRule(req, res, next) {
  try {
    if (!institutionalAdmins.includes(req.user.role)) return res.status(403).json({ message: "Academic rule administration is restricted." });
    const { name, programme = "", semester = "", components, gradeBands = [], rounding, gpaScale, credits, supplementaryPolicy, improvementPolicy, revaluationPolicy } = req.body;
    const passPercentage = req.body.passPercentage === undefined || req.body.passPercentage === null || req.body.passPercentage === "" ? null : Number(req.body.passPercentage);
    if (passPercentage !== null && (!Number.isFinite(passPercentage) || passPercentage < 0 || passPercentage > 100)) return res.status(422).json({ message: "Pass percentage must be between 0 and 100 when configured." });
    const department = req.user.role === "hod" ? String(req.user.department || "") : String(req.body.department || "");
    if (req.user.role === "hod" && !department) return res.status(403).json({ message: "Your HOD account is not assigned to a department." });
    if (!String(name || "").trim() || !String(semester || "").trim() || !Number.isFinite(Number(gpaScale)) || Number(gpaScale) < 1 || !Number.isFinite(Number(credits)) || Number(credits) < 0 || !["nearest_2", "nearest_1", "none"].includes(rounding)) return res.status(422).json({ message: "Provide a rule name, semester, valid GPA scale, credits and rounding mode." });
    if (!Array.isArray(components) || !components.length || components.some(c => !c || typeof c !== "object") || Math.abs(components.reduce((s, c) => s + Number(c.weight), 0) - 100) > 0.001) return res.status(422).json({ message: "Configure assessment components whose weights total exactly 100." });
    if (new Set(components.map(c => c.code)).size !== components.length || components.some(c => !c.code || !c.label || !Number.isFinite(Number(c.weight)) || Number(c.weight) < 0 || !Number.isFinite(Number(c.maxMarks)) || Number(c.maxMarks) <= 0)) return res.status(422).json({ message: "Assessment component codes must be unique and weights/max marks valid." });
    if (!Array.isArray(gradeBands) || gradeBands.some(b => !b || typeof b !== "object")) return res.status(422).json({ message: "Grade bands must be a JSON array of objects." });
    const bands = [...gradeBands].sort((a, b) => Number(b.minPercentage) - Number(a.minPercentage));
    if (bands.some((b, i) => !Number.isFinite(Number(b.minPercentage)) || Number(b.minPercentage) < 0 || Number(b.minPercentage) > 100 || !b.grade || !Number.isFinite(Number(b.gradePoint)) || Number(b.gradePoint) < 0 || Number(b.gradePoint) > Number(gpaScale) || (i && Number(b.minPercentage) === Number(bands[i - 1].minPercentage)))) return res.status(422).json({ message: "Grade bands must have unique percentage thresholds and valid grade points." });
    const rule = await AcademicRule.create({ ...tenant(req), name, department, programme, semester, components, gradeBands: bands, rounding, gpaScale, credits, passPercentage, supplementaryPolicy, improvementPolicy, revaluationPolicy, createdBy: req.user._id });
    await audit(req, "academic_rule_created", `Created academic rule ${rule._id}`);
    res.status(201).json({ success: true, rule });
  } catch (error) { if (error?.code === 11000) return res.status(409).json({ message: "An active academic rule already exists for this department, programme and semester. Deactivate it before adding a replacement." }); next(error); }
}

export async function listAcademicRules(req, res, next) {
  try { const filter = { ...tenant(req), active: true }; if (studentRole(req)) { filter.department = { $in: [req.user.department || "", ""] }; filter.programme = { $in: [req.user.programme || "", ""] }; } else if (req.user.role === "hod") filter.department = { $in: [req.user.department || "", ""] }; const rules = await AcademicRule.find(filter).sort({ department: 1, programme: 1, semester: 1, name: 1 }).lean(); res.json({ success: true, items: rules }); }
  catch (error) { next(error); }
}

export async function deactivateAcademicRule(req, res, next) {
  try {
    if (!institutionalAdmins.includes(req.user.role)) return res.status(403).json({ message: "Academic rule administration is restricted." });
    const scope = req.user.role === "hod" ? { department: req.user.department } : {};
    const rule = await AcademicRule.findOneAndUpdate({ _id: req.params.id, ...tenant(req), active: true, ...scope }, { active: false }, { new: true });
    if (!rule) return res.status(404).json({ message: "Active academic rule not found." });
    await audit(req, "academic_rule_deactivated", `Deactivated academic rule ${rule._id}`);
    res.json({ success: true, rule });
  } catch (error) { next(error); }
}

export async function simulateAcademicPerformance(req, res, next) {
  try {
    if (!studentRole(req)) return res.status(403).json({ message: "The academic simulator is available to students." });
    const subjects = req.body.subjects;
    if (!Array.isArray(subjects) || !subjects.length || subjects.length > 20) return res.status(422).json({ message: "Provide one to twenty subject scenarios." });
    const results = [];
    for (const scenario of subjects) {
      if (!mongoose.isValidObjectId(scenario.ruleId)) return res.status(422).json({ message: "Each subject requires a valid configured academic rule." });
      const rule = await AcademicRule.findOne({ _id: scenario.ruleId, ...tenant(req), active: true }).lean();
      if (!rule || (rule.department && rule.department !== req.user.department) || (rule.programme && rule.programme !== req.user.programme)) return res.status(404).json({ message: "An active academic rule was not found for this student academic scope." });
      results.push(calculateSubjectScenario(rule, scenario));
    }
    const gpa = calculateSemesterGpa(results);
    res.json({ success: true, hypothetical: true, persisted: false, subjects: results, semesterGpa: gpa, note: "These are deterministic hypothetical calculations. Official academic records are not modified." });
  } catch (error) { if (error.message?.includes("must") || error.message?.includes("Marks") || error.message?.includes("Target")) return res.status(422).json({ message: error.message }); next(error); }
}

const policyFor = (rule, type) => ({ supplementary: rule?.supplementaryPolicy, improvement: rule?.improvementPolicy, revaluation: rule?.revaluationPolicy })[type];
export async function createAcademicApplication(req, res, next) {
  try {
    if (!studentRole(req)) return res.status(403).json({ message: "Only students can submit an academic application." });
    const { type, officialResultId, reason = "" } = req.body;
    if (!["supplementary", "improvement", "revaluation"].includes(type) || !mongoose.isValidObjectId(officialResultId)) return res.status(422).json({ message: "Select a valid application type and published result." });
    const result = await OfficialResult.findOne({ _id: officialResultId, student: req.user._id, ...tenant(req), status: "published" });
    if (!result) return res.status(404).json({ message: "Published result not found for this student." });
    const candidateRules = await AcademicRule.find({ ...tenant(req), active: true, department: { $in: [req.user.department || "", ""] }, $or: [{ programme: req.user.programme }, { programme: "" }] }).sort({ programme: -1 }).lean();
    const matches = item => !item.semester || sameSemester(item.semester, result.semester);
    const rule = candidateRules.find(item => item.department === req.user.department && item.programme === req.user.programme && matches(item)) || candidateRules.find(item => item.department === "" && item.programme === req.user.programme && matches(item)) || candidateRules.find(item => item.department === req.user.department && item.programme === "" && matches(item)) || candidateRules.find(item => item.department === "" && item.programme === "" && matches(item));
    const policy = policyFor(rule, type);
    if (!policy?.enabled || !policy?.applicationsOpen) return res.status(409).json({ message: `The institution has not opened/configured the ${type} application window for this academic rule.` });
    const existing = await AcademicApplication.findOne({ ...tenant(req), student: req.user._id, type, officialResult: result._id, status: { $nin: ["rejected", "published"] } });
    if (existing) return res.status(409).json({ message: "An active application already exists for this result.", applicationId: existing._id });
    const application = await AcademicApplication.create({ ...tenant(req), type, student: req.user._id, courseCode: result.courseCode, courseName: result.courseName, semester: result.semester, examSession: result.examSession, officialResult: result._id, rule: rule._id, reason: String(reason).slice(0, 2000), status: "submitted", activeKey: `${req.user._id}_${type}_${result._id}`, history: [{ action: "submitted", actor: req.user._id, to: "submitted", note: "Student application submitted" }] });
    await audit(req, `${type}_application_submitted`, `Application ${application._id} submitted`, req.user._id);
    res.status(201).json({ success: true, application, eligibilityStatus: "pending_manual_review", note: "Eligibility remains subject to the institution's configured policy and authorized review." });
  } catch (error) { if (error?.code === 11000) return res.status(409).json({ message: "An active application already exists for this result." }); next(error); }
}

export async function listAcademicApplications(req, res, next) {
  try {
    const filter = { ...tenant(req) };
    if (studentRole(req)) filter.student = req.user._id;
    else if (!applicationManagers.includes(req.user.role)) return res.status(403).json({ message: "Not authorized." });
    if (req.user.role === "hod") { const scopedStudents = await User.find({ institution: req.user.institution, role: "student", department: req.user.department }).distinct("_id"); filter.student = { $in: scopedStudents }; }
    if (req.query.type) filter.type = req.query.type;
    if (req.query.status) filter.status = req.query.status;
    const items = await AcademicApplication.find(filter).populate("student", "name rollNumber department programme year").populate("officialResult", "marks maxMarks grade attemptType").sort({ createdAt: -1 }).limit(200).lean();
    res.json({ success: true, items });
  } catch (error) { next(error); }
}

const transitions = { submitted: ["under_review", "rejected"], under_review: ["approved", "rejected"], approved: ["registered", "rejected"], registered: ["completed"], completed: ["published"] };
export async function transitionAcademicApplication(req, res, next) {
  if (!applicationManagers.includes(req.user.role)) return res.status(403).json({ message: "Only authorized academic staff can review applications." });
  const session = await mongoose.startSession();
  try {
    let output;
    await session.withTransaction(async () => {
      const app = await AcademicApplication.findOne({ _id: req.params.id, ...tenant(req) }).session(session);
      if (!app) throw Object.assign(new Error("Application not found."), { status: 404 });
      if (req.user.role === "hod") { const inDepartment = await User.exists({ _id: app.student, institution: req.user.institution, role: "student", department: req.user.department }).session(session); if (!inDepartment) throw Object.assign(new Error("Application is outside your department scope."), { status: 403 }); }
      const nextStatus = String(req.body.status || "");
      if (!transitions[app.status]?.includes(nextStatus)) throw Object.assign(new Error(`Invalid application transition: ${app.status} → ${nextStatus}`), { status: 409 });
      const previous = app.status;
      if (nextStatus === "rejected" && !String(req.body.note || "").trim()) throw Object.assign(new Error("A decision reason is required when rejecting an application."), { status: 422 });
      if (nextStatus === "completed") {
        const original = await OfficialResult.findOne({ _id: app.officialResult, ...tenant(req), status: "published" }).session(session);
        const revisedMarks = Number(req.body.revisedMarks);
        if (!original || !Number.isFinite(revisedMarks) || revisedMarks < 0 || revisedMarks > original.maxMarks) throw Object.assign(new Error("Completed applications require authorized revised marks within the original maximum."), { status: 422 });
        app.revisedMarks = revisedMarks;
      }
      if (nextStatus === "published") {
        const original = await OfficialResult.findOne({ _id: app.officialResult, ...tenant(req), status: "published" }).session(session);
        const rule = await AcademicRule.findOne({ _id: app.rule, ...tenant(req) }).session(session);
        if (!original || !rule || app.revisedMarks == null) throw Object.assign(new Error("A reviewed revised mark, original result and configured academic rule are required."), { status: 409 });
        const percentage = app.revisedMarks / original.maxMarks * 100;
        const gradeBand = [...(rule.gradeBands || [])].sort((a, b) => b.minPercentage - a.minPercentage).find(band => percentage >= band.minPercentage);
        const attemptType = app.type;
        const latest = await OfficialResult.find({ ...tenant(req), student: app.student, courseCode: app.courseCode, semester: app.semester, examSession: app.examSession, attemptType }).sort({ attemptNumber: -1 }).session(session).limit(1);
        const attemptNumber = Number(latest[0]?.attemptNumber || 0) + 1;
        const [created] = await OfficialResult.create([{ institutionId: app.institutionId, student: app.student, rollNumber: original.rollNumber, courseCode: original.courseCode, courseName: original.courseName, semester: original.semester, examSession: original.examSession, marks: app.revisedMarks, maxMarks: original.maxMarks, grade: gradeBand?.grade || "", status: "published", attemptType, attemptNumber, supersedes: original._id, verificationCode: cryptoRandomCode(), publishedAt: new Date(), history: [{ action: "created", actor: req.user._id, reason: `${attemptType} application ${app._id}` }, { action: "published", actor: req.user._id, reason: "Authorized revised academic result" }] }], { session });
        app.newOfficialResult = created._id;
      }
      app.status = nextStatus; if (["rejected", "published"].includes(nextStatus)) app.activeKey = undefined; app.reviewedBy = req.user._id; app.reviewedAt = new Date(); app.decisionNote = String(req.body.note || "").slice(0, 2000);
      app.history.push({ action: nextStatus, actor: req.user._id, at: new Date(), note: app.decisionNote, from: previous, to: nextStatus, revisedMarks: nextStatus === "completed" ? app.revisedMarks : undefined, newOfficialResult: nextStatus === "published" ? app.newOfficialResult : undefined });
      await app.save({ session });
      await Notification.create([{ institutionId: app.institutionId, user: app.student, title: "Examination application updated", message: `Your ${app.type} application for ${app.courseCode} is now ${nextStatus.replaceAll("_", " ")}.` }], { session });
      output = app;
    });
    await audit(req, "academic_application_transition", `Application ${req.params.id} moved to ${output.status}`, output.student);
    res.json({ success: true, application: output });
  } catch (error) {
    if (/Transaction numbers are only allowed|replica set|mongos/i.test(error.message)) return res.status(503).json({ message: "Atomic examination-result revision requires MongoDB Atlas or a replica-set deployment. No result was changed." });
    if (error.status) return res.status(error.status).json({ message: error.message });
    next(error);
  } finally { await session.endSession(); }
}
const cryptoRandomCode = () => randomBytes(24).toString("hex");

export async function listPortfolio(req, res, next) {
  try {
    const studentId = req.params.studentId || req.user._id;
    const ownPortfolio = String(studentId) === String(req.user._id);
    if (!ownPortfolio && !studentRole(req) && !institutionalAdmins.includes(req.user.role)) return res.status(403).json({ message: "Not authorized." });
    if (req.user.role === "hod" && !ownPortfolio) { const inDepartment = await User.exists({ _id: studentId, institution: req.user.institution, role: "student", department: req.user.department }); if (!inDepartment) return res.status(403).json({ message: "Portfolio is outside your department scope." }); }
    const filter = { ...tenant(req), student: studentId };
    if (!ownPortfolio && studentRole(req)) filter.visibility = { $in: ["institution", "public"] };
    const items = await StudentPortfolio.find(filter).sort({ createdAt: -1 }).limit(100).lean();
    res.json({ success: true, items });
  } catch (error) { next(error); }
}

export async function createPortfolioItem(req, res, next) {
  try {
    if (!studentRole(req)) return res.status(403).json({ message: "Students manage their own portfolio records." });
    const { type, title, description } = req.body;
    if (!["project", "certification", "achievement"].includes(type) || !String(title || "").trim()) return res.status(422).json({ message: "A valid portfolio type and title are required." });
    const allowed = ["category", "technologies", "skills", "startDate", "completionDate", "issueDate", "expiryDate", "organization", "credentialId", "verificationUrl", "repositoryUrl", "demoUrl", "attachmentUrl", "role", "mentor", "teamMembers", "level"];
    const fields = Object.fromEntries(allowed.filter(k => req.body[k] !== undefined).map(k => [k, req.body[k]]));
    const visibility = ["private", "institution", "public"].includes(req.body.visibility) ? req.body.visibility : "private";
    const item = await StudentPortfolio.create({ ...tenant(req), student: req.user._id, type, title: String(title).trim(), description: String(description || "").slice(0, 4000), ...fields, visibility, verificationStatus: "unverified" });
    res.status(201).json({ success: true, item });
  } catch (error) { next(error); }
}

export async function updatePortfolioItem(req, res, next) {
  try {
    if (!studentRole(req)) return res.status(403).json({ message: "Only the portfolio owner can edit this record." });
    const allowed = ["title", "description", "category", "technologies", "skills", "startDate", "completionDate", "issueDate", "expiryDate", "organization", "credentialId", "verificationUrl", "repositoryUrl", "demoUrl", "attachmentUrl", "role", "mentor", "teamMembers", "level", "visibility"];
    const update = Object.fromEntries(allowed.filter(k => req.body[k] !== undefined).map(k => [k, req.body[k]]));
    update.verificationStatus = "unverified"; update.verifiedBy = null; update.verifiedAt = null;
    const item = await StudentPortfolio.findOneAndUpdate({ _id: req.params.id, ...tenant(req), student: req.user._id }, update, { new: true, runValidators: true });
    if (!item) return res.status(404).json({ message: "Portfolio record not found." });
    res.json({ success: true, item });
  } catch (error) { next(error); }
}

export async function deletePortfolioItem(req, res, next) {
  try { if (!studentRole(req)) return res.status(403).json({ message: "Only the portfolio owner can delete this record." }); const item = await StudentPortfolio.findOneAndDelete({ _id: req.params.id, ...tenant(req), student: req.user._id }); if (!item) return res.status(404).json({ message: "Portfolio record not found." }); res.json({ success: true }); }
  catch (error) { next(error); }
}

export async function verifyPortfolioItem(req, res, next) {
  try {
    if (!institutionalAdmins.includes(req.user.role)) return res.status(403).json({ message: "Portfolio verification requires an academic administrator." });
    const status = req.body.status;
    if (!["verified", "rejected", "pending"].includes(status)) return res.status(422).json({ message: "Invalid verification status." });
    const filter = { _id: req.params.id, ...tenant(req) };
    if (req.user.role === "hod") {
      const existing = await StudentPortfolio.findOne(filter).select("student").lean();
      if (!existing || !(await User.exists({ _id: existing.student, institution: req.user.institution, role: "student", department: req.user.department }))) return res.status(403).json({ message: "Portfolio record is outside your department scope." });
    }
    const item = await StudentPortfolio.findOneAndUpdate(filter, { verificationStatus: status, verifiedBy: req.user._id, verifiedAt: new Date() }, { new: true });
    if (!item) return res.status(404).json({ message: "Portfolio record not found." });
    await audit(req, "portfolio_item_verified", `Portfolio item ${item._id} marked ${status}`, item.student);
    res.json({ success: true, item });
  } catch (error) { next(error); }
}

async function teacherCanAccessStudent(req, student, subjectCode, subjectName = "", subjectId = null) {
  if (req.user.role === "student") return String(student._id) === String(req.user._id);
  if (["super_admin", "institute_admin", "vice_chancellor", "teacher_admin"].includes(req.user.role)) return true;
  if (!["teacher", "hod"].includes(req.user.role)) return false;
  const charges = (req.user.charges || []).filter(c => c.isActive !== false && (req.user.role === "hod" ? c.type === "hod" : ["teaching", "class_incharge"].includes(c.type)));
  if (!charges.length && req.user.role === "hod") return Boolean(req.user.department && req.user.department === student.department);
  return charges.some(c => {
    const departmentScope = req.user.role === "hod" ? (c.department && c.department !== "All" ? c.department : req.user.department) : c.department;
    const dimensionsMatch = (req.user.role === "hod" ? Boolean(departmentScope && departmentScope === student.department) : (!departmentScope || departmentScope === "All" || departmentScope === student.department)) && (!c.programme || c.programme === "All" || c.programme === student.programme) && (!c.year || c.year === "All" || c.year === student.year) && (!c.semester || c.semester === "All" || sameSemester(c.semester, student.semester)) && (!c.section || c.section === "All" || c.section === student.section);
    const subjectMatch = (!c.subject && !c.subjectId) || c.subject === "All" || (c.subject && [subjectCode, subjectName].some(value => value && String(c.subject).toLowerCase() === String(value).toLowerCase())) || (c.subjectId && subjectId && String(c.subjectId) === String(subjectId));
    const groupKey = { sub_group: "groupName", lab_batch: "labBatch", elective: "electiveGroup", specialization: "specialization" }[c.groupType];
    const groupMatch = !groupKey || !c.groupName || c.groupName === "All" || String(student[groupKey] || "") === String(c.groupName);
    return dimensionsMatch && subjectMatch && groupMatch;
  });
}

export async function createTopicAssessment(req, res, next) {
  try {
    if (!["teacher", "teacher_admin", "hod", "super_admin", "institute_admin", "vice_chancellor"].includes(req.user.role)) return res.status(403).json({ message: "Faculty access is required to record topic assessments." });
    const student = await User.findOne({ _id: req.body.studentId, institution: req.user.institution, role: "student", isActive: true }).select("_id department programme year semester section groupName labBatch electiveGroup specialization").lean();
    const subject = await AcademicMaster.findOne({ institutionId: req.user.institution, type: { $in: ["subject", "course"] }, code: String(req.body.subjectCode || ""), isActive: true }).select("_id name").lean();
    if (!student || !subject || !(await teacherCanAccessStudent(req, student, String(req.body.subjectCode || ""), subject.name, subject._id))) return res.status(403).json({ message: "Student or subject is outside your authorized teaching scope." });
    const marks = Number(req.body.marks), maxMarks = Number(req.body.maxMarks);
    const topicName = String(req.body.topicName || "").trim(); const assessmentName = String(req.body.assessmentName || "").trim();
    const assessedAt = req.body.assessedAt ? new Date(req.body.assessedAt) : new Date();
    if (!topicName || !assessmentName || topicName.length > 160 || assessmentName.length > 160 || !Number.isFinite(marks) || !Number.isFinite(maxMarks) || marks < 0 || maxMarks <= 0 || marks > maxMarks || Number.isNaN(assessedAt.getTime()) || (req.body.questionMapping !== undefined && !Array.isArray(req.body.questionMapping))) return res.status(422).json({ message: "Provide a topic, assessment, valid date and marks within the configured maximum." });
    const item = await TopicAssessment.create({ ...tenant(req), student: student._id, subjectCode: String(req.body.subjectCode), subjectName: subject.name, topicCode: String(req.body.topicCode || ""), topicName, assessmentName, marks, maxMarks, assessedAt, questionMapping: (req.body.questionMapping || []).slice(0, 100) });
    res.status(201).json({ success: true, item });
  } catch (error) { next(error); }
}

export async function listTopicAnalysis(req, res, next) {
  try {
    const studentId = studentRole(req) ? req.user._id : req.query.studentId;
    if (!studentId || (!studentRole(req) && !managers.includes(req.user.role))) return res.status(403).json({ message: "Not authorized." });
    const student = await User.findOne({ _id: studentId, institution: req.user.institution, role: "student", isActive: true }).select("_id department programme year semester section groupName labBatch electiveGroup specialization").lean();
    const subject = req.query.subjectCode ? await AcademicMaster.findOne({ institutionId: req.user.institution, type: { $in: ["subject", "course"] }, code: String(req.query.subjectCode), isActive: true }).select("_id name").lean() : null;
    if (!student || (req.query.subjectCode && !subject) || !(await teacherCanAccessStudent(req, student, req.query.subjectCode || "", subject?.name || "", subject?._id))) return res.status(403).json({ message: "Student is outside your authorized scope." });
    const filter = { ...tenant(req), student: studentId };
    if (req.query.subjectCode) filter.subjectCode = req.query.subjectCode;
    const rows = (await TopicAssessment.find(filter).sort({ assessedAt: -1 }).limit(1000).lean()).reverse();
    const grouped = new Map();
    for (const row of rows) { const key = `${row.subjectCode}|${row.topicCode || row.topicName}`; const current = grouped.get(key) || { subjectCode: row.subjectCode, subjectName: row.subjectName, topicCode: row.topicCode, topicName: row.topicName, earned: 0, possible: 0, assessments: 0, assessmentHistory: [] }; current.earned += row.marks; current.possible += row.maxMarks; current.assessments += 1; current.assessmentHistory.push({ date: row.assessedAt, percentage: Math.round(row.marks / row.maxMarks * 10000) / 100, marks: row.marks, maxMarks: row.maxMarks }); grouped.set(key, current); }
    const topics = [...grouped.values()].map(topic => { const first = topic.assessmentHistory[0]?.percentage; const last = topic.assessmentHistory.at(-1)?.percentage; return { ...topic, percentage: topic.possible ? Math.round(topic.earned / topic.possible * 10000) / 100 : null, trendDelta: topic.assessments > 1 ? Math.round((last - first) * 100) / 100 : null, evidence: `${topic.assessments} recorded assessment(s), ${topic.earned}/${topic.possible} marks` }; });
    res.json({ success: true, topics, totalAssessments: rows.length, note: "Topic patterns are descriptive of recorded topic-tagged assessments; they do not establish mastery or causation." });
  } catch (error) { next(error); }
}

export async function createOpportunity(req, res, next) {
  try { if (!institutionalAdmins.includes(req.user.role)) return res.status(403).json({ message: "Opportunity publishing is restricted to academic administrators." }); const allowed = ["title", "description", "type", "organizer", "requiredSkills", "interestTags", "eligibleDepartments", "eligibleProgrammes", "eligibilityText", "deadline", "startDate", "applicationUrl"]; const payload = Object.fromEntries(allowed.filter(k => req.body[k] !== undefined).map(k => [k, req.body[k]])); if (req.user.role === "hod") { if (!req.user.department) return res.status(403).json({ message: "Your HOD account is not assigned to a department." }); payload.eligibleDepartments = [req.user.department]; } const item = await Opportunity.create({ ...tenant(req), ...payload, createdBy: req.user._id, status: "draft" }); res.status(201).json({ success: true, item }); }
  catch (error) { next(error); }
}

export async function listOpportunities(req, res, next) {
  try {
    if (!studentRole(req) && !managers.includes(req.user.role)) return res.status(403).json({ message: "Not authorized." });
    const filter = { ...tenant(req) };
    if (req.user.role === "student" || !institutionalAdmins.includes(req.user.role)) filter.status = "published";
    else if (req.query.status) filter.status = req.query.status;
    if (req.query.type) filter.type = req.query.type;
    if (req.query.q) { const expression = searchRegex(String(req.query.q).slice(0, 80)); filter.$or = [{ title: expression }, { description: expression }]; }
    if (req.user.role === "student") filter.$and = [{ $or: [{ deadline: null }, { deadline: { $gte: new Date() } }] }, { $or: [{ eligibleDepartments: { $size: 0 } }, { eligibleDepartments: req.user.department }] }, { $or: [{ eligibleProgrammes: { $size: 0 } }, { eligibleProgrammes: req.user.programme }] }];
    if (req.user.role === "hod") filter.$and = [...(filter.$and || []), { $or: [{ eligibleDepartments: { $size: 0 } }, { eligibleDepartments: req.user.department }, { eligibleDepartments: "All" }] }];
    const items = await Opportunity.find(filter).sort({ deadline: 1, createdAt: -1 }).limit(100).lean();
    if (req.user.role !== "student") return res.json({ success: true, items });
    const interactions = await OpportunityInteraction.find({ ...tenant(req), student: req.user._id, kind: { $in: ["dismiss", "bookmark"] } }).lean();
    const dismissed = new Set(interactions.filter(i => i.kind === "dismiss").map(i => String(i.opportunity)));
    const saved = new Set(interactions.filter(i => i.kind === "bookmark").map(i => String(i.opportunity)));
    const profile = await User.findById(req.user._id).select("skills interests careerInterests").lean();
    const recommended = items.filter(item => !dismissed.has(String(item._id))).map(item => ({ ...item, ...matchOpportunity(profile || {}, item), bookmarked: saved.has(String(item._id)) })).sort((a, b) => (b.matchScore ?? -1) - (a.matchScore ?? -1));
    res.json({ success: true, items: recommended, matching: { method: "70% required-skill overlap + 30% interest-tag overlap; missing dimensions contribute zero", basedOn: "student-entered skills and interests only", measuredEffectiveness: false } });
  } catch (error) { next(error); }
}

export async function interactOpportunity(req, res, next) {
  try {
    if (!studentRole(req)) return res.status(403).json({ message: "Only students can save or rate recommendations." });
    const opportunity = await Opportunity.findOne({ _id: req.params.id, ...tenant(req), status: "published" });
    if (!opportunity) return res.status(404).json({ message: "Opportunity not found." });
    const { kind, feedback, note } = req.body;
    if (!["bookmark", "dismiss", "feedback", "click", "apply"].includes(kind)) return res.status(422).json({ message: "Unsupported interaction." });
    if (kind === "feedback" && !["relevant", "not_relevant", "already_applied", "not_interested", "other"].includes(feedback)) return res.status(422).json({ message: "Select a valid feedback value." });
    const item = await OpportunityInteraction.findOneAndUpdate({ ...tenant(req), opportunity: opportunity._id, student: req.user._id, kind }, { $set: { feedback, note: String(note || "").slice(0, 500) } }, { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true });
    res.json({ success: true, interaction: item });
  } catch (error) { next(error); }
}

export async function removeOpportunityBookmark(req, res, next) {
  try { if (!studentRole(req)) return res.status(403).json({ message: "Not authorized." }); await OpportunityInteraction.deleteOne({ ...tenant(req), opportunity: req.params.id, student: req.user._id, kind: "bookmark" }); res.json({ success: true }); }
  catch (error) { next(error); }
}

export async function updateOpportunity(req, res, next) {
  try {
    if (!institutionalAdmins.includes(req.user.role)) return res.status(403).json({ message: "Not authorized." });
    const allowed = ["title", "description", "type", "organizer", "requiredSkills", "interestTags", "eligibleDepartments", "eligibleProgrammes", "eligibilityText", "deadline", "startDate", "applicationUrl"];
    const update = Object.fromEntries(allowed.filter(k => req.body[k] !== undefined).map(k => [k, req.body[k]]));
    const scope = req.user.role === "hod" ? { eligibleDepartments: req.user.department } : {};
    if (req.user.role === "hod") update.eligibleDepartments = [req.user.department];
    const item = await Opportunity.findOneAndUpdate({ _id: req.params.id, ...tenant(req), status: "draft", ...scope }, update, { new: true, runValidators: true });
    if (!item) return res.status(404).json({ message: "Draft opportunity not found." });
    res.json({ success: true, item });
  } catch (error) { next(error); }
}

export async function deleteOpportunity(req, res, next) {
  try {
    if (!institutionalAdmins.includes(req.user.role)) return res.status(403).json({ message: "Not authorized." });
    const scope = req.user.role === "hod" ? { eligibleDepartments: req.user.department } : {};
    const item = await Opportunity.findOneAndDelete({ _id: req.params.id, ...tenant(req), status: "draft", ...scope });
    if (!item) return res.status(404).json({ message: "Draft opportunity not found." });
    res.json({ success: true });
  } catch (error) { next(error); }
}

export async function publishOpportunity(req, res, next) {
  try { if (!institutionalAdmins.includes(req.user.role)) return res.status(403).json({ message: "Not authorized." }); const status = req.body.status; if (!["published", "closed", "draft"].includes(status)) return res.status(422).json({ message: "Invalid opportunity status." }); const scope = req.user.role === "hod" ? { eligibleDepartments: req.user.department } : {};
    const item = await Opportunity.findOneAndUpdate({ _id: req.params.id, ...tenant(req), ...scope }, { status }, { new: true, runValidators: true }); if (!item) return res.status(404).json({ message: "Opportunity not found." }); res.json({ success: true, item }); }
  catch (error) { next(error); }
}

export async function getPublicPortfolio(req, res, next) {
  try {
    if (!mongoose.isValidObjectId(req.params.studentId)) return res.status(404).json({ message: "Portfolio not found." });
    const student = await User.findOne({ _id: req.params.studentId, role: "student", isActive: true, profileVisibility: "public" }).select("name department programme institution").lean();
    if (!student) return res.status(404).json({ message: "Portfolio not found or not publicly shared." });
    const items = await StudentPortfolio.find({ student: req.params.studentId, institutionId: student.institution, visibility: "public" })
      .select("type title description category technologies skills startDate completionDate issueDate expiryDate organization role mentor level verificationStatus repositoryUrl demoUrl createdAt")
      .sort({ createdAt: -1 }).limit(100).lean();
    res.json({ success: true, student: { name: student.name, department: student.department, programme: student.programme }, items });
  } catch (error) { next(error); }
}

const backlogViewers = ["hod", "teacher_admin", "super_admin", "institute_admin", "vice_chancellor", "edp"];
export async function listBacklogs(req, res, next) {
  try {
    if (!studentRole(req) && !backlogViewers.includes(req.user.role)) return res.status(403).json({ message: "Not authorized to view backlog status." });
    const studentId = studentRole(req) ? req.user._id : req.query.studentId;
    if (!mongoose.isValidObjectId(studentId)) return res.status(422).json({ message: "Provide a valid student." });
    const student = await User.findOne({ _id: studentId, institution: tenant(req).institutionId, role: "student", isActive: true }).select("_id name department programme year semester section groupName labBatch electiveGroup specialization").lean();
    if (!student || (!studentRole(req) && req.user.role !== "edp" && !(await teacherCanAccessStudent(req, student, "")))) return res.status(403).json({ message: "Student is outside your authorized scope." });
    const [results, rules] = await Promise.all([
      OfficialResult.find({ ...tenant(req), student: student._id, status: "published" }).select("courseCode courseName semester examSession marks maxMarks grade attemptType attemptNumber publishedAt createdAt").sort({ publishedAt: 1 }).limit(1000).lean(),
      AcademicRule.find({ ...tenant(req), active: true, passPercentage: { $ne: null }, department: { $in: [student.department || "", ""] }, programme: { $in: [student.programme || "", ""] } }).select("semester department programme passPercentage").lean(),
    ]);
    // The most specific active rule (department + programme) that configures a pass percentage decides; nothing is assumed otherwise.
    const passPercentageFor = (semester) => {
      const matching = rules.filter((rule) => sameSemester(rule.semester, semester)).sort((a, b) => ((b.department ? 2 : 0) + (b.programme ? 1 : 0)) - ((a.department ? 2 : 0) + (a.programme ? 1 : 0)));
      return matching.length ? matching[0].passPercentage : null;
    };
    res.json({ success: true, student: { _id: student._id, name: student.name }, ...buildBacklogReport(results, passPercentageFor), note: "Backlog status is derived from published result attempts; original results are never modified." });
  } catch (error) { next(error); }
}
