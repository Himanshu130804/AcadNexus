import Attendance from "../models/Attendance.js";
import Assignment from "../models/Assignment.js";
import OfficialResult from "../models/OfficialResult.js";
import User from "../models/User.js";
import { buildCohortRows } from "../utils/cohortMetrics.js";

const same = (a, b) => String(a || "").trim().toLowerCase() === String(b || "").trim().toLowerCase();
const studentAssignmentScope = (student) => ({
  department: student.department,
  ...(student.programme ? { programme: student.programme } : {}),
  ...(student.year ? { year: student.year } : {}),
  ...(student.semester ? { semester: student.semester } : {}),
  ...(student.section ? { section: student.section } : {}),
});

export const getMyAnalytics = async (req, res, next) => {
  try {
    if (!["student", "student_admin"].includes(req.user?.role)) {
      return res.status(403).json({ message: "Personal analytics are available to student accounts only." });
    }
    if (!req.user.department) return res.status(422).json({ message: "Complete your department profile before requesting academic analytics." });
    const studentId = req.user._id;
    const [attendanceRows, results, assignmentRows] = await Promise.all([
      Attendance.find({ "records.student": studentId }).select("subject date records").sort({ date: 1 }).limit(1000).lean(),
      OfficialResult.find({ student: studentId, status: "published" }).select("courseName marks maxMarks semester examSession createdAt").sort({ createdAt: 1 }).limit(500).lean(),
      Assignment.find(studentAssignmentScope(req.user)).select("_id title subject groupType groupName submissions deadline").sort({ createdAt: -1 }).limit(500).lean(),
    ]);
    const assignments = assignmentRows.filter((item) => {
      if (!item.groupType || item.groupType === "full_section" || !item.groupName || item.groupName === "All") return true;
      return [req.user.groupName, req.user.labBatch, req.user.electiveGroup, req.user.specialization].some((value) => same(value, item.groupName));
    });

    let present = 0;
    let attendanceSessions = 0;
    const attendanceBySubject = new Map();
    for (const row of attendanceRows) {
      const record = (row.records || []).find((entry) => String(entry.student) === String(studentId));
      if (!record) continue;
      attendanceSessions += 1;
      if (record.status === "present") present += 1;
      const key = row.subject || "Unspecified";
      const current = attendanceBySubject.get(key) || { present: 0, total: 0 };
      current.total += 1;
      if (record.status === "present") current.present += 1;
      attendanceBySubject.set(key, current);
    }
    const attendanceRate = attendanceSessions ? Number((present / attendanceSessions * 100).toFixed(1)) : null;
    let submitted = 0;
    for (const assignment of assignments) {
      if ((assignment.submissions || []).some((entry) => String(entry.student) === String(studentId))) submitted += 1;
    }
    const assignmentCompletionRate = assignments.length ? Number((submitted / assignments.length * 100).toFixed(1)) : null;
    const normalizedResults = results.map((row) => ({
      subject: row.courseName || "Unspecified",
      marks: Number(row.marks), maxMarks: Number(row.maxMarks),
      semester: row.semester, examSession: row.examSession,
    })).filter((row) => Number.isFinite(row.marks) && Number.isFinite(row.maxMarks) && row.maxMarks > 0 && row.marks >= 0 && row.marks <= row.maxMarks);

    const localSummary = {
      averagePercentage: normalizedResults.length ? Number((normalizedResults.reduce((sum, row) => sum + row.marks / row.maxMarks * 100, 0) / normalizedResults.length).toFixed(2)) : null,
      attendanceRate, assignmentCompletionRate,
    };
    let analysis = {
      modelVersion: "rules-fallback-1.0.0", generatedAt: new Date().toISOString(),
      dataQuality: { resultRecords: normalizedResults.length, attendanceSessions, assignmentRecords: assignments.length },
      summary: { ...localSummary, trend: "insufficient_data", trendDelta: null },
      subjectResults: normalizedResults.map((row) => ({ subject: row.subject, percentage: Number((row.marks / row.maxMarks * 100).toFixed(2)) })),
      anomalies: [], attentionSignals: [], recommendations: [],
      prediction: { available: false, reason: "A validated historical training dataset is not available for this student." },
      service: "local-rule-fallback",
    };
    if (attendanceRate !== null && attendanceSessions >= 3 && attendanceRate < 75) {
      analysis.attentionSignals.push({ signal: "attendance", severity: attendanceRate < 60 ? "high" : "moderate", evidence: `Attendance is ${attendanceRate}% across ${attendanceSessions} recorded sessions.` });
      analysis.recommendations.push({ type: "attendance", title: "Review attendance", reason: "Check missed sessions and plan to attend upcoming classes consistently." });
    }
    if (assignmentCompletionRate !== null && assignments.length >= 3 && assignmentCompletionRate < 60) {
      analysis.attentionSignals.push({ signal: "assignment_completion", severity: "moderate", evidence: `Completion is ${assignmentCompletionRate}% across ${assignments.length} tracked assignments.` });
    }
    const weak = [...analysis.subjectResults].sort((a, b) => a.percentage - b.percentage)[0];
    if (weak && weak.percentage < 60) analysis.recommendations.push({ type: "subject_revision", title: `Review ${weak.subject}`, reason: "It is the lowest percentage among available published result records." });

    const configuredMlUrl = process.env.ML_SERVICE_URL;
    const mlUrl = configuredMlUrl && /^https?:\/\//i.test(configuredMlUrl) ? configuredMlUrl : configuredMlUrl ? `http://${configuredMlUrl}` : "";
    const mlKey = process.env.ML_SERVICE_API_KEY;
    if (mlUrl && mlKey) {
      try {
        const response = await fetch(`${mlUrl.replace(/\/$/, "")}/v1/analyze`, {
          method: "POST", headers: { "Content-Type": "application/json", "X-ML-Service-Key": mlKey },
          body: JSON.stringify({ attendanceRate, attendanceSessions, assignmentCompletionRate, assignmentsTotal: assignments.length, results: normalizedResults }),
          signal: AbortSignal.timeout(2500),
        });
        if (response.ok) analysis = { ...(await response.json()), service: "fastapi" };
      } catch (error) {
        // Analytics must degrade gracefully; the existing academic system remains usable.
        analysis.service = "local-rule-fallback";
        analysis.serviceNotice = "ML service is temporarily unavailable; explainable rule-based insights are shown.";
      }
    }

    return res.json({ success: true, analysis,
      attendanceBySubject: [...attendanceBySubject.entries()].map(([subject, values]) => ({ subject, ...values, percentage: Number((values.present / values.total * 100).toFixed(1)) })),
    });
  } catch (error) { return next(error); }
};

