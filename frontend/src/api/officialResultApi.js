import api from "./api";

// EDP uploads finalized official results as validated JSON records.
// The API creates drafts; publication is a separate, authorized action.
export const getOfficialResults = (params = {}) => api.get("/results", { params });
export const uploadOfficialResultBatch = (records) => api.post("/results/batch", { records });
export const publishOfficialResult = (id, reason = "") => api.post(`/results/${id}/publish`, { reason });
export const verifyOfficialResult = (code) => api.get(`/results/verify/${encodeURIComponent(code)}`);
