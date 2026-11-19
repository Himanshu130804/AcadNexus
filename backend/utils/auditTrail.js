import AuditLog from "../models/AuditLog.js";

/**
 * Best-effort structured audit write. State has usually changed by the time this
 * runs, so a logging failure is reported to the server log instead of turning a
 * completed operation into an error response. Never pass passwords, tokens or raw
 * registration codes in `remarks` or `metadata`.
 */
export const logAudit = async ({ req, action, institutionId, targetId, targetType, status, remarks, metadata, outcome = "success" }) => {
  try {
    await AuditLog.create({
      action,
      admin: req?.user?._id,
      adminRole: req?.user?.role,
      status,
      remarks,
      institutionId: institutionId || undefined,
      targetId: targetId || undefined,
      targetType,
      outcome,
      metadata,
    });
  } catch (error) {
    console.error(`Audit log write failed for ${action}: ${error.message}`);
  }
};
