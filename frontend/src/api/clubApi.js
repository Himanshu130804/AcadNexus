import api from "./api";

export const getClubs = async () => {
  const { data } = await api.get("/clubs");
  return data;
};

export const createClub = async (payload) => {
  const { data } = await api.post("/clubs", payload);
  return data;
};

export const joinClub = async (id) => {
  const { data } = await api.put(`/clubs/${id}/join`);
  return data;
};

export const reviewClub = async (id, status = "approved") => {
  const { data } = await api.patch(`/clubs/${id}/review`, { status });
  return data;
};
