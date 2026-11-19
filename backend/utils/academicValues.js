export const normalizeSemester = value => String(value ?? "").trim().toLowerCase().replace(/^semester\s*/, "").replace(/^sem\s*/, "").replace(/^0+/, "") || "";
export const sameSemester = (left, right) => normalizeSemester(left) === normalizeSemester(right);
