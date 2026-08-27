function normalizeRoundSchedule(entries = []) {
  return entries
    .map((entry, index) => ({
      roundNumber:
        Number.isInteger(entry?.roundNumber) && entry.roundNumber > 0
          ? entry.roundNumber
          : index + 1,
      title:
        typeof entry?.title === "string" && entry.title.trim()
          ? entry.title.trim()
          : `Round ${index + 1}`,
      publishDate:
        typeof entry?.publishDate === "string" && entry.publishDate.trim()
          ? entry.publishDate.trim()
          : null,
      submissionDeadline:
        typeof entry?.submissionDeadline === "string" &&
        entry.submissionDeadline.trim()
          ? entry.submissionDeadline.trim()
          : null,
    }))
    .sort((left, right) => left.roundNumber - right.roundNumber);
}

function normalizeAutomaticConfig(config) {
  if (!config || typeof config !== "object") {
    return null;
  }

  const firstRoundStartDate =
    typeof config.firstRoundStartDate === "string" && config.firstRoundStartDate.trim()
      ? config.firstRoundStartDate.trim()
      : "";
  const roundWindowDays = Number(config.roundWindowDays ?? 0);
  const roundRestDays = Number(config.roundRestDays ?? 0);

  if (
    !firstRoundStartDate ||
    !Number.isInteger(roundWindowDays) ||
    roundWindowDays <= 0 ||
    !Number.isInteger(roundRestDays) ||
    roundRestDays < 0
  ) {
    return null;
  }

  return {
    firstRoundStartDate,
    roundWindowDays,
    roundRestDays,
  };
}

function normalizeDrawMetadata(draw) {
  if (!draw || typeof draw !== "object") {
    return null;
  }

  const orderUsernames = Array.isArray(draw.orderUsernames)
    ? [...new Set(
        draw.orderUsernames
          .map((value) => String(value ?? "").trim())
          .filter(Boolean),
      )]
    : [];

  return {
    generatedAt:
      typeof draw.generatedAt === "string" && draw.generatedAt.trim()
        ? draw.generatedAt.trim()
        : null,
    orderUsernames,
  };
}

function parseTournamentRoundPlan(rawSchedule) {
  if (!rawSchedule) {
    return {
      automaticConfig: null,
      manualSchedule: [],
      draw: null,
    };
  }

  try {
    const parsed = JSON.parse(rawSchedule);

    if (Array.isArray(parsed)) {
      return {
        automaticConfig: null,
        manualSchedule: normalizeRoundSchedule(parsed),
        draw: null,
      };
    }

    if (parsed && typeof parsed === "object") {
      const draw = normalizeDrawMetadata(parsed.draw);

      if (parsed.mode === "automatic") {
        return {
          automaticConfig: normalizeAutomaticConfig(parsed),
          manualSchedule: [],
          draw,
        };
      }

      if (parsed.mode === "manual" || Array.isArray(parsed.rounds)) {
        return {
          automaticConfig: null,
          manualSchedule: normalizeRoundSchedule(parsed.rounds ?? []),
          draw,
        };
      }
    }
  } catch {
    return {
      automaticConfig: null,
      manualSchedule: [],
      draw: null,
    };
  }

  return {
    automaticConfig: null,
    manualSchedule: [],
    draw: null,
  };
}

function buildTournamentRoundPlanJson({
  automaticConfig = null,
  manualSchedule = [],
  draw = null,
}) {
  const normalizedDraw = normalizeDrawMetadata(draw);

  if (automaticConfig) {
    return JSON.stringify({
      mode: "automatic",
      ...normalizeAutomaticConfig(automaticConfig),
      ...(normalizedDraw ? { draw: normalizedDraw } : {}),
    });
  }

  const normalizedManualSchedule = normalizeRoundSchedule(manualSchedule);

  if (normalizedDraw) {
    return JSON.stringify({
      mode: "manual",
      rounds: normalizedManualSchedule,
      draw: normalizedDraw,
    });
  }

  return JSON.stringify(normalizedManualSchedule);
}

export { buildTournamentRoundPlanJson, parseTournamentRoundPlan };
