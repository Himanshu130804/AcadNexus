const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:5000/api";

const SERVER_BASE = (() => {
  try {
    if (/^https?:\/\//i.test(API_BASE)) return new URL(API_BASE).origin;
    return window.location.origin;
  } catch {
    return "";
  }
})();

export const getFileUrl = (url) => {
  if (!url) return "";
  if (/^https?:\/\//i.test(url)) return url;
  return `${SERVER_BASE}${String(url).startsWith("/") ? "" : "/"}${url}`;
};
