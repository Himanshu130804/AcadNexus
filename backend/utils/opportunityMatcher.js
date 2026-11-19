const normalize = values => new Set((Array.isArray(values) ? values : []).map(value => String(value).trim().toLowerCase()).filter(Boolean));
export function matchOpportunity(profile = {}, opportunity = {}) {
  const skills = normalize(profile.skills);
  const interests = normalize([...(profile.interests || []), ...(profile.careerInterests || [])]);
  const requiredSkills = Array.isArray(opportunity.requiredSkills) ? opportunity.requiredSkills : [];
  const interestTags = Array.isArray(opportunity.interestTags) ? opportunity.interestTags : [];
  const matchedSkills = requiredSkills.filter(value => skills.has(String(value).toLowerCase()));
  const matchedInterests = interestTags.filter(value => interests.has(String(value).toLowerCase()));
  const skillScore = requiredSkills.length ? matchedSkills.length / requiredSkills.length * 70 : 0;
  const interestScore = interestTags.length ? matchedInterests.length / interestTags.length * 30 : 0;
  const score = requiredSkills.length || interestTags.length ? Math.round(skillScore + interestScore) : null;
  const reasons = [];
  if (matchedSkills.length) reasons.push(`Skills: ${matchedSkills.join(", ")}`);
  if (matchedInterests.length) reasons.push(`Interests: ${matchedInterests.join(", ")}`);
  if (!reasons.length) reasons.push("No profile match evidence yet; review the opportunity requirements manually.");
  return { matchScore: score, matchReasons: reasons, matchedSkills, missingSkills: requiredSkills.filter(value => !matchedSkills.includes(value)) };
}
