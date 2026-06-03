import type { ReactNode } from "react";
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
  return (
    <section className="event-calendar-layout event-calendar-layout-expanded event-calendar-layout--mobile">
      <div className="event-calendar-main">
        {filterBar}
        <section className="event-mobile-agenda-panel">
          <MobileSectionHeader
            title="Month Agenda"
            description={`Showing ${agendaCards.length} item${agendaCards.length === 1 ? "" : "s"} for ${monthLabel}.`}
            actions={
              <Button
                type="button"
                onClick={onToday}
                variant="secondary"
                fullWidth
              >
                Today
              </Button>
            }
          />
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
                    onClick={card.onOpen}
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
      </div>

      <aside className="event-summary-panel">
        <h3>Calendar summary</h3>
        {summaryContent}
      </aside>
    </section>
  );
}
