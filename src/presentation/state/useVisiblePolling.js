import { useEffect, useEffectEvent } from "react";

export function useVisiblePolling(
  callback,
  { enabled = true, intervalMs = 60000 } = {},
) {
  // Runs polling only while the tab is visible, then refreshes immediately when
  // the user returns so stale dashboards catch up without background churn.
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
