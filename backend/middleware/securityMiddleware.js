export const securityHeaders = (req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  if (process.env.NODE_ENV === "production") res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  next();
};

export const sanitizeBody = (req, res, next) => {
  const clean = (value) => {
    if (Array.isArray(value)) return value.map(clean);
    if (value && typeof value === "object") {
      return Object.fromEntries(
        Object.entries(value)
          .filter(([key]) => !key.startsWith("$") && !key.includes("."))
          .map(([key, nested]) => [key, clean(nested)])
      );
    }
    if (typeof value === "string") return value.trim();
    return value;
  };

  if (req.body) req.body = clean(req.body);
  next();
};

// Lightweight per-process limiter. Use a shared store (e.g. Redis) for multi-instance deployments.
const rateBuckets = new Map();
export const publicVerifyRateLimit = (req, res, next) => {
  const now = Date.now();
  const key = req.ip || req.socket?.remoteAddress || "unknown";
  const windowMs = 60_000;
  const limit = 30;
  let bucket = rateBuckets.get(key);
  if (!bucket || now >= bucket.resetAt) bucket = { count: 0, resetAt: now + windowMs };
  bucket.count += 1;
  rateBuckets.set(key, bucket);
  if (rateBuckets.size > 10_000) {
    for (const [k, v] of rateBuckets) if (now >= v.resetAt) rateBuckets.delete(k);
  }
  res.setHeader("RateLimit-Limit", String(limit));
  res.setHeader("RateLimit-Remaining", String(Math.max(0, limit - bucket.count)));
  if (bucket.count > limit) return res.status(429).json({ success: false, message: "Too many verification attempts. Try again shortly." });
  next();
};

// In-memory auth limiter: useful for single-process development. Use Redis/shared
// storage behind a load balancer or serverless deployment.
const authBuckets = new Map();
const accountRecoveryBuckets = new Map();
export const authRateLimit = (req, res, next) => {
  const now = Date.now();
  const ip = req.ip || req.socket?.remoteAddress || "unknown";
  const key = `${req.path}:${ip}`;
  const windowMs = 15 * 60_000;
  const limit = req.path.includes("login") ? 10 : (req.path.includes("forgot-password") ? 10 : 20);
  let bucket = authBuckets.get(key);
  if (!bucket || now >= bucket.resetAt) bucket = { count: 0, resetAt: now + windowMs };
  bucket.count += 1;
  authBuckets.set(key, bucket);

  // A separate per-account cooldown prevents an attacker from repeatedly replacing a victim's reset link.
  if (req.path.includes("forgot-password")) {
    const email = String(req.body?.email || "").trim().toLowerCase();
    const institutionId = String(req.body?.institutionId || "platform").trim();
    if (email) {
      const accountWindowMs = 60 * 60_000;
      const accountKeys = [`email:${email}:${ip}`, `account:${email}:${institutionId}:${ip}`];
      for (const accountKey of accountKeys) {
        let accountBucket = accountRecoveryBuckets.get(accountKey);
        if (!accountBucket || now >= accountBucket.resetAt) accountBucket = { count: 0, resetAt: now + accountWindowMs };
        accountBucket.count += 1;
        accountRecoveryBuckets.set(accountKey, accountBucket);
        const accountLimit = accountKey.startsWith("email:") ? 5 : 3;
        if (accountBucket.count > accountLimit) return res.status(429).json({ message: "If an account matches those details, a reset link will be sent shortly. Please wait before trying again." });
      }
    }
  }

  if (authBuckets.size > 10_000 || accountRecoveryBuckets.size > 20_000) {
    for (const [k, v] of authBuckets) if (now >= v.resetAt) authBuckets.delete(k);
    for (const [k, v] of accountRecoveryBuckets) if (now >= v.resetAt) accountRecoveryBuckets.delete(k);
  }
  res.setHeader("RateLimit-Limit", String(limit));
  res.setHeader("RateLimit-Remaining", String(Math.max(0, limit - bucket.count)));
  if (bucket.count > limit) return res.status(429).json({ message: "Too many authentication attempts. Try again later." });
  next();
};
