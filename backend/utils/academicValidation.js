import AcademicMaster from "../models/AcademicMaster.js";

const normalizeBase = (value = "") =>
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
  it: "information technology",
  ece: "electronics and communication engineering",
  ee: "electrical engineering",
  mech: "mechanical engineering",
  mechanical: "mechanical engineering",
  civil: "civil engineering",
  aids: "artificial intelligence and data science",
  ai: "artificial intelligence and data science",
  btech: "b tech",
  "b tech": "b tech",
  mtech: "m tech",
  "m tech": "m tech",
};

const normalize = (value = "") => aliases[normalizeBase(value)] || normalizeBase(value);

const programmeMeta = async (programme = "", department = "") => {
  const doc = await AcademicMaster.findOne({
    type: "programme",
    name: new RegExp(`^${String(programme).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i"),
    ...(department ? { department: new RegExp(`^${String(department).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") } : {}),
    isActive: true,
  }).select("durationYears semesterCount name");
  const value = normalize(programme);
  const fallbackYears = value.includes("b arch") ? 5 :
    (["m tech", "mca", "mba", "m com", "ma", "msc", "m sc", "mpharm", "m pharm", "llm", "m ed", "med"].includes(value) ? 2 :
    (["bca", "bba", "b com", "bcom", "ba", "bsc", "b sc", "b pharm", "bpharm", "llb", "b ed", "bed"].includes(value) ? 3 :
    (["b tech", "bse"].includes(value) || value.includes("b tech") ? 4 : 4)));
  const years = Number(doc?.durationYears || 0) || fallbackYears;
  const semesters = Number(doc?.semesterCount || 0) || years * 2;
  return { years, semesters };
};

export const validateAcademicScope = async ({ department, programme, year, semester }) => {
  if (department && programme) {
    const programmeRows = await AcademicMaster.find({ type: "programme", department: { $ne: "" }, isActive: true }).select("name department");
    const mappedForDepartment = programmeRows.filter((item) => normalize(item.department) === normalize(department));

    if (!mappedForDepartment.length) {
      return `No programme is mapped under ${department}. Super Admin must add valid programmes in Academic Master first.`;
    }

    const allowed = mappedForDepartment.some((item) => normalize(item.name) === normalize(programme));
    if (!allowed) {
      return `${programme} is not mapped under ${department}. Update Academic Master before using this combination.`;
    }
  }

  if (programme && year) {
    const yearNumber = Number(String(year).match(/\d+/)?.[0] || 0);
    const meta = await programmeMeta(programme, department);
    if (yearNumber && yearNumber > meta.years) {
      return `${year} is not valid for ${programme}.`;
    }
  }

  if (programme && semester) {
    const semesterNumber = Number(String(semester).match(/\d+/)?.[0] || 0);
    const meta = await programmeMeta(programme, department);
    const maxSemester = meta.semesters;
    if (semesterNumber && semesterNumber > maxSemester) {
      return `${semester} is not valid for ${programme}.`;
    }
  }

  return null;
};
