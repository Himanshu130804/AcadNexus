import api from "./api";
export const listViceChancellors = async (params = {}) => { const { data } = await api.get("/vice-chancellors", { params }); return data; };
export const getViceChancellor = async (id) => { const { data } = await api.get(`/vice-chancellors/${id}`); return data; };
export const createViceChancellor = async (payload) => { const { data } = await api.post("/vice-chancellors", payload); return data; };
export const updateViceChancellor = async (id, payload) => { const { data } = await api.put(`/vice-chancellors/${id}`, payload); return data; };
export const setViceChancellorStatus = async (id, payload) => { const { data } = await api.patch(`/vice-chancellors/${id}/status`, payload); return data; };
export const reassignViceChancellor = async (id, payload) => { const { data } = await api.patch(`/vice-chancellors/${id}/institution`, payload); return data; };
