function parseJsonObject(value, fallback = null) {
  if (typeof value !== "string" || !value.trim()) {
    return fallback;
  }

  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function normalizeTemplateBooleanMap(value = {}) {
  if (!value || typeof value !== "object") {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, entryValue]) => [key, Boolean(entryValue)]),
  );
}

export function normalizeTournamentTemplateDefinition(template, options = {}) {
  if (!template || typeof template !== "object") {
    return null;
  }

  const normalizedKey = String(template.key ?? "").trim();
  const normalizedLabel = String(template.label ?? "").trim();
  const normalizedTournamentType = String(template.tournamentType ?? "").trim();
  const normalizedFormat = String(template.format ?? "").trim();
  const normalizedRoundType = String(template.roundType ?? "").trim();

  if (
    !normalizedKey ||
    !normalizedLabel ||
    !normalizedTournamentType ||
    !normalizedFormat ||
    !normalizedRoundType
  ) {
    return null;
  }

  const defaults =
    template.defaults && typeof template.defaults === "object"
      ? { ...template.defaults }
      : {};
  const eligibilityRules =
    template.eligibilityRules && typeof template.eligibilityRules === "object"
      ? { ...template.eligibilityRules }
      : null;

  return {
    key: normalizedKey,
    label: normalizedLabel,
    tournamentType: normalizedTournamentType,
    format: normalizedFormat,
    roundType: normalizedRoundType,
    description: String(template.description ?? "").trim(),
    defaults,
    capabilities: normalizeTemplateBooleanMap(template.capabilities),
    eligibilityRules,
    isCustom: options.isCustom === true,
  };
}

export function parseTournamentTemplateDefinitionJson(value) {
  const parsed = parseJsonObject(value, null);
  return normalizeTournamentTemplateDefinition(parsed);
}

export function serializeTournamentTemplateDefinition(template) {
  const normalized = normalizeTournamentTemplateDefinition(template);
  return normalized ? JSON.stringify(normalized) : null;
}

export function normalizeStoredTournamentTemplateRow(row) {
  if (!row || typeof row !== "object") {
    return null;
  }

  return normalizeTournamentTemplateDefinition(
    {
      key: row.template_key ?? row.key ?? null,
      label: row.label ?? null,
      tournamentType: row.tournament_type ?? row.tournamentType ?? null,
      format: row.format ?? null,
      roundType: row.round_type ?? row.roundType ?? null,
      description: row.description ?? "",
      defaults: parseJsonObject(row.defaults_json, {}),
      capabilities: parseJsonObject(row.capabilities_json, {}),
      eligibilityRules: parseJsonObject(row.eligibility_rules_json, null),
    },
    { isCustom: true },
  );
}

export function mergeTournamentTemplateOptions(
  builtInTemplates = [],
  storedTemplateRows = [],
) {
  const merged = new Map();

  for (const template of builtInTemplates) {
    const normalizedTemplate = normalizeTournamentTemplateDefinition(template);

    if (normalizedTemplate) {
      merged.set(normalizedTemplate.key, normalizedTemplate);
    }
  }

  for (const row of storedTemplateRows) {
    const normalizedTemplate = normalizeStoredTournamentTemplateRow(row);

    if (normalizedTemplate) {
      merged.set(normalizedTemplate.key, normalizedTemplate);
    }
  }

  return Array.from(merged.values()).sort((left, right) =>
    left.label.localeCompare(right.label),
  );
}

export function findTournamentTemplateDefinition({
  builtInTemplates = [],
  storedTemplateRows = [],
  templateDefinitionJson = null,
  templateKey = null,
  tournamentType = null,
}) {
  const storedSnapshot = parseTournamentTemplateDefinitionJson(templateDefinitionJson);

  if (storedSnapshot) {
    return storedSnapshot;
  }

  const mergedTemplates = mergeTournamentTemplateOptions(
    builtInTemplates,
    storedTemplateRows,
  );

  if (templateKey) {
    const matchingTemplate =
      mergedTemplates.find((template) => template.key === templateKey) ?? null;

    if (matchingTemplate) {
      return matchingTemplate;
    }
  }

  if (tournamentType === "head-to-head") {
    return (
      mergedTemplates.find((template) => template.key === "standard-knockout") ?? null
    );
  }

  return null;
}
