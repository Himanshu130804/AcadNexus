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
  "computer application": "computer applications",
  btech: "b tech",
  "b tech": "b tech",
  mtech: "m tech",
  "m tech": "m tech",
  bba: "bba",
  mba: "mba",
  bca: "bca",
  mca: "mca",
  barch: "b arch",
  "b arch": "b arch",
};

export const normalizeAcademic = (value = "") => {
  const base = normalizeBase(value);
  return aliases[base] || base;
};

const unique = (items = []) => items.filter((name, index, list) => name && list.indexOf(name) === index);

export const uniqueNames = (items = [], type) =>
  unique(items.filter((item) => item.type === type && item.name && item.isActive !== false).map((item) => item.name));

const programmeCatalog = (items = []) =>
  unique(items.filter((item) => item.type === "programme" && item.name && item.isActive !== false).map((item) => item.name));

export const scopedProgrammes = (items = [], department = "") => {
  const deptNorm = normalizeAcademic(department);
  if (!deptNorm) return programmeCatalog(items);

  const mapped = items
    .filter((item) => item.type === "programme" && item.department && item.name && item.isActive !== false)
    .filter((item) => normalizeAcademic(item.department) === deptNorm)
    .map((item) => item.name);

  return unique(mapped);
};

const fallbackDuration = (programme = "") => {
  const value = normalizeAcademic(programme);
  if (value.includes("b arch")) return { years: 5, semesters: 10 };
  if (["m tech", "mca", "mba", "m com", "ma", "msc", "m sc", "m pharm", "mpharm", "llm", "m ed", "med"].includes(value)) return { years: 2, semesters: 4 };
  if (["bca", "bba", "b com", "bcom", "ba", "bsc", "b sc", "b pharm", "bpharm", "llb", "b ed", "bed"].includes(value)) return { years: 3, semesters: 6 };
  if (["b tech", "bse"].includes(value) || value.includes("b tech")) return { years: 4, semesters: 8 };
  if (["diploma", "polytechnic"].includes(value)) return { years: 3, semesters: 6 };
  return { years: 4, semesters: 8 };
};

export const programmeMeta = (items = [], programme = "", department = "") => {
  const pNorm = normalizeAcademic(programme);
  const dNorm = normalizeAcademic(department);
  const doc = items.find((item) =>
    item.type === "programme" &&
    item.name && normalizeAcademic(item.name) === pNorm &&
    (!department || normalizeAcademic(item.department) === dNorm)
  );
  const fb = fallbackDuration(programme);
  return {
    years: Number(doc?.durationYears || 0) || fb.years,
    semesters: Number(doc?.semesterCount || 0) || fb.semesters,
    variant: doc?.variant || "",
    specialization: doc?.specialization || "",
    degreeLevel: doc?.degreeLevel || "",
  };
};

const generatedYears = (count = 4) => Array.from({ length: count }, (_, i) => `${i + 1}${i === 0 ? "st" : i === 1 ? "nd" : i === 2 ? "rd" : "th"} Year`);
const generatedSemesters = (count = 8) => Array.from({ length: count }, (_, i) => `Semester ${i + 1}`);

export const scopedYears = (items = [], programme = "", department = "") => {
  if (!programme) return uniqueNames(items, "year").length ? uniqueNames(items, "year") : generatedYears(4);
  return generatedYears(programmeMeta(items, programme, department).years);
};

export const scopedSemesters = (items = [], programme = "", year = "", department = "") => {
  const maxSemester = programme ? programmeMeta(items, programme, department).semesters : 8;
  const yearNumber = Number(String(year).match(/\d+/)?.[0] || 0);
  const byYear = yearNumber ? [yearNumber * 2 - 1, yearNumber * 2] : null;
  return generatedSemesters(maxSemester).filter((name) => {
    const number = Number(String(name).match(/\d+/)?.[0] || 0);
    if (byYear && !byYear.includes(number)) return false;
    return true;
  });
};

export const scopedSubjects = (items = [], form = {}) =>
  unique(items
    .filter((item) => item.type === "subject" && item.name)
    .filter((item) => !item.department || normalizeAcademic(item.department) === normalizeAcademic(form.department))
    .filter((item) => !item.programme || normalizeAcademic(item.programme) === normalizeAcademic(form.programme))
    .filter((item) => !item.year || normalizeAcademic(item.year) === normalizeAcademic(form.year))
    .filter((item) => !item.semester || normalizeAcademic(item.semester) === normalizeAcademic(form.semester))
    .map((item) => item.name));

export const validateAcademicCombination = ({ department, programme, year, semester }, items = []) => {
  if (department && programme && !scopedProgrammes(items, department).some((item) => normalizeAcademic(item) === normalizeAcademic(programme))) {
    return `${programme} is not mapped under ${department}. Add this exact department-programme mapping in Academic Master first.`;
  }
  if (programme && year && !scopedYears(items, programme, department).includes(year)) {
    return `${year} is not valid for ${programme}.`;
  }
  if (programme && year && semester && !scopedSemesters(items, programme, year, department).includes(semester)) {
    return `${semester} is not valid for ${programme} ${year}.`;
  }
  return "";
};
