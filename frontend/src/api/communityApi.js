import api from "./api";
export const getCommunities = async () => (await api.get("/communities")).data;
export const joinCommunity = async (id) => (await api.put(`/communities/${id}/join`)).data;
