import crypto from "crypto";

export const normalizeRegistrationCode = (value = "") => String(value).trim().toUpperCase().replace(/\s+/g, "");
export const hashRegistrationCode = (value) => crypto.createHash("sha256").update(normalizeRegistrationCode(value)).digest("hex");

export const generateRegistrationCode = (type) => {
  const prefixMap = {
    institution_admin: "IAC",
    vice_chancellor: "VC",
    teacher: "TCH",
    student: "STU",
    staff: "STF",
    edp: "EDP",
  };
  const prefix = prefixMap[type];
  if (!prefix) throw new Error("Unsupported registration code type");
  const random = crypto.randomBytes(18).toString("base64url").replace(/[-_]/g, "").toUpperCase().slice(0, 24);
  const groups = random.match(/.{1,4}/g)?.join("-") || random;
  return `ACN-${prefix}-${groups}`;
};

export const isRegistrationCodeExpired = (expiresAt) => new Date(expiresAt).getTime() <= Date.now();
