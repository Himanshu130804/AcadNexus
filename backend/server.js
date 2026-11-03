import express from "express";
import mongoose from "mongoose";
import dotenv from "dotenv";
import cors from "cors";
import morgan from "morgan";
import path from "path";
import connectDB from "./config/db.js";
import authRoutes from "./routes/authRoutes.js";
import institutionRoutes from "./routes/institutionRoutes.js";
import contentRoutes from "./routes/contentRoutes.js";
import adminRoutes from "./routes/adminRoutes.js";
import communityRoutes from "./routes/communityRoutes.js";
import uploadRoutes from "./routes/uploadRoutes.js";
import notificationRoutes from "./routes/notificationRoutes.js";
import reportRoutes from "./routes/reportRoutes.js";
import platformReportRoutes from "./routes/platformReportRoutes.js";
import clubRoutes from "./routes/clubRoutes.js";
import facultyRoutes from "./routes/facultyRoutes.js";
import attendanceRoutes from "./routes/attendanceRoutes.js";
import timetableRoutes from "./routes/timetableRoutes.js";
import assignmentRoutes from "./routes/assignmentRoutes.js";
import { errorHandler, notFound } from "./middleware/errorMiddleware.js";
import academicRoutes from "./routes/academicRoutes.js";
import chargeRoutes from "./routes/chargeRoutes.js";
import facultyRequestRoutes from "./routes/facultyRequestRoutes.js";
import profileRoutes from "./routes/profileRoutes.js";
import { sanitizeBody, securityHeaders } from "./middleware/securityMiddleware.js";
import officialResultRoutes from "./routes/officialResultRoutes.js";
import registrationCodeRoutes from "./routes/registrationCodeRoutes.js";
import { seedPlatformOwner } from "./utils/seedPlatformOwner.js";

dotenv.config();

if (process.env.NODE_ENV === "production" && (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32)) {
  throw new Error("JWT_SECRET must be configured with at least 32 characters in production.");
}

let dbConnection;
try {
  dbConnection = await connectDB();
  await seedPlatformOwner();
} catch (error) {
  console.error(`AcadNexus startup aborted: ${error.message}`);
  process.exitCode = 1;
  process.exit(1);
}

const app = express();
app.disable("x-powered-by");

const normalizeOrigin = (origin = "") => String(origin).trim().replace(/\/$/, "");

const configuredOrigins = (process.env.CLIENT_URL || "")
  .split(",")
  .map(normalizeOrigin)
  .filter(Boolean);
const developmentOrigins = process.env.NODE_ENV === "production"
  ? []
  : ["http://localhost:5173", "http://localhost:3000"];
const allowedOrigins = [...new Set([...configuredOrigins, ...developmentOrigins].map(normalizeOrigin))];

if (process.env.NODE_ENV === "production" && configuredOrigins.length === 0) {
  throw new Error("CLIENT_URL must contain at least one trusted frontend origin in production.");
}

const corsOptions = {
  origin(origin, cb) {
    const cleanOrigin = normalizeOrigin(origin);

    if (!origin) return cb(null, true);
    if (allowedOrigins.includes(cleanOrigin)) return cb(null, true);

    const error = new Error("Origin is not allowed by CORS policy.");
    error.status = 403;
    error.publicMessage = "Origin is not allowed.";
    return cb(error);
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
};

app.get("/health", (_req, res) => res.json({ success: true, status: "ok" }));
app.get("/ready", (_req, res) => {
  const ready = mongoose.connection.readyState === 1;
  res.status(ready ? 200 : 503).json({ success: ready, status: ready ? "ready" : "not_ready" });
});

app.use(securityHeaders);
app.use(cors(corsOptions));
app.options("*", cors(corsOptions));
app.use(express.json({ limit: "3mb" }));
app.use(sanitizeBody);
// Keep production request logs concise; do not add tokens or personal data to URLs.
app.use(morgan(process.env.NODE_ENV === "production" ? "tiny" : "dev", {
  skip: (req) => process.env.NODE_ENV === "production" && req.path === "/health",
}));

// Local static uploads are for development only. Production files should be served
// through authorized routes or private object storage, not a public directory.
if (process.env.NODE_ENV !== "production") {
  app.use("/uploads", express.static(path.join(process.cwd(), "uploads"), {
    dotfiles: "deny",
    index: false,
    maxAge: "5m",
  }));
}

app.get("/", (req, res) => res.json({ success: true, message: "AcadNexus Backend Running" }));
app.use("/api/auth", authRoutes);
app.use("/api/registration-codes", registrationCodeRoutes);
app.use("/api/institutions", institutionRoutes);
app.use("/api/profile", profileRoutes);
app.use("/api/charges", chargeRoutes);
app.use("/api/faculty-requests", facultyRequestRoutes);
app.use("/api/content", contentRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/communities", communityRoutes);
app.use("/api/academic", academicRoutes);
app.use("/api/results", officialResultRoutes);
app.use("/api/uploads", uploadRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/reports", reportRoutes);
app.use("/api/platform-reports", platformReportRoutes);
app.use("/api/clubs", clubRoutes);
app.use("/api/faculty", facultyRoutes);
app.use("/api/attendance", attendanceRoutes);
app.use("/api/timetable", timetableRoutes);
app.use("/api/assignments", assignmentRoutes);
app.use(notFound);
app.use(errorHandler);

const PORT = process.env.PORT || 5000;
const server = app.listen(PORT, () => console.log(`Server running on ${PORT}`));

const shutdown = async (signal) => {
  console.log(`${signal} received; shutting down gracefully.`);
  server.close(async () => {
    try { await mongoose.connection.close(false); }
    finally { process.exit(0); }
  });
  setTimeout(() => process.exit(1), 10_000).unref();
};
process.once("SIGTERM", () => shutdown("SIGTERM"));
process.once("SIGINT", () => shutdown("SIGINT"));
