export const PUBLICATION_FEED_VERSION = "sync-publication-v2";
const MAX_PUBLICATION_CURSOR = 9223372036854775807n;

export function isValidPublicationCursor(value) {
  return typeof value === "string"
    && /^(0|[1-9][0-9]{0,18})$/.test(value)
    && BigInt(value) <= MAX_PUBLICATION_CURSOR;
}
