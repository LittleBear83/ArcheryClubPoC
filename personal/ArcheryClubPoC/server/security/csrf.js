import crypto from "node:crypto";
import { Buffer } from "node:buffer";

const DEFAULT_COOKIE_NAME = "archeryclubpoc_csrf";
const DEFAULT_HEADER_NAME = "x-csrf-token";

function parseCookies(req) {
  return Object.fromEntries(
    String(req.headers.cookie ?? "")
      .split(";")
      .map((cookie) => cookie.trim().split("="))
      .filter(([key, value]) => key && value)
      .map(([key, value]) => [key, decodeURIComponent(value)]),
  );
}

export function createCsrfProtection({
  cookieName = DEFAULT_COOKIE_NAME,
  excludedPaths = new Set(),
  headerName = DEFAULT_HEADER_NAME,
  isLive = false,
  maxAgeSeconds,
  mutatingApiMethods = new Set(["POST", "PUT", "PATCH", "DELETE"]),
  secret,
}) {
  if (!secret) {
    throw new Error("A CSRF signing secret is required.");
  }

  const signTokenNonce = (nonce) => {
    return crypto
      .createHmac("sha256", secret)
      .update(nonce)
      .digest("base64url");
  };

  const createToken = () => {
    const nonce = crypto.randomBytes(32).toString("base64url");

    return `${nonce}.${signTokenNonce(nonce)}`;
  };

  const verifyToken = (token) => {
    const [nonce, signature] = String(token ?? "").split(".");

    if (!nonce || !signature) {
      return false;
    }

    const expectedSignature = signTokenNonce(nonce);
    const signatureBuffer = Buffer.from(signature);
    const expectedSignatureBuffer = Buffer.from(expectedSignature);

    return (
      signatureBuffer.length === expectedSignatureBuffer.length &&
      crypto.timingSafeEqual(signatureBuffer, expectedSignatureBuffer)
    );
  };

  const createCookie = (token) => {
    const secureFlag = isLive ? "; Secure" : "";
    const maxAgeFlag = maxAgeSeconds ? `; Max-Age=${maxAgeSeconds}` : "";

    return `${cookieName}=${encodeURIComponent(token)}; Path=/; SameSite=Lax${maxAgeFlag}${secureFlag}`;
  };

  const clearCookie = () => {
    const secureFlag = isLive ? "; Secure" : "";

    return `${cookieName}=; Path=/; SameSite=Lax; Max-Age=0${secureFlag}`;
  };

  const getToken = (req) => {
    const csrfToken = parseCookies(req)[cookieName];

    if (verifyToken(csrfToken)) {
      return csrfToken;
    }

    return createToken();
  };

  const middleware = (req, res, next) => {
    if (
      !mutatingApiMethods.has(req.method) ||
      !req.path.startsWith("/api/") ||
      excludedPaths.has(req.path)
    ) {
      next();
      return;
    }

    const cookies = parseCookies(req);
    const cookieToken = cookies[cookieName];
    const headerToken = req.get(headerName);

    if (
      !cookieToken ||
      !headerToken ||
      cookieToken !== headerToken ||
      !verifyToken(cookieToken)
    ) {
      res.status(403).json({
        success: false,
        message: "Security token is missing or invalid. Refresh and try again.",
      });
      return;
    }

    next();
  };

  return {
    clearCookie,
    cookieName,
    createCookie,
    createToken,
    getToken,
    headerName,
    middleware,
    verifyToken,
  };
}
