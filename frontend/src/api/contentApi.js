import api from "./api";

export const getContent = async (params = {}) => {
  const { data } = await api.get("/content", { params });
  return data;
};

export const getGroupedContent = async (params = {}) => {
  const { data } = await api.get("/content/grouped", { params });
  return data;
};

export const getMyContent = async () => {
  const { data } = await api.get("/content/me");
  return data;
};

export const getSavedContent = async () => {
  const { data } = await api.get("/content/saved");
  return data;
};

export const submitContent = async (payload) => {
  const isFormData = payload instanceof FormData;

  const { data } = await api.post("/content", payload, {
    headers: isFormData ? { "Content-Type": "multipart/form-data" } : {},
  });

  return data;
};

export const getPendingContent = async (params = {}) => {
  const { data } = await api.get("/content/pending", { params });
  return data;
};

export const reviewContent = async (id, payload) => {
  const { data } = await api.put(`/content/${id}/review`, payload);
  return data;
};

export const toggleLike = async (id) => {
  const { data } = await api.put(`/content/${id}/like`);
  return data;
};

export const toggleSave = async (id) => {
  const { data } = await api.put(`/content/${id}/save`);
  return data;
};

export const addComment = async (id, text) => {
  const { data } = await api.post(`/content/${id}/comments`, { text });
  return data;
};
