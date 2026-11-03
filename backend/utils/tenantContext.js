import { AsyncLocalStorage } from "node:async_hooks";
import mongoose from "mongoose";

const storage = new AsyncLocalStorage();
export const runWithTenant = (context, callback) => storage.run(context, callback);
export const getTenantContext = () => storage.getStore() || null;

/** Mongoose schema plugin: automatically scopes tenant-owned records to the authenticated user's institution. */
export const tenantScopePlugin = (schema, options = {}) => {
  const field = options.field || "institutionId";
  if (!schema.path(field)) {
    schema.add({ [field]: { type: mongoose.Schema.Types.ObjectId, ref: "Institution", index: true, default: null } });
  }

  const applyScope = function () {
    const context = getTenantContext();
    if (!context || context.bypassTenantScope || !context.institutionId) return;
    const current = this.getQuery();
    this.setQuery({ $and: [current, { [field]: context.institutionId }] });
    const update = this.getUpdate?.();
    if (update) {
      const forbidden = [field, "institution"].some((key) => update[key] !== undefined || update.$set?.[key] !== undefined || update.$setOnInsert?.[key] !== undefined);
      if (forbidden) throw new Error("Tenant ownership cannot be changed through an update");
      if (this.getOptions?.().upsert) {
        update.$setOnInsert = { ...(update.$setOnInsert || {}), [field]: context.institutionId };
        this.setUpdate(update);
      }
    }
  };

  schema.pre(["find", "findOne", "countDocuments", "updateOne", "updateMany", "findOneAndUpdate", "findOneAndDelete", "deleteOne", "deleteMany", "replaceOne", "findOneAndReplace", "distinct"], applyScope);
  schema.pre("aggregate", function () {
    const context = getTenantContext();
    if (!context || context.bypassTenantScope || !context.institutionId) return;
    this.pipeline().unshift({ $match: { [field]: context.institutionId } });
  });
  schema.pre("insertMany", function (next, docs) {
    const context = getTenantContext();
    if (context && !context.bypassTenantScope && context.institutionId) {
      for (const doc of docs || []) {
        if (!doc[field]) doc[field] = context.institutionId;
        if (String(doc[field]) !== String(context.institutionId)) return next(new Error("Cross-institute record access is not allowed"));
      }
    }
    next();
  });
  schema.pre("validate", function () {
    const context = getTenantContext();
    if (!context || context.bypassTenantScope || !context.institutionId) return;
    if (!this[field]) this[field] = context.institutionId;
    if (String(this[field]) !== String(context.institutionId)) {
      throw new Error("Cross-institute record access is not allowed");
    }
  });
};

