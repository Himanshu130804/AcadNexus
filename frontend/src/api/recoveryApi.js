import api from "./api";
export const startOtpRecovery = (payload) => api.post("/recovery/start", payload).then(r => r.data);
export const verifyOtpRecovery = (payload) => api.post("/recovery/verify", payload).then(r => r.data);
export const completeOtpRecovery = (payload) => api.post("/recovery/complete", payload).then(r => r.data);
