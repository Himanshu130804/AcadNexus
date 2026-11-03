import api from "./api";

export const getPlatformReports = async (params = {}) => {
  const { data } = await api.get("/platform-reports", { params });
  return data;
};
