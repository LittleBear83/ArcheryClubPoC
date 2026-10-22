import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { Buffer } from "node:buffer";
import { REMEMBERED_DEVICE_MAX_AGE_SECONDS } from "../../../shared/rememberedDevicePolicy.js";

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/u;

function hashToken(token) {
  return createHash("sha256").update(token).digest("hex");
}

export function createRememberedDeviceService({ gateway, secret, now = () => new Date() }) {
  const credentialFingerprint = (passwordHash) =>
    createHmac("sha256", secret).update(passwordHash).digest("hex");

  return {
    async issue(user) {
      if (!user?.id || !user.password || !user.active_member) {
        throw new Error("An active password-authenticated member is required.");
      }

      const createdAt = now();
      const expiresAt = new Date(createdAt.getTime() + REMEMBERED_DEVICE_MAX_AGE_SECONDS * 1000);
      const token = randomBytes(32).toString("base64url");
      await gateway.insert({
        tokenHash: hashToken(token),
        userId: user.id,
        credentialFingerprint: credentialFingerprint(user.password),
        createdAt,
        expiresAt,
      });
      return { token, expiresAt };
    },

    async authenticate(token, loadUser) {
      if (!TOKEN_PATTERN.test(String(token ?? ""))) return null;

      const tokenHash = hashToken(token);
      const record = await gateway.findByTokenHash(tokenHash);
      if (!record) return null;

      const expiresAt = new Date(record.expires_at);
      if (!Number.isFinite(expiresAt.getTime()) || expiresAt <= now()) {
        await gateway.revokeByTokenHash(tokenHash);
        return null;
      }

      const user = await loadUser(record.username);
      const expectedFingerprint = user?.password
        ? Buffer.from(credentialFingerprint(user.password), "hex") : Buffer.alloc(0);
      const storedFingerprint = Buffer.from(String(record.credential_fingerprint ?? ""), "hex");
      const credentialsMatch = storedFingerprint.length === expectedFingerprint.length &&
        expectedFingerprint.length > 0 && timingSafeEqual(storedFingerprint, expectedFingerprint);
      if (!user?.active_member || String(user.id) !== String(record.user_id) || !credentialsMatch) {
        await gateway.revokeByTokenHash(tokenHash);
        return null;
      }

      const remainingSeconds = Math.floor((expiresAt.getTime() - now().getTime()) / 1000);
      return remainingSeconds > 0 ? { user, remainingSeconds } : null;
    },

    async revoke(token) {
      if (TOKEN_PATTERN.test(String(token ?? ""))) {
        await gateway.revokeByTokenHash(hashToken(token));
      }
    },
  };
}
