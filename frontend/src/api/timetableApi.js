import api from "./api";

export const getTimetable = async (params = {}) => {
  const { data } = await api.get("/timetable", { params });
  return data;
};

export const createTimetableEntry = async (payload) => {
  const { data } = await api.post("/timetable", payload);
  return data;
};

export const deleteTimetableEntry = async (id) => {
  const { data } = await api.delete(`/timetable/${id}`);
  return data;
};

export const getMyTimetable = async () => {
  const { data } = await api.get("/timetable/me");
  return data;
};

export const getTodayTimetable = async () => { const { data } = await api.get("/timetable/today"); return data; };
export const updateTimetableEntry = async (id, payload) => { const { data } = await api.put(`/timetable/${id}`, payload); return data; };
