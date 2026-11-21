
import User from "../models/User.js";

/**
 * Ensures the configured Platform Owner exists.
 *
 * The database role remains `super_super_admin` for compatibility
 * with the existing authorization model.
 *
 * Password synchronization is disabled by default.
 * Set PLATFORM_OWNER_SYNC_PASSWORD=true to explicitly enable it.
 */
export const seedPlatformOwner = async () => {
  const email = String(
    process.env.PLATFORM_OWNER_EMAIL || ""
  )
    .trim()
    .toLowerCase();

  const password = String(
    process.env.PLATFORM_OWNER_PASSWORD || ""
  );

  const name = String(
    process.env.PLATFORM_OWNER_NAME || "Platform Owner"
  ).trim();

  // If neither credential is configured, skip bootstrap.
  if (!email && !password) {
    console.warn(
      "Platform Owner bootstrap skipped: credentials are not configured."
    );
    return null;
  }

  // Require a stronger password in production.
  const minPasswordLength =
    process.env.NODE_ENV === "production" ? 12 : 8;

  if (!email || password.length < minPasswordLength) {
    throw new Error(
      `Set PLATFORM_OWNER_EMAIL and a PLATFORM_OWNER_PASSWORD of at least ${minPasswordLength} characters${
        process.env.NODE_ENV === "production"
          ? " in production"
          : " for local development"
      }.`
    );
  }

  const existing = await User.findOne({ email });

  // Existing account found.
  if (existing) {
    // Never modify an account belonging to another role.
    if (
      !["super_super_admin", "platform_super_admin"].includes(
        existing.role
      )
    ) {
      throw new Error(
        "PLATFORM_OWNER_EMAIL is already used by a non-platform-owner account. Resolve this account manually."
      );
    }

    // Migrate the legacy role to the canonical role.
    if (existing.role === "platform_super_admin") {
      existing.role = "super_super_admin";
    }

    const syncPassword =
      String(
        process.env.PLATFORM_OWNER_SYNC_PASSWORD || "false"
      )
        .trim()
        .toLowerCase() === "true";

    // Only synchronize when explicitly enabled.
    if (syncPassword) {
      existing.password = password;
      existing.passwordChangedAt = new Date();
      existing.tokenVersion =
        (existing.tokenVersion || 0) + 1;

      await existing.save();

      console.log(
        `Platform Owner password synchronized for ${email}.`
      );
    } else {
      // Save only if the legacy role needed migration.
      if (existing.isModified("role")) {
        await existing.save();
      }

      console.log(
        `Existing Platform Owner account found for ${email}.`
      );
    }

    return existing;
  }

  // No existing account: create a new Platform Owner.
  const owner = await User.create({
    name,
    email,
    password,
    role: "super_super_admin",
    tenantStatus: "active",
    isSuspended: false,
  });

  console.log(
    `Platform Owner account created for ${email}.`
  );

  return owner;
};
