import mongoose from "mongoose";
import { tenantScopePlugin } from "../utils/tenantContext.js";
import bcrypt from "bcryptjs";

const teacherChargeSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    type: {
      type: String,
      enum: [
        "cultural",
        "sports",
        "nss",
        "ncc",
        "placement",
        "exam",
        "library",
        "hostel",
        "hod",
        "class_incharge",
        "club",
        "department",
        "general",
        "teaching",
      ],
      required: true,
    },
    department: { type: String, default: "All" },
    programme: { type: String, default: "All" },
    year: { type: String, default: "All" },
    semester: { type: String, default: "All" },
    section: { type: String, default: "All" },
    groupType: { type: String, default: "full_section" },
    groupName: { type: String, default: "All" },
    subjectId: { type: mongoose.Schema.Types.ObjectId, ref: "AcademicMaster" },
    subject: { type: String, default: "" },
    community: { type: String, default: "" },
    permissions: [String],
    assignedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    assignedAt: { type: Date, default: Date.now },
    isActive: { type: Boolean, default: true },
  },
  { _id: true }
);

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    password: { type: String, required: true },
    passwordResetTokenHash: { type: String, default: undefined, select: false },
    passwordResetExpiresAt: { type: Date, default: undefined, select: false },
    tokenVersion: { type: Number, default: 0 },
    passwordChangedAt: { type: Date, default: null },

    role: {
      type: String,
      enum: ["student", "teacher", "hod", "edp", "department_admin", "institute_admin", "vice_chancellor", "staff", "platform_super_admin", "super_super_admin", "super_admin", "student_admin", "teacher_admin"],
      default: "student",
    },

    // Tenant scope: every account belongs to one institution; department is institution-specific.
    institution: { type: mongoose.Schema.Types.ObjectId, ref: "Institution", index: true },
    departmentId: { type: mongoose.Schema.Types.ObjectId, ref: "Department", index: true },
    tenantStatus: { type: String, enum: ["pending", "active", "suspended", "banned"], default: "active", index: true },
    permissions: { type: [String], default: [] },
    rollNumber: { type: String, default: "" },
    employeeId: { type: String, default: "" },

    department: String,
    programme: String,
    year: String,
    semester: String,
    section: String,
    groupType: { type: String, default: "full_section" },
    groupName: { type: String, default: "All" },
    labBatch: { type: String, default: "" },
    electiveGroup: { type: String, default: "" },
    specialization: { type: String, default: "" },
    selectedSubjects: [
      {
        subjectId: { type: mongoose.Schema.Types.ObjectId, ref: "AcademicMaster", required: true },
        subjectName: { type: String, default: "" },
        basketName: { type: String, default: "" },
        category: { type: String, default: "" },
        locked: { type: Boolean, default: true },
        selectedAt: { type: Date, default: Date.now },
        selectedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      },
    ],
    admissionYear: String,

    designation: String,
    phone: String,
    address: String,
    bio: String,
    skills: [String],
    subjects: [String],
    officeHours: String,
    qualification: String,
    experience: String,
    profilePhoto: String,

    charges: [teacherChargeSchema],

    isSuspended: { type: Boolean, default: false },
  },
  { timestamps: true }
);

userSchema.index({ institution: 1, role: 1, departmentId: 1, department: 1, programme: 1, year: 1, semester: 1, section: 1, groupName: 1 });
userSchema.index({ institution: 1, email: 1 }, { unique: true, partialFilterExpression: { institution: { $type: "objectId" }, email: { $type: "string" } } });
userSchema.index({ institution: 1, rollNumber: 1 }, { unique: true, partialFilterExpression: { institution: { $type: "objectId" }, rollNumber: { $type: "string", $gt: "" } } });
userSchema.index({ institution: 1, employeeId: 1 }, { unique: true, partialFilterExpression: { institution: { $type: "objectId" }, employeeId: { $type: "string", $gt: "" } } });

userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();

  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);

  next();
});

userSchema.methods.matchPassword = async function (enteredPassword) {
  return bcrypt.compare(enteredPassword, this.password);
};

userSchema.plugin(tenantScopePlugin, { field: "institution" });

export default mongoose.model("User", userSchema);
