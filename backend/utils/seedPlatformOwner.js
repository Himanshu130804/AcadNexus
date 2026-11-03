import User from "../models/User.js";

/**
 * Ensures the development/configured Platform Owner exists.
 * The database role remains `super_super_admin` internally for backwards
 * compatibility with the existing authorization model; users see only
 * "Platform Owner" in the product.
 */
export const seedPlatformOwner = async () => {
  const email = String(
    process.env.PLATFORM_OWNER_EMAIL || process.env.PLATFORM_OWNER_EMAIL || ""
  ).trim().toLowerCase();
  const password = String(
    process.env.PLATFORM_OWNER_PASSWORD || process.env.PLATFORM_OWNER_PASSWORD || ""
  );
  const name = String(
    process.env.PLATFORM_OWNER_NAME || process.env.PLATFORM_OWNER_NAME || "Platform Owner"
  ).trim();

  if (!email && !password) {
    console.warn("Platform Owner bootstrap skipped: credentials are not configured.");
    return null;
  }

  const minPasswordLength = process.env.NODE_ENV === "production" ? 12 : 8;
  if (!email || password.length < minPasswordLength) {
    throw new Error(
      `Set PLATFORM_OWNER_EMAIL and a PLATFORM_OWNER_PASSWORD of at least ${minPasswordLength} characters${process.env.NODE_ENV === "production" ? " in production" : " for local development"}.`
    );
  }

  const existing = await User.findOne({ email });

  if (existing) {
    if (!["super_super_admin", "platform_super_admin"].includes(existing.role)) {
      throw new Error("PLATFORM_OWNER_EMAIL is already used by a non-platform-owner account. Resolve this account manually.");
    }

    // Migrate the legacy platform-owner role to the current canonical role.
    if (existing.role === "platform_super_admin") existing.role = "super_super_admin";

    // In local development, keep the configured credentials usable after a
    // fresh clone or a password change in .env. Never do this automatically
    // in production.
    if (process.env.NODE_ENV !== "production") {
      const syncPassword = String(process.env.PLATFORM_OWNER_SYNC_PASSWORD || "true").toLowerCase() === "true";
      if (syncPassword) {
        existing.name = name || existing.name;
        existing.password = password;
        existing.institution = undefined;
        existing.tenantStatus = "active";
        existing.isSuspended = false;
        await existing.save();
        console.log(`Platform Owner credentials synchronized for ${email}.`);
      }
    }

    return existing;
  }

  const owner = await User.create({
    name,
    email,
    password,
    role: "super_super_admin",
    institution: undefined,
    tenantStatus: "active",
    isSuspended: false,
  });

  console.log(`Platform Owner account created for ${email}.`);
  return owner;
};
