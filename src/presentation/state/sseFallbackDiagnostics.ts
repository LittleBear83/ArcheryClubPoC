type FallbackDiagnostics = {
  activeSources: string[];
  isFallbackActive: boolean;
};

type DiagnosticsListener = () => void;

const listeners = new Set<DiagnosticsListener>();
const activeSources = new Set<string>();

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

export function markSseFallbackSourceActive(source: string, isActive: boolean) {
  const hadSource = activeSources.has(source);

  if (isActive && !hadSource) {
    activeSources.add(source);
    emitChange();
    return;
  }

  if (!isActive && hadSource) {
    activeSources.delete(source);
    emitChange();
  }
}

export function clearSseFallbackSource(source: string) {
  markSseFallbackSourceActive(source, false);
}

export function getSseFallbackDiagnostics() {
  return buildSnapshot();
}

export function subscribeToSseFallbackDiagnostics(listener: DiagnosticsListener) {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}
