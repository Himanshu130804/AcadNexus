import api from "./api";

export const getChargeTypes = async () => {
  const { data } = await api.get("/charges/types");
  return data;
};

export const getTeachers = async () => {
  const { data } = await api.get("/charges/teachers");
  return data;
};

export const getMyCharges = async () => {
  const { data } = await api.get("/charges/me");
  return data;
};

export const getMyTeachingAssignments = async () => {
  const { data } = await api.get("/charges/my-teaching");
  return data;
};

export const assignCharge = async (teacherId, payload) => {
  const { data } = await api.post(`/charges/teachers/${teacherId}`, payload);
  return data;
};

export const removeCharge = async (teacherId, chargeId) => {
  const { data } = await api.delete(`/charges/teachers/${teacherId}/${chargeId}`);
  return data;
};
