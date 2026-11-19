import api from "./api";

export const getStudentsForAttendance = async (params = {}) => {
  const { data } = await api.get("/attendance/students", { params });
  return data;
};

export const getAttendanceGroups = async (params = {}) => {
  const { data } = await api.get("/attendance/groups", { params });
  return data;
};

export const updateStudentGroupForAttendance = async (id, payload = {}) => {
  const { data } = await api.put(`/attendance/students/${id}/group`, payload);
  return data;
};

export const markAttendance = async (payload) => {
  const { data } = await api.post("/attendance", payload);
  return data;
};

export const getMyAttendance = async () => {
  const { data } = await api.get("/attendance/me");
  return data;
};

export const getAttendanceRecords = async (params = {}) => {
  const { data } = await api.get("/attendance", { params });
  return data;
};
