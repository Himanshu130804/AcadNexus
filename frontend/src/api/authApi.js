import api from "./api";

export const registerUser = async (userData) => {
  const { data } = await api.post("/auth/register", userData);
  return data;
};

export const validateRegistrationCode = async (code) => { const { data } = await api.post("/registration-codes/validate", { code }); return data; };

export const loginUser = async (credentials) => {
  const { data } = await api.post("/auth/login", credentials);
  return data;
};

export const getInstitutions = async () => { const { data } = await api.get("/institutions/public"); return data; };
export const getManagedInstitutions = async () => { const { data } = await api.get("/institutions/managed"); return data; };

export const requestPasswordReset = async (payload) => { const { data } = await api.post("/auth/forgot-password", payload); return data; };
export const submitPasswordReset = async (payload) => { const { data } = await api.post("/auth/reset-password", payload); return data; };

export const logoutUser = async () => { const { data } = await api.post("/auth/logout"); return data; };
