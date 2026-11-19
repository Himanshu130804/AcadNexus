/** Escape user-controlled text before using it in a MongoDB RegExp. */
export const escapeRegex = (value = "") =>
  String(value)
    .slice(0, 200)
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export const searchRegex = (value = "") => new RegExp(escapeRegex(value), "i");
export const exactText = (value = "") => new RegExp(`^${escapeRegex(value)}$`, "i");
