import dns from "node:dns";
import mongoose from "mongoose";

const DEFAULT_DNS_SERVERS = [
  "8.8.8.8",
  "1.1.1.1",
  "9.9.9.9",
];

const parseDnsServers = () => {
  const configured = String(process.env.MONGO_DNS_SERVERS || "")
    .split(",")
    .map((server) => server.trim())
    .filter(Boolean);

  return configured.length ? configured : DEFAULT_DNS_SERVERS;
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const configureDns = () => {
  // Node's dns.setServers() affects c-ares lookups such as MongoDB SRV/TXT
  // resolution without changing the operating system's DNS configuration.
  // This avoids failures when a local/VPN DNS proxy advertises 127.0.0.1
  // but is unavailable to Node.
  const servers = parseDnsServers();
  dns.setServers(servers);
  dns.setDefaultResultOrder?.("ipv4first");
  console.log(`MongoDB DNS resolvers: ${servers.join(", ")}`);
  return servers;
};

const connectDB = async () => {
  if (!process.env.MONGO_URI) {
    throw new Error("MONGO_URI is not configured.");
  }

  const maxRetries = Math.max(Number.parseInt(process.env.MONGO_CONNECT_RETRIES || "5", 10), 1);
  const retryDelayMs = Math.max(Number.parseInt(process.env.MONGO_CONNECT_RETRY_DELAY_MS || "3000", 10), 500);

  let lastError;

  for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
    try {
      configureDns();

      const conn = await mongoose.connect(process.env.MONGO_URI, {
        serverSelectionTimeoutMS: Number.parseInt(process.env.MONGO_SERVER_SELECTION_TIMEOUT_MS || "10000", 10),
        connectTimeoutMS: Number.parseInt(process.env.MONGO_CONNECT_TIMEOUT_MS || "10000", 10),
        socketTimeoutMS: Number.parseInt(process.env.MONGO_SOCKET_TIMEOUT_MS || "45000", 10),
        maxPoolSize: Number.parseInt(process.env.MONGO_MAX_POOL_SIZE || "10", 10),
        minPoolSize: Number.parseInt(process.env.MONGO_MIN_POOL_SIZE || "0", 10),
        retryWrites: true,
      });

      console.log(`MongoDB connected: ${conn.connection.host}`);
      return conn;
    } catch (error) {
      lastError = error;
      console.error(`MongoDB connection attempt ${attempt}/${maxRetries} failed: ${error.message}`);

      if (attempt < maxRetries) {
        await sleep(retryDelayMs * attempt);
      }
    }
  }

  throw new Error(`MongoDB connection failed after ${maxRetries} attempts: ${lastError?.message || "unknown error"}`);
};

export default connectDB;
