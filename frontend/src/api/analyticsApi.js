import api from "./api";
export const getMyAnalytics = async () => {
  const response = await api.get("/analytics/me");
  return response.data;
};
export const getCohortClusters = async (params = {}) => {
  const response = await api.get("/analytics/cohort-clusters", { params });
  return response.data;
};
