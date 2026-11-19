import { API_BASE_URL } from "../api/api";

const SERVER_BASE = new URL(API_BASE_URL, window.location.origin).origin;

export const getFileUrl = (url) => {
  if (!url) return "";
  if (/^https?:\/\//i.test(url)) return url;
  return `${SERVER_BASE}${String(url).startsWith("/") ? "" : "/"}${url}`;
};
