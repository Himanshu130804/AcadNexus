import AcademicMaster from "../models/AcademicMaster.js";
import Timetable from "../models/Timetable.js";
import Attendance from "../models/Attendance.js";
import Assignment from "../models/Assignment.js";
import User from "../models/User.js";
import Institution from "../models/Institution.js";

const normalize = (value = "") =>
  String(value)
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const aliases = {
  cse: "computer science and engineering",
  "computer science": "computer science and engineering",
  "computer science engineering": "computer science and engineering",
  ece: "electronics and communication engineering",
  ee: "electrical engineering",
  mech: "mechanical engineering",
  it: "information technology",
  aids: "artificial intelligence and data science",
  barch: "b arch",
  "b arch": "b arch",
};

const displayName = (value = "") => {
  const normalized = normalize(value);
  const canonical = aliases[normalized] || normalized;

  if (canonical === "computer science and engineering") return "Computer Science and Engineering";
  if (canonical === "electronics and communication engineering") return "Electronics and Communication Engineering";
  if (canonical === "electrical engineering") return "Electrical Engineering";
  if (canonical === "mechanical engineering") return "Mechanical Engineering";

  return canonical.replace(/\b\w/g, (char) => char.toUpperCase());
};

const cleanProgrammeName = (value = "") => String(value || "").trim().replace(/\s+/g, " ");
const ordinal = (number = 1) => `${number}${number === 1 ? "st" : number === 2 ? "nd" : number === 3 ? "rd" : "th"}`;
const makeYears = (count = 4) => Array.from({ length: Math.max(1, Number(count || 4)) }, (_, index) => ({ _id: `year-${index + 1}`, name: `${ordinal(index + 1)} Year` }));
const makeSemesters = (count = 8) => Array.from({ length: Math.max(1, Number(count || 8)) }, (_, index) => ({ _id: `semester-${index + 1}`, name: `Semester ${index + 1}` }));

const programmeDefaults = (programme = "") => {
  const value = normalize(programme);
  if (value.includes("b arch")) return { durationYears: 5, semesterCount: 10, degreeLevel: "Undergraduate" };
  if (["m tech", "mca", "mba", "m com", "ma", "m sc", "msc", "m pharm", "mpharm", "llm", "m ed", "med"].includes(value)) return { durationYears: 2, semesterCount: 4, degreeLevel: "Postgraduate" };
  if (["bca", "bba", "b com", "bcom", "ba", "b sc", "bsc", "b pharm", "bpharm", "llb", "b ed", "bed"].includes(value)) return { durationYears: 3, semesterCount: 6, degreeLevel: "Undergraduate" };
  if (value.includes("b tech") || value === "bse") return { durationYears: 4, semesterCount: 8, degreeLevel: "Undergraduate" };
  if (["diploma", "polytechnic"].includes(value)) return { durationYears: 3, semesterCount: 6, degreeLevel: "Diploma" };
  return { durationYears: 4, semesterCount: 8, degreeLevel: "Undergraduate" };
};

const programmeDisplayName = (payload = {}) => {
  const base = cleanProgrammeName(payload.name || payload.baseProgramme || "");
  const variant = cleanProgrammeName(payload.variant || "");
  const specialization = cleanProgrammeName(payload.specialization || "");
  const withVariant = variant && !normalize(base).includes(normalize(variant)) ? `${base} (${variant})` : base;
  return specialization && !normalize(withVariant).includes(normalize(specialization)) ? `${withVariant} ${specialization}` : withVariant;
};


const clearScopeFields = (payload = {}) => {
  payload.department = payload.department ? displayName(payload.department) : "";
  payload.programme = payload.programme ? cleanProgrammeName(payload.programme) : "";
  payload.year = payload.year || "";
  payload.semester = payload.semester || "";
  payload.basketName = payload.basketName || "";
  return payload;
};

