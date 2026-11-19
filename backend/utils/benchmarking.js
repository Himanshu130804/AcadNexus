// Anonymized cross-institution benchmarking with k-anonymity style safeguards.
// Input is already aggregated per institution; output never contains institution identifiers or names.

export const BENCHMARK_MIN_STUDENTS = 10;      // an institution needs this many students with results to be included
export const BENCHMARK_MIN_INSTITUTIONS = 5;   // peers needed before any comparison is released
const round1 = (value) => Math.round(value * 10) / 10;

/**
 * @param {Array<{institutionId:any, students:number, averagePercentage:number}>} rows per-institution aggregates
 * @param {{institutionId?: any, minStudents?: number, minInstitutions?: number}} options
 */
export function buildBenchmark(rows = [], { institutionId = null, minStudents = BENCHMARK_MIN_STUDENTS, minInstitutions = BENCHMARK_MIN_INSTITUTIONS } = {}) {
  const eligible = rows.filter((row) => Number.isFinite(row.averagePercentage) && row.students >= minStudents);
  const own = institutionId ? eligible.find((row) => String(row.institutionId) === String(institutionId)) : null;
  const peers = eligible.filter((row) => !own || row !== own);
  const needed = Math.max(minInstitutions, 2);
  const privacy = { minimumStudentsPerInstitution: minStudents, minimumInstitutions: needed };
  if (institutionId && !own) return { available: false, reason: `Your institution needs at least ${minStudents} students with published results to take part in benchmarking.`, privacy };
  if (peers.length + (own ? 1 : 0) < needed || (own && peers.length < needed - 1)) return { available: false, reason: "Not enough participating institutions to release a comparison without exposing any single institution.", privacy };
  const peerMean = round1(peers.reduce((sum, row) => sum + row.averagePercentage, 0) / peers.length);
  const bands = Array.from({ length: 10 }, (_, index) => ({ from: index * 10, to: index === 9 ? 100 : index * 10 + 9.9, institutions: 0 }));
  for (const row of peers) bands[Math.min(9, Math.floor(row.averagePercentage / 10))].institutions += 1;
  const result = { available: true, participatingInstitutions: peers.length + (own ? 1 : 0), peerInstitutions: peers.length, peerMeanAveragePercentage: peerMean, distribution: bands.filter((band) => band.institutions > 0), privacy };
  if (own) {
    const below = peers.filter((row) => row.averagePercentage < own.averagePercentage).length;
    const rank = below / peers.length;
    result.yourAveragePercentage = round1(own.averagePercentage);
    result.differenceFromPeerMean = round1(own.averagePercentage - peerMean);
    result.position = rank >= 0.75 ? "top quartile" : rank >= 0.5 ? "above median" : rank >= 0.25 ? "below median" : "bottom quartile";
  }
  return result;
}
