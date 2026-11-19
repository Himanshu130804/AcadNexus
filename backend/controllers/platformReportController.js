import mongoose from "mongoose";
import Institution from "../models/Institution.js";
import User from "../models/User.js";
import Attendance from "../models/Attendance.js";
import Assignment from "../models/Assignment.js";
import Timetable from "../models/Timetable.js";
import Content from "../models/Content.js";
import Club from "../models/Club.js";
import Community from "../models/Community.js";
import Report from "../models/Report.js";
import FacultyRequest from "../models/FacultyRequest.js";
import OfficialResult from "../models/OfficialResult.js";

const toDate = (value, fallback) => {
  if (!value) return fallback;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? fallback : date;
};

const buildDateMatch = (field, from, to) => {
  const match = {};
  if (from || to) match[field] = {};
  if (from) match[field].$gte = from;
  if (to) match[field].$lte = to;
  return match;
};

const safePercent = (numerator, denominator) => denominator ? Math.round((numerator / denominator) * 1000) / 10 : 0;

const groupByInstitution = async (Model, match, field = "institutionId") => {
  const rows = await Model.aggregate([
    { $match: match },
    { $group: { _id: `$${field}`, count: { $sum: 1 } } },
  ]);
  return new Map(rows.filter((row) => row._id).map((row) => [String(row._id), row.count]));
};
const teacherStudentIds = async (user) => {
  const institutionId = user?.institution?._id || user?.institution || user?.institutionId;
  if (!institutionId) return [];
  const charges = (user.charges || []).filter((charge) => charge.isActive !== false && ["teaching", "class_incharge"].includes(charge.type));
  if (!charges.length) return [];
  const filters = charges.map((charge) => {
    const filter = { institution: institutionId, role: "student" };
    ["department", "programme", "year", "semester", "section"].forEach((key) => {
      if (charge[key] && charge[key] !== "All") filter[key] = charge[key];
    });
    if (charge.groupType && charge.groupType !== "full_section" && charge.groupName && charge.groupName !== "All") {
      const groupKey = { sub_group: "groupName", lab_batch: "labBatch", elective: "electiveGroup", specialization: "specialization" }[charge.groupType];
      if (groupKey) filter[groupKey] = charge.groupName;
    }
    return filter;
  });
  const students = await User.find({ $or: filters }).select("_id").lean();
  return students.map((student) => student._id);
};

