import api from "./api";
export const listRegistrationCodes = async (params = {}) => { const { data } = await api.get("/registration-codes", { params }); return data; };
export const createRegistrationCode = async (payload) => { const { data } = await api.post("/registration-codes", payload); return data; };
export const revokeRegistrationCode = async (id) => { const { data } = await api.patch(`/registration-codes/${id}/revoke`); return data; };
