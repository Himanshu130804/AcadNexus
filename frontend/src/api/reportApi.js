import api from "./api";

export const createReport = async (payload) => {
  const { data } = await api.post("/reports", payload);
  return data;
};

export const getReports = async () => {
  const { data } = await api.get("/reports");
  return data;
};

export const updateReport = async (id, payload) => {
  const { data } = await api.put(`/reports/${id}`, payload);
  return data;
};
