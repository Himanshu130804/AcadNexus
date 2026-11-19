import React, { createContext, useEffect, useState } from "react";
import { logoutUser } from "../api/authApi";
export const AuthContext = createContext();

const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("campus_user");
      const token = localStorage.getItem("campus_token");
      if (saved && token) {
        const parsed = JSON.parse(saved);
        if (parsed && typeof parsed === "object") setUser(parsed);
        else { localStorage.removeItem("campus_user"); localStorage.removeItem("campus_token"); }
      } else {
        localStorage.removeItem("campus_user");
        localStorage.removeItem("campus_token");
      }
    } catch {
      localStorage.removeItem("campus_user");
      localStorage.removeItem("campus_token");
    } finally { setAuthReady(true); }
  }, []);

  const login = (data) => {
    localStorage.setItem("campus_token", data.token);
    localStorage.setItem("campus_user", JSON.stringify(data));
    setUser(data);
  };
  const logout = async () => {
    try { await logoutUser(); } catch { /* local sign-out must still work if the API is unavailable */ }
    localStorage.removeItem("campus_token");
    localStorage.removeItem("campus_user");
    setUser(null);
  };
  return <AuthContext.Provider value={{ user, login, logout, authReady }}>{children}</AuthContext.Provider>;
};
export default AuthProvider;
