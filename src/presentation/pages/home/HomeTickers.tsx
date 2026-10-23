import { buildAnnouncementTickerClassName, buildAnnouncementTickerTrackClassName, getAnnouncementTickerState } from "./homeTickerUtils";

type Props = {
  announcementTicker: ReturnType<typeof getAnnouncementTickerState>;
  homeTickerMessage: string;
  lostArrowNoticeMessages: string[];
  adminTournamentWarnings: string[];
  isMobile: boolean;
};

export function HomeTickers({ announcementTicker, homeTickerMessage, lostArrowNoticeMessages, adminTournamentWarnings, isMobile }: Props) {
  return <>
      {announcementTicker.length > 0 ? (
        <div className="announcement-ticker-stack">
          {announcementTicker.map((tickerRow) => (
            <div
              key={`${tickerRow.tone}-${tickerRow.message}`}
              className={buildAnnouncementTickerClassName({
                isMobile,
                tone: tickerRow.tone,
              })}
              role="status"
              aria-live="polite"
            >
              <div className={buildAnnouncementTickerTrackClassName(isMobile)}>
                <span>{tickerRow.message}</span>
                {isMobile ? null : (
                  <span aria-hidden="true">{tickerRow.message}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {homeTickerMessage ? (
        <div
          className={[
            "membership-reminder-ticker",
            isMobile ? "membership-reminder-ticker--mobile" : "",
          ].filter(Boolean).join(" ")}
          role="status"
          aria-live="polite"
        >
          <div
            className={[
              "membership-reminder-ticker-track",
              isMobile ? "membership-reminder-ticker-track--mobile" : "",
            ].filter(Boolean).join(" ")}
          >
            <span>{homeTickerMessage}</span>
          </div>
        </div>
      ) : null}

      {lostArrowNoticeMessages.length > 0 ? (
        <div
          className={[
            "lost-arrow-ticker",
            isMobile ? "lost-arrow-ticker--mobile" : "",
          ].filter(Boolean).join(" ")}
          role="status"
          aria-live="polite"
        >
          <div
            className={[
              "lost-arrow-ticker-track",
              isMobile ? "lost-arrow-ticker-track--mobile" : "",
            ].filter(Boolean).join(" ")}
          >
            <span>{lostArrowNoticeMessages.join("   |   ")}</span>
            {isMobile ? null : (
              <span aria-hidden="true">{lostArrowNoticeMessages.join("   |   ")}</span>
            )}
          </div>
        </div>
      ) : null}

      {adminTournamentWarnings.length > 0 ? (
        <div
          className={[
            "admin-warning-ticker",
            isMobile ? "admin-warning-ticker--mobile" : "",
          ].filter(Boolean).join(" ")}
          role="status"
          aria-live="polite"
        >
          <div
            className={[
              "admin-warning-ticker-track",
              isMobile ? "admin-warning-ticker-track--mobile" : "",
            ].filter(Boolean).join(" ")}
          >
            <span>
              {adminTournamentWarnings.join("   |   ")}
            </span>
            {isMobile ? null : (
              <span aria-hidden="true">
                {adminTournamentWarnings.join("   |   ")}
              </span>
            )}
          </div>
        </div>
      ) : null}

  </>;
}
