function getDelayUntilNextRun(targetHour, targetMinute) {
  const now = new Date();
  const nextRun = new Date(now);

  nextRun.setHours(targetHour, targetMinute, 0, 0);

  if (nextRun.getTime() <= now.getTime()) {
    nextRun.setDate(nextRun.getDate() + 1);
  }

  return nextRun.getTime() - now.getTime();
}

export function startGoldenRecordsSyncScheduler({
  hour = 1,
  logger = console,
  minute = 0,
  syncAllMembers,
}) {
  if (typeof syncAllMembers !== "function") {
    return {
      stop() {},
    };
  }

  let timeoutId = null;

  const queueNextRun = () => {
    const delayMs = getDelayUntilNextRun(hour, minute);

    timeoutId = setTimeout(async () => {
      try {
        await syncAllMembers();
      } catch (error) {
        logger.error?.("Golden Records nightly sync failed", {
          error: error instanceof Error ? error.message : error,
        });
      } finally {
        queueNextRun();
      }
    }, delayMs);
  };

  queueNextRun();

  return {
    stop() {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    },
  };
}
