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
  const [isFallbackActive, setIsFallbackActive] = useState(false);

  useEffect(() => {
    if (!enabled) {
      setIsFallbackActive(false);
      return undefined;
    }

    if (diagnostics.connectionState === "open") {
      setIsFallbackActive(false);
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      setIsFallbackActive(true);
    }, fallbackDelayMs);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [diagnostics.connectionState, enabled, fallbackDelayMs]);

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
