import dotenv from "dotenv";
import mongoose from "mongoose";
import connectDB from "./config/db.js";
import { seedDefaultData } from "./utils/seedDefaultData.js";

dotenv.config();
await connectDB();
await seedDefaultData();
await mongoose.connection.close();
