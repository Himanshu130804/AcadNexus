import api from "./api";

export const getPlatformReports = async (params = {}) => {
  const { data } = await api.get("/platform-reports", { params });
  return data;
};

export const getBenchmarks = async () => {
  const { data } = await api.get("/platform-reports/benchmarks");
  return data;
};
