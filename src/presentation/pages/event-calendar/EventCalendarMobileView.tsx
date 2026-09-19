import { useEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "../../components/Button";
import { MobileCardList } from "../../components/mobile/MobileCardList";
import { MobileEmptyState } from "../../components/mobile/MobileEmptyState";
import { MobileSectionHeader } from "../../components/mobile/MobileSectionHeader";

type MobileAgendaCard = {
  key: string;
  badge: ReactNode;
  title: string;
  timeLabel: string;
  metaLabel: string;
  actionLabel: string;
  actionVariant: "primary" | "secondary";
  opensDay: boolean;
  onOpen: () => void;
};

type EventCalendarMobileViewProps = {
  filterBar: ReactNode;
  summaryContent: ReactNode;
  monthLabel: string;
  agendaCards: MobileAgendaCard[];
  onToday: () => void;
  onPrevMonth: () => void;
  onNextMonth: () => void;
};

export function EventCalendarMobileView({
  filterBar,
  summaryContent,
  monthLabel,
  agendaCards,
  onToday,
  onPrevMonth,
  onNextMonth,
}: EventCalendarMobileViewProps) {
  const [showSelectedDay, setShowSelectedDay] = useState(false);
  const dayHeadingRef = useRef<HTMLHeadingElement>(null);
  const agendaHeadingRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (showSelectedDay) {
      dayHeadingRef.current?.focus();
      dayHeadingRef.current?.scrollIntoView({ block: "start" });
    }
  }, [showSelectedDay]);

  return (
    <section className="event-calendar-layout event-calendar-layout-expanded event-calendar-layout--mobile">
      <div className="event-calendar-main">
        {filterBar}
        {showSelectedDay ? (
          <section className="event-summary-panel" aria-label="Selected day">
            <h3 ref={dayHeadingRef} tabIndex={-1}>
              Selected day
            </h3>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setShowSelectedDay(false);
                requestAnimationFrame(() => agendaHeadingRef.current?.focus());
              }}
            >
              Back to month agenda
            </Button>
            {summaryContent}
          </section>
        ) : (
          <section className="event-mobile-agenda-panel">
            <div ref={agendaHeadingRef} tabIndex={-1}>
              <MobileSectionHeader
                title="Month Agenda"
                description={`Showing ${agendaCards.length} item${agendaCards.length === 1 ? "" : "s"} for ${monthLabel}.`}
                actions={
                  <Button
                    type="button"
                    onClick={() => {
                      onToday();
                      setShowSelectedDay(true);
                    }}
                    variant="secondary"
                    fullWidth
                  >
                    Today
                  </Button>
                }
              />
            </div>
            <div className="event-mobile-agenda-nav">
              <Button type="button" onClick={onPrevMonth} variant="ghost">
                Previous
              </Button>
              <Button type="button" onClick={onNextMonth} variant="ghost">
                Next
              </Button>
            </div>
            {agendaCards.length > 0 ? (
              <MobileCardList className="event-mobile-agenda-list">
                {agendaCards.map((card) => (
                  <article
                    key={card.key}
                    className="event-summary-card event-mobile-agenda-card"
                  >
                    <div className="event-mobile-agenda-card-head">
                      {card.badge}
                      <strong className="event-summary-card-title">{card.title}</strong>
                    </div>
                    <span className="event-summary-card-time">{card.timeLabel}</span>
                    <span className="event-summary-card-meta">{card.metaLabel}</span>
                    <Button
                      type="button"
                      onClick={() => {
                        card.onOpen();
                        if (card.opensDay) setShowSelectedDay(true);
                      }}
                      variant={card.actionVariant}
                      fullWidth
                    >
                      {card.actionLabel}
                    </Button>
                  </article>
                ))}
              </MobileCardList>
            ) : (
              <MobileEmptyState message="No calendar items match the current filters for this month." />
            )}
          </section>
        )}
      </div>
    </section>
  );
}
