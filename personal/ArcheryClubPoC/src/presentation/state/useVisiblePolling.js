import { useEffect, useEffectEvent } from "react";

export function useVisiblePolling(
  callback,
  { enabled = true, intervalMs = 60000 } = {},
) {
  const runPolledCallback = useEffectEvent(() => {
    callback();
  });

  useEffect(() => {
    if (!enabled) {
      return undefined;
    }

    let intervalId = null;

    const runCallback = () => {
      runPolledCallback();
    };

    const startInterval = () => {
      if (intervalId || document.hidden) {
        return;
      }

      intervalId = window.setInterval(runCallback, intervalMs);
    };

    const stopInterval = () => {
      if (!intervalId) {
        return;
      }

      window.clearInterval(intervalId);
      intervalId = null;
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        stopInterval();
        return;
      }

      runCallback();
      startInterval();
    };

    const handleFocus = () => {
      if (!document.hidden) {
        runCallback();
      }
    };

    runCallback();
    startInterval();
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", handleFocus);

    return () => {
      stopInterval();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("focus", handleFocus);
    };
  }, [enabled, intervalMs]);
}