const exactText = (value) => new RegExp(`^${String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i");
const sameText = (a = "", b = "") => normalize(a) === normalize(b);

const studentScopeFilter = (user = {}) => {
  const filter = { type: "subject", isActive: true };
  ["department", "programme", "year", "semester"].forEach((key) => {
    if (user[key]) filter[key] = exactText(user[key]);
  });
  return filter;
};

const subjectGroupKey = (subject = {}) => {
  const category = subject.category || subject.subjectType || "Core";
  if (/elective/i.test(category)) return subject.basketName || "Elective Basket";
  if (/specialization/i.test(category)) return subject.basketName || "Specialization Basket";
  if (/lab/i.test(category)) return "Lab Subjects";
  return "Core Subjects";
};

const isSubjectSelectedForStudent = (student = {}, subject = {}) => {
  const category = subject.category || subject.subjectType || "Core";
  if (/core|lab/i.test(category)) return true;

  const selectedSubjects = student.selectedSubjects || [];
  if (selectedSubjects.some((item) => String(item.subjectId) === String(subject._id))) return true;

  // Backward-compatible fallback for older test data. New elective/specialization
  // selection uses selectedSubjects so multiple baskets can be locked independently.
  const selected = [student.electiveGroup, student.specialization].filter(Boolean);
  if (!selected.length) return false;
  return selected.some((item) => sameText(item, subject.name));
};

const selectedSubjectForBasket = (student = {}, subject = {}) => {
  const basket = subject.basketName || subjectGroupKey(subject);
  return (student.selectedSubjects || []).find((item) => sameText(item.basketName, basket) && sameText(item.category, subject.category || subject.subjectType || "Core"));
};


export const getRegistrationOptions = async (req, res, next) => {
  try {
    const dedupeBy = (items, getKey) => {
      const map = new Map();
      items.forEach((item) => {
        const key = getKey(item);
        if (key && !map.has(key)) map.set(key, item);
      });
      return [...map.values()];
    };

    const institutionId = String(req.query?.institutionId || "").trim();
    const hasInstitution = Boolean(institutionId);
    if (hasInstitution && !/^[a-f0-9]{24}$/i.test(institutionId)) {
      return res.status(400).json({ message: "Invalid institution." });
    }

    // This endpoint is public because it powers registration, but it must never
    // aggregate academic masters from every tenant. Registration options are
    // scoped to the institution selected by the student (or the institution
    // resolved from a verified registration code on the client).
    if (hasInstitution) {
      const institution = await Institution.findOne({ _id: institutionId, status: "active", deletedAt: null }).select("_id");
      if (!institution) return res.status(400).json({ message: "Selected institution is unavailable." });
    }

    const fallbackDepartments = [
      "Computer Science and Engineering", "Information Technology", "Electronics and Communication Engineering",
      "Electrical Engineering", "Mechanical Engineering", "Civil Engineering", "Computer Applications",
      "Management Studies", "Commerce", "Arts and Humanities", "Basic Sciences", "Architecture"
    ];

    const masterScope = hasInstitution ? { institutionId } : null;
    const departmentDocs = await AcademicMaster.find({ ...(masterScope || {}), type: "department", isActive: true })
      .sort({ name: 1 }).select("name code");
    const departments = dedupeBy(
      (departmentDocs.length ? departmentDocs : fallbackDepartments.map((name) => ({ name }))).map((item) => ({
        _id: item._id || item.name,
        code: item.code || "",
        name: displayName(item.name),
      })),
      (item) => normalize(item.name)
    );

    const { department, programme } = req.query;
    const programmeFilter = { ...(masterScope || {}), type: "programme", isActive: true, department: { $ne: "" } };
    if (department) programmeFilter.department = exactText(displayName(department));
    const programmeDocs = await AcademicMaster.find(programmeFilter)
      .sort({ name: 1 }).select("name department code durationYears semesterCount variant specialization degreeLevel");
    const programmes = dedupeBy(
      programmeDocs.map((item) => {
        const fallback = programmeDefaults(item.name);
        return {
          _id: item._id,
          name: item.name,
          code: item.code || "",
          department: item.department ? displayName(item.department) : "",
          durationYears: Number(item.durationYears || fallback.durationYears),
          semesterCount: Number(item.semesterCount || fallback.semesterCount),
          variant: item.variant || "",
          specialization: item.specialization || "",
          degreeLevel: item.degreeLevel || fallback.degreeLevel,
        };
      }),
      (item) => `${normalize(item.department)}:${normalize(item.name)}`
    );

    const selectedProgramme = programme
      ? programmes.find((item) => normalize(item.name) === normalize(programme) && (!department || normalize(item.department) === normalize(displayName(department))))
      : null;

    const years = selectedProgramme ? makeYears(selectedProgramme.durationYears) : makeYears(5);
    const semesters = selectedProgramme ? makeSemesters(selectedProgramme.semesterCount) : makeSemesters(10);
    const sections = ["A", "B", "C"].map((name) => ({ _id: `section-${name}`, name }));

    res.json({ departments, programmes, years, semesters, sections });
  } catch (error) {
    next(error);
  }
};

export const getAcademicOptions = async (req, res) => {
  const { type, department, programme, year, semester, includeInactive } = req.query;
  const filter = {};
  if (includeInactive !== "true") filter.isActive = true;

  if (type) filter.type = type;
  if (department) filter.department = exactText(displayName(department));
  if (programme) filter.programme = programme;
  if (year) filter.year = year;
  if (semester) filter.semester = semester;

  const options = await AcademicMaster.find(filter).sort({ type: 1, name: 1 });
  res.json(options);
};

export const getMyProgramme = async (req, res) => {
  const user = req.user;
  const subjects = await AcademicMaster.find(studentScopeFilter(user)).sort({ category: 1, basketName: 1, name: 1 });
  const credits = subjects.reduce(
    (acc, subject) => {
      const value = Number(subject.credits || 0);
      acc.total += value;
      if (isSubjectSelectedForStudent(user, subject)) acc.selected += value;
      return acc;
    },
    { total: 0, selected: 0 }
  );

  res.json({
    student: {
      name: user.name,
      rollNumber: user.rollNumber,
      department: user.department,
      programme: user.programme,
      year: user.year,
      semester: user.semester,
      section: user.section,
      groupName: user.groupName,
      labBatch: user.labBatch,
      electiveGroup: user.electiveGroup,
      specialization: user.specialization,
      selectedSubjects: user.selectedSubjects || [],
    },
    credits,
    semesterSubjects: subjects,
  });
};

export const getMyCourses = async (req, res) => {
  const user = req.user;
  const subjects = await AcademicMaster.find(studentScopeFilter(user)).sort({ category: 1, basketName: 1, name: 1 });
  const attendance = await Attendance.find({ "records.student": user._id });
  const assignments = await Assignment.find({
    department: exactText(user.department),
    programme: exactText(user.programme),
    year: exactText(user.year),
    semester: exactText(user.semester),
  }).populate("createdBy", "name email department officeHours");
  const timetable = await Timetable.find({
    department: exactText(user.department),
    programme: exactText(user.programme),
    year: exactText(user.year),
    semester: exactText(user.semester),
    section: exactText(user.section),
  }).populate("faculty", "name email department officeHours");

  const teachersWithCharges = await User.find({
    role: { $in: ["teacher", "teacher_admin", "hod"] },
    charges: { $elemMatch: { isActive: { $ne: false }, department: exactText(user.department), programme: exactText(user.programme), year: exactText(user.year), semester: exactText(user.semester), section: { $in: [user.section, "All"] } } }
  }).select("name email department officeHours charges");

  const courseCards = subjects.map((subject) => {
    const subjectAttendance = attendance.filter((entry) => sameText(entry.subject, subject.name));
    const total = subjectAttendance.length;
    const present = subjectAttendance.filter((entry) => entry.records.find((item) => String(item.student) === String(user._id))?.status === "present").length;
    const subjectAssignments = assignments.filter((assignment) => sameText(assignment.subject, subject.name));
    const subjectTimetable = timetable.filter((entry) => sameText(entry.subject, subject.name));
    const firstClass = subjectTimetable[0];
    const chargeTeacher = teachersWithCharges.find((teacher) => (teacher.charges || []).some((charge) => {
      const sectionOk = sameText(charge.section || "All", user.section) || sameText(charge.section || "All", "All");
      const groupOk = !charge.groupName || sameText(charge.groupName, "All") || [user.groupName, user.labBatch, user.electiveGroup, user.specialization].filter(Boolean).some((value) => sameText(value, charge.groupName));
      const subjectOk = (charge.subjectId && String(charge.subjectId) === String(subject._id)) || sameText(charge.subject, subject.name);
      return charge.isActive !== false && sectionOk && groupOk && subjectOk;
    }));
    const faculty = firstClass?.faculty || chargeTeacher || subjectAssignments[0]?.createdBy || null;
    const selected = isSubjectSelectedForStudent(user, subject);
    const selectedInBasket = selectedSubjectForBasket(user, subject);
    const selectable = /elective|specialization/i.test(subject.category || subject.subjectType || "");

    return {
      _id: subject._id,
      code: subject.code,
      name: subject.name,
      category: subject.category || "Core",
      basketName: subject.basketName || subjectGroupKey(subject),
      credits: subject.credits || 0,
      teacher: subject.teacher || faculty?.name || firstClass?.facultyName || "Faculty not assigned",
      selected,
      selectable,
      locked: Boolean(selectable && selectedInBasket),
      lockedBySubject: selectedInBasket?.subjectName || "",
      canSelect: Boolean(selectable && !selectedInBasket && !selected),
      attendance: { total, present, percentage: total ? Math.round((present / total) * 100) : 0 },
      assignments: { total: subjectAssignments.length, pending: subjectAssignments.filter((item) => !item.submissions?.some((submission) => String(submission.student) === String(user._id))).length },
      timetable: subjectTimetable,
      nextClass: firstClass ? `${firstClass.day} ${firstClass.startTime}` : "Not scheduled",
    };
  });

  const groups = courseCards.reduce((acc, course) => {
    const key = course.basketName || subjectGroupKey(course);
    if (!acc[key]) acc[key] = [];
    acc[key].push(course);
    return acc;
  }, {});

  res.json({ courses: courseCards, groups });
};

export const selectMySubject = async (req, res) => {
  const user = req.user;
  if (!user || !["student", "student_admin"].includes(user.role)) {
    return res.status(403).json({ message: "Only students can select elective/specialization subjects." });
  }

  const subject = await AcademicMaster.findOne({ _id: req.params.id, type: "subject", isActive: { $ne: false } });
  if (!subject) return res.status(404).json({ message: "Subject not found or inactive." });

  const scopeOk = sameText(subject.department, user.department) && sameText(subject.programme, user.programme) && sameText(subject.year, user.year) && sameText(subject.semester, user.semester);
  if (!scopeOk) return res.status(403).json({ message: "This subject does not belong to your current academic scope." });

  const category = subject.category || subject.subjectType || "Core";
  if (!/elective|specialization/i.test(category)) {
    return res.status(400).json({ message: "Core and lab subjects are assigned automatically. Only electives/specializations need selection." });
  }

  const basketName = subject.basketName || subjectGroupKey(subject);
  const existing = (user.selectedSubjects || []).find((item) => sameText(item.basketName, basketName) && sameText(item.category, category));
  if (existing && String(existing.subjectId) !== String(subject._id)) {
    return res.status(409).json({ message: `${existing.subjectName || "A subject"} is already selected and locked for ${basketName}. Contact HOD/EDP/Super Admin to change it.` });
  }
  if (!existing) {
    user.selectedSubjects = [...(user.selectedSubjects || []), { subjectId: subject._id, subjectName: subject.name, basketName, category, locked: true, selectedBy: user._id }];
    if (/elective/i.test(category)) user.electiveGroup = subject.name;
    if (/specialization/i.test(category)) user.specialization = subject.name;
    await user.save();
  }

  res.json({ message: "Subject selected and locked.", selectedSubjects: user.selectedSubjects });
};

export const createAcademicOption = async (req, res) => {
  const { type, name } = req.body;
  if (!type || !name) return res.status(400).json({ message: "Type and name are required" });

  const payload = clearScopeFields({ ...req.body });
  const role = req.user?.role;

  if (role === "hod") {
  if (!req.user.department) {
    return res.status(403).json({
      message: "HOD department is not assigned",
    });
  }

  payload.department = displayName(req.user.department);

  if (!["programme", "subject", "section"].includes(type)) {
    return res.status(403).json({
      message:
        "HOD can manage only programmes, subjects and sections of their own department",
    });
  }
}

  if (type === "department") {
    if (!["super_admin", "institute_admin", "vice_chancellor"].includes(role)) return res.status(403).json({ message: "Only Super Admin can create departments" });
    payload.name = displayName(name);
    payload.department = "";
    payload.programme = "";
    payload.year = "";
    payload.semester = "";
    payload.basketName = "";
  }

  if (type === "programme") {
  if (!["super_admin", "institute_admin", "vice_chancellor", "edp", "hod"].includes(role)) {
    return res.status(403).json({
      message:
        "Only Super Admin, EDP or HOD can map programmes",
    });
  }

  // HOD is always restricted to their assigned department.
  if (role === "hod") {
    if (!req.user?.department) {
      return res.status(403).json({
        message: "HOD department is not assigned",
      });
    }

    payload.department = displayName(
      req.user.department
    );
  }

  if (!payload.department) {
    return res.status(400).json({
      message:
        "Department is required for a programme mapping",
    });
  }

  const defaultMeta = programmeDefaults(name);

  payload.baseProgramme = cleanProgrammeName(
    payload.baseProgramme || name
  );

  payload.name = programmeDisplayName(payload);

  payload.durationYears = Math.max(
    1,
    Number(
      payload.durationYears ||
      defaultMeta.durationYears
    )
  );

  payload.semesterCount = Math.max(
    1,
    Number(
      payload.semesterCount ||
      payload.durationYears * 2 ||
      defaultMeta.semesterCount
    )
  );

  payload.degreeLevel =
    payload.degreeLevel ||
    defaultMeta.degreeLevel;

  payload.programme = "";
  payload.year = "";
  payload.semester = "";
  payload.basketName = "";
}

  if (type === "subject") {
    if (!payload.department || !payload.programme || !payload.year || !payload.semester) {
      return res.status(400).json({ message: "Department, programme, year and semester are required for subject creation" });
    }
    payload.name = String(name).trim().replace(/\s+/g, " ");
    payload.category = payload.category || "Core";
    payload.basketName = payload.basketName || (payload.category === "Elective" ? "Elective Basket 1" : payload.category === "Specialization" ? "Specialization Basket" : payload.category === "Lab" ? "Lab Subjects" : "Core Subjects");
    payload.teacher = ""; // Teacher is assigned later through Teacher Charges, not in Subject Master.

    const mappingExists = await AcademicMaster.exists({
      type: "programme",
      isActive: true,
      department: exactText(payload.department),
      normalizedName: normalize(payload.programme),
    });
    if (!mappingExists) {
      return res.status(400).json({ message: `${payload.programme} is not mapped under ${payload.department}. Create the programme mapping in Academic Master first.` });
    }

    if (payload.code) {
      const duplicateCode = await AcademicMaster.findOne({
        type: "subject",
        code: exactText(payload.code),
        department: exactText(payload.department),
        programme: exactText(payload.programme),
        semester: exactText(payload.semester),
        _id: { $ne: payload._id || null },
      });
      if (duplicateCode) return res.status(409).json({ message: "Subject code already exists for this programme and semester" });
    }
  }

  if (["year", "semester"].includes(type) && !["super_admin", "institute_admin", "vice_chancellor"].includes(role)) {
    return res.status(403).json({ message: "Only Super Admin can manage global year/semester options" });
  }

  const normalizedName = normalize(payload.name || name);
  const query = {
    type,
    normalizedName,
    department: payload.department || "",
    programme: payload.programme || "",
    year: payload.year || "",
    semester: payload.semester || "",
    basketName: payload.basketName || "",
  };

  let option = await AcademicMaster.findOne(query);
  if (!option) {
    option = await AcademicMaster.create({ ...payload, type, normalizedName, name: payload.name || name });
  } else {
    Object.assign(option, payload, { type, normalizedName, name: payload.name || name, isActive: true });
    await option.save();
  }

  res.status(201).json(option);
};


export const updateAcademicOption = async (req, res) => {
  const option = await AcademicMaster.findById(req.params.id);
  if (!option) return res.status(404).json({ message: "Academic item not found" });

  const role = req.user?.role;
  const body = clearScopeFields({ ...req.body });
  const type = body.type || option.type;

  if (option.type === "department" && !["super_admin", "institute_admin", "vice_chancellor"].includes(role)) {
    return res.status(403).json({ message: "Only Super Admin can edit departments" });
  }
  if (option.type === "programme") {
  if (!["super_admin", "institute_admin", "vice_chancellor", "edp", "hod"].includes(role)) {
    return res.status(403).json({
      message:
        "Only Super Admin, EDP or HOD can edit programmes",
    });
  }

  if (
    role === "hod" &&
    normalize(req.user?.department) !==
      normalize(option.department)
  ) {
    return res.status(403).json({
      message:
        "HOD can edit programmes only for their own department",
    });
  }
}
  if (option.type === "subject") {
    if (role === "hod" && normalize(req.user.department) !== normalize(option.department)) {
      return res.status(403).json({ message: "HOD can edit subjects only for their own department" });
    }
    if (!["super_admin", "institute_admin", "vice_chancellor", "edp", "hod", "teacher_admin"].includes(role)) {
      return res.status(403).json({ message: "You do not have permission to edit subjects" });
    }
  }

  const payload = { ...body, type: option.type };

  if (option.type === "department") {
    payload.name = displayName(payload.name || option.name);
    payload.department = "";
    payload.programme = "";
    payload.year = "";
    payload.semester = "";
    payload.normalizedName = normalize(payload.name);
  }

 if (option.type === "programme") {
  // HOD cannot move a programme to another department.
  if (role === "hod") {
    if (!req.user?.department) {
      return res.status(403).json({
        message: "HOD department is not assigned",
      });
    }

    payload.department = displayName(
      req.user.department
    );
  }

  if (!payload.department && !option.department) {
    return res.status(400).json({
      message:
        "Department is required for programme mapping",
    });
  }
    const defaults = programmeDefaults(payload.name || option.name);
    payload.department = displayName(payload.department || option.department);
    payload.baseProgramme = cleanProgrammeName(payload.baseProgramme || payload.name || option.baseProgramme || option.name);
    payload.name = programmeDisplayName({ ...option.toObject(), ...payload });
    payload.durationYears = Math.max(1, Number(payload.durationYears || option.durationYears || defaults.durationYears));
    payload.semesterCount = Math.max(1, Number(payload.semesterCount || option.semesterCount || payload.durationYears * 2 || defaults.semesterCount));
    payload.degreeLevel = payload.degreeLevel || option.degreeLevel || defaults.degreeLevel;
    payload.programme = "";
    payload.year = "";
    payload.semester = "";
    payload.normalizedName = normalize(payload.name);
  }

  if (option.type === "subject") {
    // HODs can only correct subjects in their own department. Super Admin and EDP can move
    // a subject to another valid department/programme mapping when an entry was created wrong.
    if (role === "hod") payload.department = option.department;

    payload.name = String(payload.name || option.name).trim().replace(/\s+/g, " ");
    payload.code = String(payload.code || "").trim().replace(/\s+/g, " ");
    payload.department = displayName(payload.department || option.department);
    payload.programme = cleanProgrammeName(payload.programme || option.programme);
    payload.year = payload.year || option.year;
    payload.semester = payload.semester || option.semester;
    payload.category = payload.category || option.category || "Core";
    payload.basketName = payload.basketName || option.basketName || (payload.category === "Elective" ? "Elective Basket 1" : payload.category === "Specialization" ? "Specialization Basket" : payload.category === "Lab" ? "Lab Subjects" : "Core Subjects");
    payload.basketType = payload.basketType || option.basketType || "";
    payload.selectionLimit = Number(payload.selectionLimit ?? option.selectionLimit ?? 0);
    payload.credits = Number(payload.credits ?? option.credits ?? 0);
    payload.teacher = option.teacher || "";
    payload.normalizedName = normalize(payload.name);

    if (!payload.department || !payload.programme || !payload.year || !payload.semester) {
      return res.status(400).json({ message: "Department, programme, year and semester are required for subject update" });
    }

    const mappingExists = await AcademicMaster.exists({
      type: "programme",
      isActive: true,
      department: exactText(payload.department),
      normalizedName: normalize(payload.programme),
    });
    if (!mappingExists) {
      return res.status(400).json({ message: `${payload.programme} is not mapped under ${payload.department}. Create the programme mapping in Academic Master first.` });
    }
  }

  const duplicateQuery = {
    _id: { $ne: option._id },
    type: option.type,
    isActive: true,
    normalizedName: payload.normalizedName || normalize(payload.name || option.name),
    department: payload.department || "",
    programme: payload.programme || "",
    year: payload.year || "",
    semester: payload.semester || "",
    basketName: payload.basketName || "",
  };
  const duplicate = await AcademicMaster.findOne(duplicateQuery);
  if (duplicate) return res.status(409).json({ message: "Another active academic item already uses these details" });

  if (option.type === "subject" && payload.code) {
    const duplicateCode = await AcademicMaster.findOne({
      _id: { $ne: option._id },
      isActive: true,
      type: "subject",
      code: exactText(payload.code),
      department: exactText(payload.department),
      programme: exactText(payload.programme),
      semester: exactText(payload.semester),
    });
    if (duplicateCode) return res.status(409).json({ message: "Subject code already exists for this programme and semester" });
  }

  Object.assign(option, payload);
  await option.save();
  res.json(option);
};

export const deactivateAcademicOption = async (req, res) => {
  const option = await AcademicMaster.findById(req.params.id);
  if (!option) return res.status(404).json({ message: "Academic item not found" });

  const role = req.user?.role;
  if (option.type === "department" && !["super_admin", "institute_admin", "vice_chancellor"].includes(role)) return res.status(403).json({ message: "Only Super Admin can deactivate departments" });
  if (option.type === "programme") {
  if (!["super_admin", "institute_admin", "vice_chancellor", "edp", "hod"].includes(role)) {
    return res.status(403).json({
      message:
        "Only Super Admin, EDP or HOD can manage programme status",
    });
  }

  if (
    role === "hod" &&
    normalize(req.user?.department) !==
      normalize(option.department)
  ) {
    return res.status(403).json({
      message:
        "HOD can manage programmes only for their own department",
    });
  }
}
  if (option.type === "subject" && !["super_admin", "institute_admin", "vice_chancellor", "edp", "hod", "teacher_admin"].includes(role)) return res.status(403).json({ message: "You do not have permission" });

 if (
  req.body?.isActive !== undefined &&
  typeof req.body.isActive !== "boolean"
) {
  return res.status(400).json({
    message: "isActive must be a boolean",
  });
}

option.isActive =
  req.body?.isActive !== undefined
    ? req.body.isActive
    : false;
  await option.save();
  res.json({ message: option.isActive ? "Academic item activated" : "Academic item deactivated", item: option });
};

export const cleanupAcademicDuplicates = async (req, res) => {
  if (!["super_admin", "institute_admin", "vice_chancellor"].includes(req.user?.role)) return res.status(403).json({ message: "Only Super Admin can clean academic data" });

  const activeItems = await AcademicMaster.find({ isActive: { $ne: false } }).sort({ createdAt: 1 });
  const seen = new Map();
  let disabled = 0;

  for (const item of activeItems) {
    const key = [item.type, normalize(item.name), normalize(item.department), normalize(item.programme), normalize(item.year), normalize(item.semester), normalize(item.basketName)].join("|");
    if (seen.has(key)) {
      item.isActive = false;
      await item.save();
      disabled += 1;
    } else {
      seen.set(key, item._id);
    }
  }

  await AcademicMaster.updateMany({ type: "programme", department: { $in: ["", null] } }, { $set: { isActive: false } });
  res.json({ message: `Academic data cleaned. ${disabled} duplicate active item(s) were deactivated.` });
};

export const seedAcademicOptions = async (req, res) => {
  if (!["super_admin", "institute_admin", "vice_chancellor"].includes(req.user?.role)) {
    return res.status(403).json({
      message:
        "Only Super Admin can seed academic data",
    });
  }

  const seed = [
    { type: "department", name: "Computer Science and Engineering" },
    { type: "department", name: "Information Technology" },
    { type: "department", name: "Artificial Intelligence and Data Science" },
    { type: "department", name: "Electronics and Communication Engineering" },
    { type: "department", name: "Electrical Engineering" },
    { type: "department", name: "Mechanical Engineering" },
    { type: "department", name: "Civil Engineering" },
    { type: "department", name: "Computer Applications" },
    { type: "department", name: "Management Studies" },
    { type: "department", name: "Commerce" },
    { type: "department", name: "Arts and Humanities" },
    { type: "department", name: "Basic Sciences" },
    { type: "department", name: "Pharmacy" },
    { type: "department", name: "Law" },
    { type: "department", name: "Education" },
    { type: "department", name: "Architecture" },

    { type: "programme", name: "B.Tech" }, { type: "programme", name: "M.Tech" }, { type: "programme", name: "BCA" }, { type: "programme", name: "MCA" },
    { type: "programme", name: "BBA" }, { type: "programme", name: "MBA" }, { type: "programme", name: "B.Com" }, { type: "programme", name: "M.Com" },
    { type: "programme", name: "BA" }, { type: "programme", name: "MA" }, { type: "programme", name: "B.Sc" }, { type: "programme", name: "M.Sc" },
    { type: "programme", name: "B.Pharm" }, { type: "programme", name: "M.Pharm" }, { type: "programme", name: "LLB" }, { type: "programme", name: "LLM" },
    { type: "programme", name: "B.Ed" }, { type: "programme", name: "M.Ed" }, { type: "programme", name: "Diploma" }, { type: "programme", name: "B.Arch", durationYears: 5, semesterCount: 10 }, { type: "programme", name: "M.Arch", durationYears: 2, semesterCount: 4 },

    { type: "programme", name: "B.Tech", department: "Computer Science and Engineering" }, { type: "programme", name: "M.Tech", department: "Computer Science and Engineering" },
    { type: "programme", name: "B.Tech", department: "Information Technology" }, { type: "programme", name: "M.Tech", department: "Information Technology" },
    { type: "programme", name: "B.Tech", department: "Artificial Intelligence and Data Science" }, { type: "programme", name: "M.Tech", department: "Artificial Intelligence and Data Science" },
    { type: "programme", name: "B.Tech", department: "Electronics and Communication Engineering" }, { type: "programme", name: "M.Tech", department: "Electronics and Communication Engineering" },
    { type: "programme", name: "B.Tech", department: "Electrical Engineering" }, { type: "programme", name: "M.Tech", department: "Electrical Engineering" },
    { type: "programme", name: "B.Tech", department: "Mechanical Engineering" }, { type: "programme", name: "M.Tech", department: "Mechanical Engineering" },
    { type: "programme", name: "B.Tech", department: "Civil Engineering" }, { type: "programme", name: "M.Tech", department: "Civil Engineering" },
    { type: "programme", name: "BCA", department: "Computer Applications" }, { type: "programme", name: "MCA", department: "Computer Applications" },
    { type: "programme", name: "BBA", department: "Management Studies" }, { type: "programme", name: "MBA", department: "Management Studies" },
    { type: "programme", name: "B.Com", department: "Commerce" }, { type: "programme", name: "M.Com", department: "Commerce" },
    { type: "programme", name: "BA", department: "Arts and Humanities" }, { type: "programme", name: "MA", department: "Arts and Humanities" },
    { type: "programme", name: "B.Sc", department: "Basic Sciences" }, { type: "programme", name: "M.Sc", department: "Basic Sciences" },
    { type: "programme", name: "B.Pharm", department: "Pharmacy" }, { type: "programme", name: "M.Pharm", department: "Pharmacy" },
    { type: "programme", name: "LLB", department: "Law" }, { type: "programme", name: "LLM", department: "Law" },
    { type: "programme", name: "B.Ed", department: "Education" }, { type: "programme", name: "M.Ed", department: "Education" },
    { type: "programme", name: "B.Arch", department: "Architecture", durationYears: 5, semesterCount: 10, degreeLevel: "Undergraduate" }, { type: "programme", name: "M.Arch", department: "Architecture", durationYears: 2, semesterCount: 4, degreeLevel: "Postgraduate" },
    { type: "programme", name: "B.Sc (Hons.) Mathematics", baseProgramme: "B.Sc", variant: "Hons.", specialization: "Mathematics", department: "Basic Sciences", durationYears: 3, semesterCount: 6, degreeLevel: "Undergraduate" },

    { type: "year", name: "1st Year" }, { type: "year", name: "2nd Year" }, { type: "year", name: "3rd Year" }, { type: "year", name: "4th Year" },
    { type: "semester", name: "Semester 1" }, { type: "semester", name: "Semester 2" }, { type: "semester", name: "Semester 3" }, { type: "semester", name: "Semester 4" },
    { type: "semester", name: "Semester 5" }, { type: "semester", name: "Semester 6" }, { type: "semester", name: "Semester 7" }, { type: "semester", name: "Semester 8" },
    { type: "semester", name: "Semester 9" }, { type: "semester", name: "Semester 10" },
    { type: "section", name: "A" }, { type: "section", name: "B" }, { type: "section", name: "C" },

    { type: "subject", code: "CSE601", name: "Compiler Design", department: "Computer Science and Engineering", programme: "B.Tech", year: "3rd Year", semester: "Semester 6", credits: 4, category: "Core", basketName: "Core Subjects", teacher: "Assigned Faculty" },
    { type: "subject", code: "CSE602", name: "Computer Networks", department: "Computer Science and Engineering", programme: "B.Tech", year: "3rd Year", semester: "Semester 6", credits: 4, category: "Core", basketName: "Core Subjects", teacher: "Assigned Faculty" },
    { type: "subject", code: "CSE603", name: "Software Engineering", department: "Computer Science and Engineering", programme: "B.Tech", year: "3rd Year", semester: "Semester 6", credits: 3, category: "Core", basketName: "Core Subjects", teacher: "Assigned Faculty" },
    { type: "subject", code: "CSE-E1A", name: "Cloud Computing", department: "Computer Science and Engineering", programme: "B.Tech", year: "3rd Year", semester: "Semester 6", credits: 3, category: "Elective", basketName: "Elective Basket 1", teacher: "Assigned Faculty" },
    { type: "subject", code: "CSE-E1B", name: "Cyber Security", department: "Computer Science and Engineering", programme: "B.Tech", year: "3rd Year", semester: "Semester 6", credits: 3, category: "Elective", basketName: "Elective Basket 1", teacher: "Assigned Faculty" },
    { type: "subject", code: "CSE-E1C", name: "Data Mining", department: "Computer Science and Engineering", programme: "B.Tech", year: "3rd Year", semester: "Semester 6", credits: 3, category: "Elective", basketName: "Elective Basket 1", teacher: "Assigned Faculty" },
    { type: "subject", code: "CSE-E1D", name: "IoT", department: "Computer Science and Engineering", programme: "B.Tech", year: "3rd Year", semester: "Semester 6", credits: 3, category: "Elective", basketName: "Elective Basket 1", teacher: "Assigned Faculty" },
    { type: "subject", code: "CSE-E2A", name: "Blockchain", department: "Computer Science and Engineering", programme: "B.Tech", year: "3rd Year", semester: "Semester 6", credits: 3, category: "Elective", basketName: "Elective Basket 2", teacher: "Assigned Faculty" },
    { type: "subject", code: "CSE-E2B", name: "DevOps", department: "Computer Science and Engineering", programme: "B.Tech", year: "3rd Year", semester: "Semester 6", credits: 3, category: "Elective", basketName: "Elective Basket 2", teacher: "Assigned Faculty" },
    { type: "subject", code: "CSE-S1", name: "Deep Learning", department: "Computer Science and Engineering", programme: "B.Tech", year: "3rd Year", semester: "Semester 6", credits: 3, category: "Specialization", basketName: "AI & ML Specialization", teacher: "Assigned Faculty" },
    { type: "subject", code: "CSE-L1", name: "Compiler Lab", department: "Computer Science and Engineering", programme: "B.Tech", year: "3rd Year", semester: "Semester 6", credits: 1, category: "Lab", basketName: "Lab Subjects", teacher: "Assigned Faculty" },
    { type: "subject", code: "CSE-L2", name: "Network Lab", department: "Computer Science and Engineering", programme: "B.Tech", year: "3rd Year", semester: "Semester 6", credits: 1, category: "Lab", basketName: "Lab Subjects", teacher: "Assigned Faculty" },

    { type: "subject", code: "MGT101", name: "Principles of Management", department: "Management Studies", programme: "BBA", year: "1st Year", semester: "Semester 1", credits: 4, category: "Core", basketName: "Core Subjects", teacher: "Faculty" },
    { type: "subject", code: "COM101", name: "Financial Accounting", department: "Commerce", programme: "B.Com", year: "1st Year", semester: "Semester 1", credits: 4, category: "Core", basketName: "Core Subjects", teacher: "Faculty" },
  ];

  // Remove old global programme records so every programme is tied to an actual department.
  await AcademicMaster.updateMany({ type: "programme", department: { $in: ["", null] } }, { $set: { isActive: false } });

  for (const item of seed.filter((entry) => !(entry.type === "programme" && !entry.department))) {
    if (item.department) item.department = displayName(item.department);
    if (item.type === "department") item.name = displayName(item.name);
    if (item.type === "programme") {
      const defaults = programmeDefaults(item.name);
      item.baseProgramme = item.baseProgramme || item.name;
      item.name = programmeDisplayName(item);
      item.durationYears = Number(item.durationYears || defaults.durationYears);
      item.semesterCount = Number(item.semesterCount || defaults.semesterCount);
      item.degreeLevel = item.degreeLevel || defaults.degreeLevel;
    }
    const normalizedName = normalize(item.name);
    await AcademicMaster.updateOne(
      {
        type: item.type,
        normalizedName,
        department: item.department || "",
        programme: item.programme || "",
        year: item.year || "",
        semester: item.semester || "",
        basketName: item.basketName || "",
      },
      { $setOnInsert: { ...item, normalizedName } },
      { upsert: true }
    );
  }

  res.json({ message: "Academic options seeded successfully" });
};
