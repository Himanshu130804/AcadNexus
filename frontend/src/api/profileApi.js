import api from "./api";

export const getMyProfile = async () => {
  const { data } = await api.get("/profile/me");
  return data;
};

export const updateMyProfile = async (payload) => {
  const isFormData = payload instanceof FormData;

  const { data } = await api.put("/profile/me", payload, {
    headers: isFormData ? { "Content-Type": "multipart/form-data" } : {},
  });

  return data;
};

export const getMyCourses = async () => {
  const { data } = await api.get("/profile/courses");
  return data;
};
