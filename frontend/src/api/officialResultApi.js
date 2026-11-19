import api from "./api";
export const getOfficialResults = (params = {}) => api.get("/results", { params });
export const verifyOfficialResult = (code) => api.get(`/results/verify/${encodeURIComponent(code)}`);
