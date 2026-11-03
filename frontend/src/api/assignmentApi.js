import api from "./api";

export const getAssignments = async (params = {}) => {
  const { data } = await api.get("/assignments", { params });
  return data;
};

export const getMyAssignments = async () => {
  const { data } = await api.get("/assignments/me");
  return data;
};

export const createAssignment = async (payload) => {
  const { data } = await api.post("/assignments", payload, {
    headers: payload instanceof FormData ? { "Content-Type": "multipart/form-data" } : {},
  });
  return data;
};

export const submitAssignment = async (id, payload) => {
  const { data } = await api.post(`/assignments/${id}/submit`, payload, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data;
};

export const gradeAssignmentSubmission = async (id, submissionId, payload) => {
  const { data } = await api.put(`/assignments/${id}/submissions/${submissionId}/grade`, payload);
  return data;
};

export const saveAssignment = async (id) => {
  const { data } = await api.put(`/assignments/${id}/save`);
  return data;
};
