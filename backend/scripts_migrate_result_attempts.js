import "dotenv/config";
import mongoose from "mongoose";
import OfficialResult from "./models/OfficialResult.js";
import connectDB from "./config/db.js";

const apply = process.argv.includes("--apply");
mongoose.set("autoIndex", false);
try {
  await connectDB();
  const collection = mongoose.connection.collection("officialresults");
  const oldKey = { institutionId: 1, student: 1, courseCode: 1, semester: 1, examSession: 1 };
  const newKey = { institutionId: 1, student: 1, courseCode: 1, semester: 1, examSession: 1, attemptType: 1, attemptNumber: 1 };
  const indexes = await collection.indexes();
  const oldIndex = indexes.find(index => index.unique && JSON.stringify(index.key) === JSON.stringify(oldKey));
  const newIndex = indexes.find(index => index.unique && JSON.stringify(index.key) === JSON.stringify(newKey));
  const duplicates = await collection.aggregate([{ $group: { _id: { institutionId: "$institutionId", student: "$student", courseCode: "$courseCode", semester: "$semester", examSession: "$examSession" }, count: { $sum: 1 } } }, { $match: { count: { $gt: 1 } } }, { $limit: 5 }]).toArray();
  if (duplicates.length) throw new Error(`Existing result collisions found; migration stopped: ${JSON.stringify(duplicates)}`);
  console.log(JSON.stringify({ oldIndex: oldIndex?.name || null, newIndex: newIndex?.name || null, missingAttemptType: await collection.countDocuments({ $or: [{ attemptType: { $exists: false } }, { attemptType: null }] }), missingAttemptNumber: await collection.countDocuments({ $or: [{ attemptNumber: { $exists: false } }, { attemptNumber: null }] }), apply }, null, 2));
  if (!apply) { console.log("Dry run only. Review the report, back up MongoDB, then rerun with --apply."); process.exitCode = 0; }
  else {
    await collection.updateMany({ $or: [{ attemptType: { $exists: false } }, { attemptType: null }] }, { $set: { attemptType: "regular" } });
    await collection.updateMany({ $or: [{ attemptNumber: { $exists: false } }, { attemptNumber: null }] }, { $set: { attemptNumber: 0 } });
    if (!newIndex) await OfficialResult.collection.createIndex(newKey, { unique: true, name: "official_result_attempt_unique" });
    if (oldIndex) await collection.dropIndex(oldIndex.name);
    console.log("Result-attempt migration completed. Verify indexes and application queries.");
  }
} catch (error) { console.error(error.message); process.exitCode = 1; }
finally { await mongoose.disconnect(); }
