import api from "./api";
export const listArchivedInstitutions = async (params = {}) => { const { data } = await api.get("/institutions/archived", { params }); return data; };
export const getInstitutionDetails = async (id) => { const { data } = await api.get(`/institutions/${id}/details`); return data; };
export const getInstitutionHistory = async (id) => { const { data } = await api.get(`/institutions/${id}/history`); return data; };
export const archiveInstitution = async (id, payload) => { const { data } = await api.post(`/institutions/${id}/archive`, payload); return data; };
export const restoreInstitution = async (id, payload) => { const { data } = await api.post(`/institutions/${id}/restore`, payload); return data; };
export const getMyInstitution = async () => { const { data } = await api.get("/institutions/mine"); return data; };
