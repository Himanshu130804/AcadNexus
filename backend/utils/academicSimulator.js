export function roundValue(value, mode) {
  if (!["nearest_2", "nearest_1", "none"].includes(mode)) throw new Error("An institution-configured rounding rule is required.");
  if (mode === "none") return value;
  const factor = mode === "nearest_1" ? 10 : 100;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

export function calculateSubjectScenario(rule, input = {}) {
  if (!rule || !Array.isArray(rule.components) || rule.components.length === 0) throw new Error("An active configured academic rule is required.");
  if (!Number.isFinite(Number(rule.credits)) || Number(rule.credits) < 0) throw new Error("Configured course credits are required.");
  const weightTotal = rule.components.reduce((sum, component) => sum + Number(component.weight), 0);
  if (Math.abs(weightTotal - 100) > 0.001) throw new Error("Configured component weights must total exactly 100.");
  const provided = input.components || {};
  let percentage = 0;
  let completedWeight = 0;
  const missing = [];
  const details = [];
  for (const component of rule.components) {
    const raw = provided[component.code];
    if (raw === null || raw === undefined || raw === "") {
      missing.push(component);
      details.push({ code: component.code, label: component.label, marks: null, maxMarks: component.maxMarks, weight: component.weight, state: "remaining" });
      continue;
    }
    const marks = Number(raw);
    if (!Number.isFinite(marks) || marks < 0 || marks > component.maxMarks) throw new Error(`Marks for ${component.label} must be between 0 and ${component.maxMarks}.`);
    percentage += (marks / component.maxMarks) * component.weight;
    completedWeight += component.weight;
    details.push({ code: component.code, label: component.label, marks, maxMarks: component.maxMarks, weight: component.weight, state: "entered" });
  }
  const target = input.targetPercentage == null ? null : Number(input.targetPercentage);
  let requiredMarks = null;
  if (target !== null) {
    if (!Number.isFinite(target) || target < 0 || target > 100) throw new Error("Target percentage must be between 0 and 100.");
    if (missing.length === 1 && Number(missing[0].weight) > 0) {
      const remaining = missing[0];
      requiredMarks = Math.max(0, ((target - percentage) / remaining.weight) * remaining.maxMarks);
    }
  }
  const projectedPercentage = missing.length ? null : roundValue(percentage, rule.rounding);
  const gradeBand = projectedPercentage === null ? null : [...(rule.gradeBands || [])].sort((a, b) => b.minPercentage - a.minPercentage).find(band => projectedPercentage >= band.minPercentage) || null;
  return {
    course: rule.name,
    credits: Number(rule.credits),
    rounding: rule.rounding,
    percentage: projectedPercentage,
    currentWeightedContribution: roundValue(percentage, rule.rounding),
    completedWeight,
    remainingWeight: roundValue(100 - completedWeight, rule.rounding),
    grade: gradeBand?.grade || null,
    gradePoint: gradeBand ? Number(gradeBand.gradePoint) : null,
    components: details,
    targetPercentage: target,
    requiredMarks: requiredMarks === null ? null : roundValue(requiredMarks, rule.rounding),
    requiredMarksFeasible: requiredMarks === null ? null : requiredMarks >= 0 && requiredMarks <= missing[0].maxMarks,
  };
}

export function calculateSemesterGpa(subjects) {
  const creditBearing = subjects.filter(subject => Number.isFinite(Number(subject.credits)) && Number(subject.credits) > 0);
  const graded = creditBearing.filter(subject => subject.gradePoint != null && Number.isFinite(Number(subject.gradePoint)));
  const credits = graded.reduce((sum, subject) => sum + Number(subject.credits), 0);
  const incompleteSubjects = creditBearing.length - graded.length;
  if (!credits) return { gpa: null, credits: 0, gradedSubjects: 0, incompleteSubjects, provisional: true };
  const weighted = graded.reduce((sum, subject) => sum + Number(subject.gradePoint) * Number(subject.credits), 0);
  const roundingModes = new Set(graded.map(subject => subject.rounding).filter(Boolean));
  const rawGpa = weighted / credits;
  const gpa = roundingModes.size === 1 ? roundValue(rawGpa, [...roundingModes][0]) : rawGpa;
  return { gpa, credits, gradedSubjects: graded.length, incompleteSubjects, provisional: incompleteSubjects > 0 };
}
