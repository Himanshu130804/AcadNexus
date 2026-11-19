// Pure helpers for institution archive / restore (no database access, unit-testable).

export const PLATFORM_ROLES = ["super_super_admin", "platform_super_admin"];
export const RESTORABLE_STATUSES = ["pending", "active", "suspended"];

export const isArchivedInstitution = (institution) =>
  Boolean(institution && (institution.deletedAt || institution.status === "archived"));

const norm = (v) => String(v ?? "").trim().toLowerCase();

/** The destructive confirmation must match the institution name or code exactly (case-insensitive). */
export const confirmationMatches = (institution, input) => {
  const typed = norm(input);
  if (!typed || !institution) return false;
  return typed === norm(institution.name) || typed === norm(institution.code);
};

/** Restore to the status held before archival unless the admin explicitly picks another allowed status. */
export const resolveRestoreStatus = (previousStatus, requestedStatus) => {
  const requested = norm(requestedStatus);
  if (requested) return RESTORABLE_STATUSES.includes(requested) ? requested : null;
  const previous = norm(previousStatus);
  return RESTORABLE_STATUSES.includes(previous) ? previous : "pending";
};

export const cleanReason = (value) => String(value ?? "").trim().slice(0, 500);

export const isObjectId = (value) => /^[a-f0-9]{24}$/i.test(String(value || ""));

export const passwordMeetsPolicy = (password) => {
  const value = String(password || "");
  return value.length >= 12 && value.length <= 128 && /[a-z]/.test(value) && /[A-Z]/.test(value) && /[0-9]/.test(value);
};

export const emailLooksValid = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || ""));