const clusterViewers = ["hod", "teacher_admin", "super_admin", "institute_admin", "vice_chancellor"];
const mlBase = () => { const value = String(process.env.ML_SERVICE_URL || "").trim(); if (!value) return ""; return (/^https?:\/\//i.test(value) ? value : `http://${value}`).replace(/\/$/, ""); };

/** Descriptive cohort clustering (attendance x performance x assignment completion). Only aggregated cluster profiles are returned. */
export const getCohortClusters = async (req, res, next) => {
  try {
    if (!clusterViewers.includes(req.user?.role)) return res.status(403).json({ message: "Cohort analytics are restricted to academic administrators." });
    const institutionId = req.user.institution?._id || req.user.institution;
    const department = req.user.role === "hod" ? String(req.user.department || "") : String(req.query.department || "");
    if (req.user.role === "hod" && !department) return res.status(403).json({ message: "Your HOD account is not assigned to a department." });
    if (!department) return res.status(422).json({ message: "Select a department to analyse." });
    if (!mlBase() || !process.env.ML_SERVICE_API_KEY) return res.status(503).json({ message: "The analytics service is not configured; cohort clustering is unavailable." });
    const studentFilter = { institution: institutionId, role: "student", isActive: true, department };
    for (const key of ["programme", "year", "semester", "section"]) if (req.query[key]) studentFilter[key] = String(req.query[key]);
    const students = await User.find(studentFilter).select("_id department programme year semester section groupName labBatch electiveGroup specialization").limit(500).lean();
    if (students.length < 6) return res.status(422).json({ message: "At least 6 students are required for a meaningful cohort analysis.", considered: students.length });
    const ids = students.map((student) => student._id);
    const [results, attendanceAgg, assignments] = await Promise.all([
      OfficialResult.find({ student: { $in: ids }, status: "published" }).select("student marks maxMarks").limit(20000).lean(),
      Attendance.aggregate([
        { $match: { department } }, { $unwind: "$records" }, { $match: { "records.student": { $in: ids } } },
        { $group: { _id: "$records.student", present: { $sum: { $cond: [{ $eq: ["$records.status", "present"] }, 1, 0] } }, total: { $sum: 1 } } },
      ]),
      Assignment.find({ department }).select("department programme year semester section groupType groupName submissions.student").limit(2000).lean(),
    ]);
    const resultsByStudent = new Map();
    for (const row of results) { const key = String(row.student); if (!resultsByStudent.has(key)) resultsByStudent.set(key, []); resultsByStudent.get(key).push(row); }
    const attendanceByStudent = new Map(attendanceAgg.map((row) => [String(row._id), { present: row.present, total: row.total }]));
    const { rows, considered, excluded } = buildCohortRows(students, resultsByStudent, attendanceByStudent, assignments);
    if (rows.length < 6) return res.status(422).json({ message: "Fewer than 6 students have complete attendance, result and assignment data; no clustering was performed.", considered, included: rows.length, excluded });
    let response;
    try {
      response = await fetch(`${mlBase()}/v1/clusters`, { method: "POST", headers: { "Content-Type": "application/json", "X-ML-Service-Key": process.env.ML_SERVICE_API_KEY }, body: JSON.stringify({ students: rows }), signal: AbortSignal.timeout(10000) });
    } catch { return res.status(503).json({ message: "The analytics service is temporarily unavailable." }); }
    if (!response.ok) return res.status(502).json({ message: "The analytics service could not analyse this cohort." });
    const data = await response.json();
    return res.json({ success: true, scope: { department, ...Object.fromEntries(["programme", "year", "semester", "section"].filter((key) => req.query[key]).map((key) => [key, String(req.query[key])])) }, cohort: { considered, included: rows.length, excluded }, modelVersion: data.modelVersion, clusters: data.clusters, note: "Clusters describe aggregate cohort patterns only. They are not labels for individual students and must not be used for eligibility decisions." });
  } catch (error) { return next(error); }
};
