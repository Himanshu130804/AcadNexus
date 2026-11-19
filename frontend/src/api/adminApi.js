import api from "./api";

export const getStats = async () => {
  const { data } = await api.get("/admin/stats");
  return data;
};

export const getUsers = async () => {
  const { data } = await api.get("/admin/users");
  return data;
};

export const getUserById = async (id) => {
  const { data } = await api.get(`/admin/users/${id}`);
  return data;
};

export const updateUserAcademic = async (id, payload) => {
  const { data } = await api.put(`/admin/users/${id}`, payload);
  return data;
};

export const updateUserRole = async (id, role) => {
  const { data } = await api.put(`/admin/users/${id}/role`, { role });
  return data;
};

export const getAuditLogs = async () => {
  const { data } = await api.get("/admin/audit-logs");
  return data;
};

export const setUserStatus = async (id, status) => {
  const { data } = await api.patch(`/admin/users/${id}/status`, { status });
  return data;
};
