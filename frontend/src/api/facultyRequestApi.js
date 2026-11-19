import api from "./api";

export const getFacultyRequests = async (params = {}) => {
  const { data } = await api.get("/faculty-requests", { params });
  return data;
};

export const createFacultyRequest = async (payload) => {
  const { data } = await api.post("/faculty-requests", payload);
  return data;
};

export const getCandidateTeachers = async (department) => {
  const { data } = await api.get("/faculty-requests/candidates", { params: { department } });
  return data;
};

export const decideFacultyRequest = async (id, payload) => {
  const { data } = await api.patch(`/faculty-requests/${id}/decision`, payload);
  return data;
};

export const cancelFacultyRequest = async (id) => {
  const { data } = await api.patch(`/faculty-requests/${id}/cancel`);
  return data;
};
