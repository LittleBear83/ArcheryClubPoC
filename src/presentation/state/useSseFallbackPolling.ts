import { useEffect, useState } from "react";
import { useVisiblePolling } from "./useVisiblePolling";
import { useServerEventDiagnostics } from "./useServerEventDiagnostics";
import {
  clearSseFallbackSource,
  markSseFallbackSourceActive,
} from "./sseFallbackDiagnostics";

type UseSseFallbackPollingOptions = {
  callback: () => void;
  enabled?: boolean;
  fallbackDelayMs?: number;
  intervalMs?: number;
  source: string;
};

export function useSseFallbackPolling({
  callback,
  enabled = true,
  fallbackDelayMs = 15000,
  intervalMs = 60000,
  source,
}: UseSseFallbackPollingOptions) {
  const diagnostics = useServerEventDiagnostics();
  const [hasDelayElapsed, setHasDelayElapsed] = useState(false);
  const shouldActivateFallback =
    enabled && diagnostics.connectionState !== "open";

  useEffect(() => {
    if (!shouldActivateFallback) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      setHasDelayElapsed(true);
    }, fallbackDelayMs);

    return () => {
      window.clearTimeout(timeoutId);
      setHasDelayElapsed(false);
    };
  }, [fallbackDelayMs, shouldActivateFallback]);

  const isFallbackActive = shouldActivateFallback && hasDelayElapsed;

  useVisiblePolling(callback, {
    enabled: enabled && isFallbackActive,
    intervalMs,
  });

  useEffect(() => {
    markSseFallbackSourceActive(source, enabled && isFallbackActive);

    return () => {
      clearSseFallbackSource(source);
    };
  }, [enabled, isFallbackActive, source]);

  return isFallbackActive;
}
