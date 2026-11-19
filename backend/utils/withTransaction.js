import mongoose from "mongoose";

// Thrown by callers inside a unit of work to abort it with a business error.
export class UnitOfWorkAbort extends Error {
  constructor(message, status = 409) { super(message); this.status = status; }
}

const transactionsUnsupported = (error) =>
  error?.code === 20 || /Transaction numbers are only allowed on a replica set|replica set member or mongos|does not support transactions/i.test(String(error?.message || ""));

/**
 * Runs `work(session)` inside a MongoDB transaction when the deployment supports
 * it (replica set / Atlas). On a standalone mongod, where transactions are not
 * available, nothing has been written when the server refuses, so the same work is
 * re-run once with `session === null`; callers must keep their own compensating
 * logic for that case.
 */
export const runInTransaction = async (work) => {
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => { result = await work(session); });
    return { result, transactional: true };
  } catch (error) {
    if (transactionsUnsupported(error)) return { result: await work(null), transactional: false };
    throw error;
  } finally {
    await session.endSession();
  }
};
