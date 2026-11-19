import Report from "../models/Report.js";
import Content from "../models/Content.js";

export const createReport = async (req, res) => {
  const { content, reason, details } = req.body;

  if (!content || !reason) {
    return res.status(400).json({ message: "Content and reason are required" });
  }

  const visibleContent = await Content.findById(content).select("_id");
  if (!visibleContent) return res.status(404).json({ message: "Content not found in your institute." });

  const report = await Report.create({
    content,
    reason,
    details,
    reportedBy: req.user._id,
  });

  res.status(201).json(report);
};

export const getReports = async (req, res) => {
  const reports = await Report.find()
    .populate("content", "title type department status")
    .populate("reportedBy", "name email department")
    .populate("reviewedBy", "name role")
    .sort({ createdAt: -1 });

  res.json(reports);
};

export const updateReport = async (req, res) => {
  const report = await Report.findById(req.params.id);

  if (!report) return res.status(404).json({ message: "Report not found" });

  report.status = req.body.status || report.status;
  report.adminRemarks = req.body.adminRemarks || report.adminRemarks;
  report.reviewedBy = req.user._id;

  await report.save();

  res.json(report);
};
