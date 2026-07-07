function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeAuditValue(value) {
  if (value === undefined) {
    return null;
  }

  if (Array.isArray(value)) {
    return value.map(normalizeAuditValue);
  }

  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, nestedValue]) => nestedValue !== undefined)
        .map(([key, nestedValue]) => [key, normalizeAuditValue(nestedValue)]),
    );
  }

  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    value === null
  ) {
    return value;
  }

  return String(value);
}

function stableStringify(value) {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringify(entry)).join(",")}]`;
  }

  if (isPlainObject(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(",")}}`;
  }

  return JSON.stringify(value);
}

function valuesAreEqual(left, right) {
  return stableStringify(normalizeAuditValue(left)) === stableStringify(normalizeAuditValue(right));
}

function buildChangePath(basePath, segment) {
  if (typeof segment === "number") {
    return basePath ? `${basePath}[${segment}]` : `[${segment}]`;
  }

  return basePath ? `${basePath}.${segment}` : segment;
}

function diffAuditValues(beforeValue, afterValue, basePath = "") {
  const normalizedBefore = normalizeAuditValue(beforeValue);
  const normalizedAfter = normalizeAuditValue(afterValue);

  if (valuesAreEqual(normalizedBefore, normalizedAfter)) {
    return [];
  }

  if (Array.isArray(normalizedBefore) || Array.isArray(normalizedAfter)) {
    const beforeArray = Array.isArray(normalizedBefore) ? normalizedBefore : [];
    const afterArray = Array.isArray(normalizedAfter) ? normalizedAfter : [];
    const maxLength = Math.max(beforeArray.length, afterArray.length);
    const nestedChanges = [];

    for (let index = 0; index < maxLength; index += 1) {
      nestedChanges.push(
        ...diffAuditValues(
          beforeArray[index],
          afterArray[index],
          buildChangePath(basePath, index),
        ),
      );
    }

    return nestedChanges.length > 0
      ? nestedChanges
      : [{
          path: basePath || "value",
          before: normalizedBefore,
          after: normalizedAfter,
        }];
  }

  if (isPlainObject(normalizedBefore) || isPlainObject(normalizedAfter)) {
    const beforeObject = isPlainObject(normalizedBefore) ? normalizedBefore : {};
    const afterObject = isPlainObject(normalizedAfter) ? normalizedAfter : {};
    const keys = Array.from(
      new Set([...Object.keys(beforeObject), ...Object.keys(afterObject)]),
    ).sort();
    const nestedChanges = [];

    for (const key of keys) {
      nestedChanges.push(
        ...diffAuditValues(
          beforeObject[key],
          afterObject[key],
          buildChangePath(basePath, key),
        ),
      );
    }

    return nestedChanges.length > 0
      ? nestedChanges
      : [{
          path: basePath || "value",
          before: normalizedBefore,
          after: normalizedAfter,
        }];
  }

  return [{
    path: basePath || "value",
    before: normalizedBefore,
    after: normalizedAfter,
  }];
}

function buildEntityAuditMetadata({
  action,
  after,
  before,
  entityId,
  entityLabel = "",
  entityType,
}) {
  const changes = diffAuditValues(before, after);

  return {
    action,
    auditKind: "entity_change",
    changeCount: changes.length,
    changes,
    entityId: entityId ?? null,
    entityLabel,
    entityType,
  };
}

function buildDefaultTarget(entityType, entityId) {
  if (!entityType) {
    return "entity";
  }

  return entityId == null || entityId === ""
    ? entityType
    : `${entityType}:${entityId}`;
}

export function createAuditChangeLogger({ recordAuditEvent }) {
  return {
    async recordEntityChange({
      action = "updated",
      actorUsername,
      after,
      before,
      changedAtDate,
      changedAtTime,
      entityId,
      entityLabel,
      entityType,
      req,
      statusCode = 200,
      target,
    }) {
      if (!recordAuditEvent) {
        return false;
      }

      const metadata = buildEntityAuditMetadata({
        action,
        after,
        before,
        entityId,
        entityLabel,
        entityType,
      });

      if (metadata.changeCount === 0) {
        return false;
      }

      await recordAuditEvent({
        actorUsername,
        action: `${String(entityType ?? "ENTITY").toUpperCase()}_${String(action).toUpperCase()}`,
        target: target || buildDefaultTarget(entityType, entityId),
        statusCode,
        ipAddress: req?.ip ?? req?.socket?.remoteAddress ?? "unknown",
        userAgent: req?.get?.("user-agent") ?? null,
        metadataJson: JSON.stringify(metadata),
        createdAtDate: changedAtDate,
        createdAtTime: changedAtTime,
      });

      return true;
    },
  };
}

export { diffAuditValues, normalizeAuditValue };
