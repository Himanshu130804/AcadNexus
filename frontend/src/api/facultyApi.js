import api from "./api";

export const getFacultyProfiles = async (params = {}) => {
  const { data } = await api.get("/faculty", { params });
  return data;
};

export const createFacultyProfile = async (payload) => {
  const { data } = await api.post("/faculty", payload);
  return data;
};
