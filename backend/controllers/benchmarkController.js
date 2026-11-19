import OfficialResult from "../models/OfficialResult.js";
import { runWithTenant } from "../utils/tenantContext.js";
import { buildBenchmark } from "../utils/benchmarking.js";

/**
 * Anonymized cross-institution benchmark of average published-result percentage.
 * The cross-tenant read below is deliberately narrow: it only computes per-institution aggregates, and the response is
 * produced by buildBenchmark(), which withholds the comparison unless enough institutions/students participate and never
 * returns institution identifiers or any student-level data.
 */
export const getBenchmarks = async (req, res, next) => {
  try {
    const isPlatform = ["super_super_admin", "platform_super_admin"].includes(req.user?.role);
    const institutionId = isPlatform ? null : (req.user.institution?._id || req.user.institution);
    if (!isPlatform && !institutionId) return res.status(403).json({ message: "Your account is not assigned to an institution." });
    const rows = await runWithTenant({ institutionId: null, bypassTenantScope: true }, () => OfficialResult.aggregate([
      { $match: { status: "published", maxMarks: { $gt: 0 }, $expr: { $lte: ["$marks", "$maxMarks"] } } },
      { $group: { _id: { institutionId: "$institutionId", student: "$student" }, studentAverage: { $avg: { $multiply: [{ $divide: ["$marks", "$maxMarks"] }, 100] } } } },
      { $group: { _id: "$_id.institutionId", students: { $sum: 1 }, averagePercentage: { $avg: "$studentAverage" } } },
    ]));
    const benchmark = buildBenchmark(rows.filter((row) => row._id).map((row) => ({ institutionId: row._id, students: row.students, averagePercentage: row.averagePercentage })), { institutionId });
    res.json({ success: true, metric: "Average percentage across published official results", benchmark });
  } catch (error) { next(error); }
};
