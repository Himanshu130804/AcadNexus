import axios from "axios";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "http://localhost:5000/api",
  timeout: 15000,
  headers: {
    "Content-Type": "application/json",
  },
});

// attach JWT token automatically
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem("campus_token");

    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// handle expired / invalid token
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