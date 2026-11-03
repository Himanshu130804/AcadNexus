import dotenv from "dotenv";
import mongoose from "mongoose";
dotenv.config();

const apply = process.argv.includes("--apply");
if (!process.env.MONGO_URI) throw new Error("MONGO_URI is required");
await mongoose.connect(process.env.MONGO_URI);
const db = mongoose.connection.db;
const mappings = [
  ["contents", "submittedBy"],
  ["assignments", "createdBy"],
  ["attendances", "markedBy"],
  ["timetables", "faculty"],
  ["reports", "reportedBy"],
  ["communities", "createdBy"],
  ["clubs", "createdBy"],
  ["facultyprofiles", "user"],
  ["facultyrequests", "requestedBy"],
  ["officialresults", "student"],
  ["notifications", "user"],
  ["auditlogs", "admin"],
];
let updated = 0;
let unresolved = 0;
for (const [collectionName, ownerField] of mappings) {
  const collection = db.collection(collectionName);
  const docs = await collection.find({ $or: [{ institutionId: { $exists: false } }, { institutionId: null }] }).toArray();
  let collectionUpdated = 0;
  for (const doc of docs) {
    const ownerId = doc[ownerField];
    if (!ownerId) { unresolved++; continue; }
    const owner = await db.collection("users").findOne({ _id: ownerId }, { projection: { institution: 1 } });
    if (!owner?.institution) { unresolved++; continue; }
    if (apply) await collection.updateOne({ _id: doc._id }, { $set: { institutionId: owner.institution } });
    collectionUpdated++;
  }
  updated += collectionUpdated;
  console.log(`${collectionName}: ${collectionUpdated} ${apply ? "backfilled" : "would be backfilled"}`);
}
if (apply) {
  const hasAttendanceCollection = await db.listCollections({ name: "attendances" }, { nameOnly: true }).hasNext();
  if (hasAttendanceCollection) {
    const attendance = db.collection("attendances");
    const indexes = await attendance.indexes();
    for (const index of indexes) {
      if (index.unique && index.key?.department && !index.key?.institutionId) {
        await attendance.dropIndex(index.name);
        console.log(`Dropped legacy cross-institute unique index: ${index.name}`);
      }
    }
    await attendance.createIndex({ institutionId: 1, department: 1, programme: 1, year: 1, semester: 1, section: 1, groupType: 1, groupName: 1, subject: 1, date: 1 }, { unique: true, name: "institution_attendance_scope_unique" });
  }
}
const academicMasterMissing = await db.collection("academicmasters").countDocuments({ $or: [{ institutionId: { $exists: false } }, { institutionId: null }] });
console.log(`academicmasters: ${academicMasterMissing} records need an explicit institute mapping (not auto-assigned because ownership is ambiguous)`);
console.log(`Total ${apply ? "backfilled" : "eligible"}: ${updated}; unresolved/orphan records: ${unresolved}`);
if (!apply) console.log("DRY RUN ONLY. Back up MongoDB, review counts, then rerun with --apply.");
await mongoose.disconnect();
