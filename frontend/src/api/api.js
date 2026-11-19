import axios from "axios";

const developmentApiUrl = import.meta.env.DEV ? `${window.location.protocol}//${window.location.hostname}:5000/api` : "";
export const API_BASE_URL = import.meta.env.VITE_API_URL || developmentApiUrl;

if (!API_BASE_URL) {
  throw new Error("VITE_API_URL must be configured for the production frontend build.");
}

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000,
  headers: { "Content-Type": "application/json" },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("campus_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem("campus_token");
      localStorage.removeItem("campus_user");
      window.location.href = "/login";
    }
    return Promise.reject(error);
  }
);

export default api;
