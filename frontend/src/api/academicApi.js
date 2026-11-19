import api from "./api";

export const getAcademicOptions = async (params = {}) => {
  const { data } = await api.get("/academic", { params });
  return data;
};

export const getMyProgramme = async () => {
  const { data } = await api.get("/academic/me/programme");
  return data;
};

export const getMyCourses = async () => {
  const { data } = await api.get("/academic/me/courses");
  return data;
};

export const createAcademicOption = async (payload) => {
  const { data } = await api.post("/academic", payload);
  return data;
};

export const updateAcademicOption = async (id, payload) => {
  const { data } = await api.put(`/academic/${id}`, payload);
  return data;
};

export const setAcademicOptionStatus = async (id, isActive) => {
  const { data } = await api.patch(`/academic/${id}/status`, { isActive });
  return data;
};

export const cleanupAcademicOptions = async () => {
  const { data } = await api.post("/academic/cleanup");
  return data;
};

export const seedAcademicOptions = async () => {
  const { data } = await api.post("/academic/seed");
  return data;
};


export const getRegistrationAcademicOptions = async (params = {}) => {
  const { data } = await api.get("/academic/registration-options", { params });
  return data;
};

export const selectMySubject = async (id) => {
  const { data } = await api.post(`/academic/me/courses/${id}/select`);
  return data;
};

export const getRegistrationOptions = async (params = {}) => { const { data } = await api.get("/academic/registration-options", { params }); return data; };
