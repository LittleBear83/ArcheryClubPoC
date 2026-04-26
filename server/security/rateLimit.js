export function createRateLimiter({
  getKey = (req) => req.ip ?? req.socket?.remoteAddress ?? "unknown",
  isLimitedPath = () => true,
  maxAttempts,
  message = "Too many requests. Please wait a moment and try again.",
  windowMs,
}) {
  if (!Number.isFinite(maxAttempts) || maxAttempts < 1) {
    throw new Error("A positive rate limit attempt count is required.");
  }

  if (!Number.isFinite(windowMs) || windowMs < 1) {
    throw new Error("A positive rate limit window is required.");
  }

  const buckets = new Map();

  const pruneBuckets = (now = Date.now()) => {
    for (const [key, bucket] of buckets) {
      if (bucket.resetAt <= now) {
        buckets.delete(key);
      }
    }
  };

  const consume = ({ key, now = Date.now(), res }) => {
    pruneBuckets(now);

    const bucket =
      buckets.get(key) ?? {
        count: 0,
        resetAt: now + windowMs,
      };

    bucket.count += 1;
    buckets.set(key, bucket);

    if (bucket.count <= maxAttempts) {
      return false;
    }

    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((bucket.resetAt - now) / 1000),
    );

    res.setHeader("Retry-After", String(retryAfterSeconds));
    return true;
  };

  const middleware = (req, res, next) => {
    if (!isLimitedPath(req)) {
      next();
      return;
    }

    if (
      consume({
        key: getKey(req),
        res,
      })
    ) {
      res.status(429).json({
        success: false,
        message,
      });
      return;
    }

    next();
  };

  return {
    buckets,
    consume,
    middleware,
    pruneBuckets,
  };
}
