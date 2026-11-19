import dotenv from "dotenv";
import mongoose from "mongoose";
import connectDB from "./config/db.js";
import { seedPlatformOwner } from "./utils/seedPlatformOwner.js";

dotenv.config();
await connectDB();
await seedPlatformOwner();
await mongoose.connection.close();
