type FallbackDiagnostics = {
  activeSources: string[];
  isFallbackActive: boolean;
};

type DiagnosticsListener = () => void;

const listeners = new Set<DiagnosticsListener>();
const activeSources = new Set<string>();
let snapshot: FallbackDiagnostics = {
  activeSources: [],
  isFallbackActive: false,
};

function emitChange() {
  for (const listener of listeners) {
    listener();
  }
}

function buildSnapshot(): FallbackDiagnostics {
  return {
    activeSources: [...activeSources].sort((left, right) => left.localeCompare(right)),
    isFallbackActive: activeSources.size > 0,
  };
}

function refreshSnapshot() {
  snapshot = buildSnapshot();
}

export function markSseFallbackSourceActive(source: string, isActive: boolean) {
  const hadSource = activeSources.has(source);

  if (isActive && !hadSource) {
    activeSources.add(source);
    refreshSnapshot();
    emitChange();
    return;
  }

  if (!isActive && hadSource) {
    activeSources.delete(source);
    refreshSnapshot();
    emitChange();
  }
}

export function clearSseFallbackSource(source: string) {
  markSseFallbackSourceActive(source, false);
}

export function getSseFallbackDiagnostics() {
  return snapshot;
}

export function subscribeToSseFallbackDiagnostics(listener: DiagnosticsListener) {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}