export const getPlatformReports = async (req, res, next) => {
  try {
    const role = req.user?.role;
    const isPlatformOwner = ["super_super_admin", "platform_super_admin"].includes(role);

    // Personal reports for students and teachers are deliberately kept separate
    // from the institution/platform aggregate view.
    if (["student", "teacher"].includes(role)) {
      const institutionId = req.user?.institution?._id || req.user?.institution || req.user?.institutionId;
      if (!institutionId) return res.status(403).json({ message: "Your account is not assigned to an institution" });

      const now = new Date();
      const defaultFrom = new Date(now);
      defaultFrom.setDate(defaultFrom.getDate() - 30);
      const from = toDate(req.query.from, defaultFrom);
      const to = toDate(req.query.to, now);
      if (from > to) return res.status(400).json({ message: "The report start date must be before the end date." });

      const userId = new mongoose.Types.ObjectId(req.user._id);
      const institutionObjectId = new mongoose.Types.ObjectId(institutionId);
      if (role === "student") {
        const [attendance, assignmentRows, resultRows] = await Promise.all([
          Attendance.aggregate([
            { $match: { institutionId: institutionObjectId, createdAt: { $gte: from, $lte: to }, "records.student": userId } },
            { $project: { records: { $filter: { input: "$records", as: "r", cond: { $eq: ["$$r.student", userId] } } } } },
            { $unwind: "$records" },
            { $group: { _id: null, present: { $sum: { $cond: [{ $eq: ["$records.status", "present"] }, 1, 0] } }, total: { $sum: 1 }, sessions: { $sum: 1 } } },
          ]),
          Assignment.aggregate([
            { $match: { institutionId: institutionObjectId, createdAt: { $gte: from, $lte: to }, "submissions.student": userId } },
            { $project: { submission: { $first: { $filter: { input: "$submissions", as: "s", cond: { $eq: ["$$s.student", userId] } } } } } },
            { $group: { _id: null, assignments: { $sum: 1 }, graded: { $sum: { $cond: [{ $eq: ["$submission.status", "graded"] }, 1, 0] } }, marks: { $sum: { $ifNull: ["$submission.marks", 0] } } } },
          ]),
          OfficialResult.aggregate([
            { $match: { institutionId: institutionObjectId, student: userId, status: "published", createdAt: { $gte: from, $lte: to } } },
            { $group: { _id: null, results: { $sum: 1 }, marks: { $sum: "$marks" }, maxMarks: { $sum: "$maxMarks" } } },
          ]),
        ]);
        const a = attendance[0] || { present: 0, total: 0, sessions: 0 };
        const as = assignmentRows[0] || { assignments: 0, graded: 0, marks: 0 };
        const rr = resultRows[0] || { results: 0, marks: 0, maxMarks: 0 };
        return res.json({ mode: "personal", audience: "student", range: { from: from.toISOString(), to: to.toISOString() }, filters: { institutionId: String(institutionId), userId: String(req.user._id) }, institutions: [], institutionComparison: [], metrics: { attendanceRate: safePercent(a.present, a.total), attendanceSessions: a.sessions, assignments: as.assignments, gradedSubmissions: as.graded, publishedResults: rr.results, resultPercentage: safePercent(rr.marks, rr.maxMarks), submissions: as.assignments, students: 1, teachers: 0, staff: 0, institutions: 1, pendingActions: 0, events: 0 }, breakdowns: { results: rr.results ? { published: rr.results } : {} } });
      }

      const assignedStudentIds = await teacherStudentIds(req.user);
      const [attendance, assignments, results] = await Promise.all([
        Attendance.aggregate([{ $match: { institutionId: institutionObjectId, markedBy: userId, createdAt: { $gte: from, $lte: to } } }, { $project: { present: { $size: { $filter: { input: "$records", as: "r", cond: { $eq: ["$$r.status", "present"] } } } }, total: { $size: "$records" } } }, { $group: { _id: null, sessions: { $sum: 1 }, present: { $sum: "$present" }, total: { $sum: "$total" } } }]),
        Assignment.aggregate([{ $match: { institutionId: institutionObjectId, createdBy: userId, createdAt: { $gte: from, $lte: to } } }, { $project: { submissions: { $size: "$submissions" }, graded: { $size: { $filter: { input: "$submissions", as: "s", cond: { $eq: ["$$s.status", "graded"] } } } } } }, { $group: { _id: null, assignments: { $sum: 1 }, submissions: { $sum: "$submissions" }, graded: { $sum: "$graded" } } }]),
        OfficialResult.countDocuments({ institutionId: institutionObjectId, student: { $in: assignedStudentIds }, status: "published", createdAt: { $gte: from, $lte: to } }),
      ]);
      const a = attendance[0] || { sessions: 0, present: 0, total: 0 };
      const as = assignments[0] || { assignments: 0, submissions: 0, graded: 0 };
      return res.json({ mode: "personal", audience: "teacher", range: { from: from.toISOString(), to: to.toISOString() }, filters: { institutionId: String(institutionId), userId: String(req.user._id) }, institutions: [], institutionComparison: [], metrics: { attendanceRate: safePercent(a.present, a.total), attendanceSessions: a.sessions, assignments: as.assignments, submissions: as.submissions, gradedSubmissions: as.graded, publishedResults: results, students: assignedStudentIds.length, teachers: 1, staff: 0, institutions: 1, pendingActions: 0, events: 0 }, breakdowns: { results: results ? { published: results } : {} } });
    }

    const canViewInstitutionReport = ["institute_admin", "vice_chancellor"].includes(role);
    if (!isPlatformOwner && !canViewInstitutionReport) return res.status(403).json({ message: "You do not have permission to view this report." });

    const now = new Date();
    const defaultFrom = new Date(now);
    defaultFrom.setDate(defaultFrom.getDate() - 30);
    const from = toDate(req.query.from, defaultFrom);
    const to = toDate(req.query.to, now);
    if (from > to) return res.status(400).json({ message: "The report start date must be before the end date." });

    const requestedInstitution = req.query.institutionId;
    const ownInstitutionId = req.user?.institution?._id || req.user?.institution || req.user?.institutionId;
    const enforcedInstitution = !isPlatformOwner && ownInstitutionId ? String(ownInstitutionId) : requestedInstitution;
    const institutionFilter = enforcedInstitution && mongoose.isValidObjectId(enforcedInstitution)
      ? new mongoose.Types.ObjectId(enforcedInstitution)
      : null;
    const institutionMatch = institutionFilter ? { _id: institutionFilter } : {};
    const baseInstitutionIds = await Institution.find(institutionMatch).distinct("_id");
    const institutionIds = baseInstitutionIds.map((id) => new mongoose.Types.ObjectId(id));
    const scopedIds = institutionIds.length ? institutionIds : [new mongoose.Types.ObjectId("000000000000000000000000")];
    const scoped = { $in: scopedIds };

    const activeUsersMatch = { institution: scoped, tenantStatus: "active", isSuspended: { $ne: true } };
    const studentsMatch = { ...activeUsersMatch, role: "student" };
    const teachersMatch = { ...activeUsersMatch, role: { $in: ["teacher", "teacher_admin", "hod"] } };
    const staffMatch = { ...activeUsersMatch, role: { $in: ["staff", "edp", "department_admin", "institute_admin", "vice_chancellor"] } };

    const [
      institutionCount,
      studentCount,
      teacherCount,
      staffCount,
      attendanceStats,
      assignmentStats,
      timetableCount,
      eventStats,
      announcementStats,
      noteCount,
      clubStats,
      communityCount,
      moderationStats,
      facultyRequestStats,
      resultStats,
      pendingContentCount,
      institutionRows,
    ] = await Promise.all([
      Institution.countDocuments({ _id: scoped, status: { $ne: "archived" }, deletedAt: null }),
      User.countDocuments(studentsMatch),
      User.countDocuments(teachersMatch),
      User.countDocuments(staffMatch),
      Attendance.aggregate([
        { $match: { institutionId: scoped, createdAt: { $gte: from, $lte: to } } },
        { $project: { present: { $size: { $filter: { input: "$records", as: "r", cond: { $eq: ["$$r.status", "present"] } } } }, total: { $size: "$records" } } },
        { $group: { _id: null, sessions: { $sum: 1 }, present: { $sum: "$present" }, total: { $sum: "$total" } } },
      ]),
      Assignment.aggregate([
        { $match: { institutionId: scoped, createdAt: { $gte: from, $lte: to } } },
        { $project: { submissions: { $size: "$submissions" }, graded: { $size: { $filter: { input: "$submissions", as: "s", cond: { $eq: ["$$s.status", "graded"] } } } } } },
        { $group: { _id: null, assignments: { $sum: 1 }, submissions: { $sum: "$submissions" }, graded: { $sum: "$graded" } } },
      ]),
      Timetable.countDocuments({ institutionId: scoped }),
      Content.aggregate([
        { $match: { institutionId: scoped, type: "event", createdAt: { $gte: from, $lte: to } } },
        { $group: { _id: "$status", count: { $sum: 1 } } },
      ]),
      Content.aggregate([
        { $match: { institutionId: scoped, type: "announcement", createdAt: { $gte: from, $lte: to } } },
        { $group: { _id: "$status", count: { $sum: 1 } } },
      ]),
      Content.countDocuments({ institutionId: scoped, type: "note", createdAt: { $gte: from, $lte: to } }),
      Club.aggregate([
        { $match: { institutionId: scoped } },
        { $project: { members: { $size: { $ifNull: ["$members", []] } }, events: { $size: { $ifNull: ["$events", []] } } } },
        { $group: { _id: null, clubs: { $sum: 1 }, members: { $sum: "$members" }, events: { $sum: "$events" } } },
      ]),
      Community.countDocuments({ institutionId: scoped }),
      Report.aggregate([
        { $match: { institutionId: scoped, createdAt: { $gte: from, $lte: to } } },
        { $group: { _id: "$status", count: { $sum: 1 } } },
      ]),
      FacultyRequest.aggregate([
        { $match: { institutionId: scoped, createdAt: { $gte: from, $lte: to } } },
        { $group: { _id: "$status", count: { $sum: 1 } } },
      ]),
      OfficialResult.aggregate([
        { $match: { institutionId: scoped, createdAt: { $gte: from, $lte: to } } },
        { $group: { _id: "$status", count: { $sum: 1 } } },
      ]),
      Content.countDocuments({ institutionId: scoped, status: "pending", createdAt: { $gte: from, $lte: to } }),
      Institution.find(institutionMatch).select("_id name code status type").sort({ name: 1 }).lean(),
    ]);

    const countByStatus = (rows) => Object.fromEntries(rows.map((row) => [row._id || "unknown", row.count]));
    const attendance = attendanceStats[0] || { sessions: 0, present: 0, total: 0 };
    const assignments = assignmentStats[0] || { assignments: 0, submissions: 0, graded: 0 };
    const events = countByStatus(eventStats);
    const announcements = countByStatus(announcementStats);
    const moderation = countByStatus(moderationStats);
    const facultyRequests = countByStatus(facultyRequestStats);
    const results = countByStatus(resultStats);
    const clubs = clubStats[0] || { clubs: 0, members: 0, events: 0 };

    const [studentByInstitution, teacherByInstitution, attendanceByInstitution, assignmentByInstitution, eventByInstitution, resultByInstitution] = await Promise.all([
      groupByInstitution(User, studentsMatch, "institution"),
      groupByInstitution(User, teachersMatch, "institution"),
      Attendance.aggregate([
        { $match: { institutionId: scoped, createdAt: { $gte: from, $lte: to } } },
        { $project: { institutionId: 1, present: { $size: { $filter: { input: "$records", as: "r", cond: { $eq: ["$$r.status", "present"] } } } }, total: { $size: "$records" } } },
        { $group: { _id: "$institutionId", present: { $sum: "$present" }, total: { $sum: "$total" } } },
      ]).then((rows) => new Map(rows.map((row) => [String(row._id), safePercent(row.present, row.total)]))),
      groupByInstitution(Assignment, { institutionId: scoped, createdAt: { $gte: from, $lte: to } }),
      groupByInstitution(Content, { institutionId: scoped, type: "event", createdAt: { $gte: from, $lte: to } }),
      groupByInstitution(OfficialResult, { institutionId: scoped, status: "published", createdAt: { $gte: from, $lte: to } }),
    ]);

    const institutionComparison = institutionRows.map((institution) => ({
      id: institution._id,
      name: institution.name,
      code: institution.code,
      status: institution.status,
      students: studentByInstitution.get(String(institution._id)) || 0,
      teachers: teacherByInstitution.get(String(institution._id)) || 0,
      attendanceRate: attendanceByInstitution.get(String(institution._id)) || 0,
      assignments: assignmentByInstitution.get(String(institution._id)) || 0,
      events: eventByInstitution.get(String(institution._id)) || 0,
      publishedResults: resultByInstitution.get(String(institution._id)) || 0,
    }));

    const pendingActions =
      pendingContentCount +
      (moderation.pending || 0) +
      (facultyRequests.pending || 0) +
      (results.draft || 0);

    res.json({
      range: { from: from.toISOString(), to: to.toISOString() },
      filters: { institutionId: institutionFilter ? String(institutionFilter) : "all" },
      institutions: institutionRows,
      metrics: {
        institutions: institutionCount,
        students: studentCount,
        teachers: teacherCount,
        staff: staffCount,
        attendanceRate: safePercent(attendance.present, attendance.total),
        attendanceSessions: attendance.sessions,
        timetableEntries: timetableCount,
        assignments: assignments.assignments,
        submissions: assignments.submissions,
        gradedSubmissions: assignments.graded,
        submissionRate: safePercent(assignments.submissions, Math.max(assignments.assignments, 0) * Math.max(studentCount, 1)),
        events: Object.values(events).reduce((sum, value) => sum + value, 0),
        pendingEvents: events.pending || 0,
        announcements: Object.values(announcements).reduce((sum, value) => sum + value, 0),
        notes: noteCount,
        clubs: clubs.clubs,
        clubMembers: clubs.members,
        clubEvents: clubs.events,
        communities: communityCount,
        moderationReports: Object.values(moderation).reduce((sum, value) => sum + value, 0),
        openModerationReports: moderation.pending || 0,
        pendingFacultyRequests: facultyRequests.pending || 0,
        publishedResults: results.published || 0,
        draftResults: results.draft || 0,
        pendingActions,
      },
      breakdowns: {
        events,
        announcements,
        moderation,
        facultyRequests,
        results,
      },
      institutionComparison,
    });
  } catch (error) {
    next(error);
  }
};
