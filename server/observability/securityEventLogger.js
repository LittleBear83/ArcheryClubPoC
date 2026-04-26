const SECURITY_RESPONSE_STATUS_CODES = new Set([401, 403, 429]);
const DEFAULT_ALERT_THRESHOLD = 25;
const DEFAULT_ALERT_WINDOW_MS = 5 * 60 * 1000;

function getRequestPath(req) {
  return String(req.originalUrl ?? req.url ?? req.path ?? "").split("?")[0] || "/";
}

function callLogger(logger, level, event) {
  const log = logger?.[level] ?? logger?.log;

  if (typeof log === "function") {
    log.call(logger, event);
  }
}

function safeLookup(lookup, fallback) {
  try {
    return lookup();
  } catch {
    return fallback;
  }
}

function buildBaseEvent({
  durationMs = null,
  getActorUsername,
  getClientIp,
  req,
  statusCode,
}) {
  const userAgent =
    typeof req.get === "function"
      ? req.get("user-agent")
      : req.headers?.["user-agent"];

  return {
    event: "security.http_response",
    statusCode,
    method: req.method,
    path: getRequestPath(req),
    durationMs,
    ipAddress: safeLookup(() => getClientIp(req), "unknown"),
    userAgent: userAgent ?? null,
    actorUsername: safeLookup(() => getActorUsername(req), null),
  };
}

function createSecurityAlertTracker({
  alertThreshold = DEFAULT_ALERT_THRESHOLD,
  alertWindowMs = DEFAULT_ALERT_WINDOW_MS,
  now = () => Date.now(),
} = {}) {
  const buckets = new Map();

  return {
    record(event) {
      if (!SECURITY_RESPONSE_STATUS_CODES.has(event.statusCode)) {
        return null;
      }

      const ipAddress = event.ipAddress || "unknown";
      const currentTime = now();
      const existingBucket = buckets.get(ipAddress);
      const bucket =
        existingBucket && existingBucket.resetAt > currentTime
          ? existingBucket
          : {
              count: 0,
              resetAt: currentTime + alertWindowMs,
              statuses: new Map(),
            };

      bucket.count += 1;
      bucket.statuses.set(
        event.statusCode,
        (bucket.statuses.get(event.statusCode) ?? 0) + 1,
      );
      buckets.set(ipAddress, bucket);

      if (bucket.count !== alertThreshold) {
        return null;
      }

      return {
        event: "security.alert.threshold",
        severity: "alert",
        ipAddress,
        count: bucket.count,
        threshold: alertThreshold,
        windowMs: alertWindowMs,
        statuses: Object.fromEntries(bucket.statuses),
        lastStatusCode: event.statusCode,
        lastMethod: event.method,
        lastPath: event.path,
        lastUserAgent: event.userAgent,
        lastActorUsername: event.actorUsername,
        resetAt: new Date(bucket.resetAt).toISOString(),
      };
    },
  };
}

export function createSecurityEventLogger({
  alertThreshold = DEFAULT_ALERT_THRESHOLD,
  alertWindowMs = DEFAULT_ALERT_WINDOW_MS,
  getActorUsername = () => null,
  getClientIp = () => "unknown",
  logger = console,
  now,
} = {}) {
  const alertTracker = createSecurityAlertTracker({
    alertThreshold,
    alertWindowMs,
    now,
  });

  // Log after the response finishes so the final status code is captured
  // without reading or storing sensitive request bodies.
  return (req, res, next) => {
    const startedAt = Date.now();

    res.on("finish", () => {
      const { statusCode } = res;

      if (
        !SECURITY_RESPONSE_STATUS_CODES.has(statusCode) &&
        statusCode < 500
      ) {
        return;
      }

      const event = {
        ...buildBaseEvent({
          durationMs: Date.now() - startedAt,
          getActorUsername,
          getClientIp,
          req,
          statusCode,
        }),
        severity: statusCode >= 500 ? "error" : "warn",
      };

      callLogger(logger, statusCode >= 500 ? "error" : "warn", event);

      const alertEvent = alertTracker.record(event);

      if (alertEvent) {
        callLogger(logger, "warn", alertEvent);
      }
    });

    next();
  };
}

export function logServerError({
  error,
  getActorUsername = () => null,
  getClientIp = () => "unknown",
  logger = console,
  req,
  statusCode,
}) {
  if (statusCode < 500) {
    return;
  }

  callLogger(logger, "error", {
    ...buildBaseEvent({
      getActorUsername,
      getClientIp,
      req,
      statusCode,
    }),
    event: "security.server_error",
    severity: "error",
    errorName: error?.name ?? null,
    errorMessage: error?.message ?? "Unhandled server error",
  });
}
