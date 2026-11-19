import jwt from "jsonwebtoken";
export const generateToken = (id, tokenVersion = 0) => jwt.sign({ id, tokenVersion: Number(tokenVersion || 0) }, process.env.JWT_SECRET, { expiresIn: "7d" });
