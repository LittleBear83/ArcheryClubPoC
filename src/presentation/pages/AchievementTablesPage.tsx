import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { Button } from "../components/Button";
import { OutdoorTablePage } from "./OutdoorTablePage";
import { IndoorTablePage } from "./IndoorTablePage";
import type { UserProfile } from "../../types/app";

export function AchievementTablesPage({ currentUserProfile }: { currentUserProfile: UserProfile | null }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const requested = searchParams.get("tab");
  const active = requested === "indoor" ? "indoor" : "outdoor";
  useEffect(() => {
    if (requested === active) return;
    const next = new URLSearchParams(searchParams);
    next.set("tab", active);
    setSearchParams(next, { replace: true });
  }, [active, requested, searchParams, setSearchParams]);
  return <div className="achievement-tables-page">
    <div className="committee-tabs beginners-course-tabs" role="tablist" aria-label="Achievement table types">
      {(["indoor", "outdoor"] as const).map((tab) => <Button key={tab} type="button" role="tab"
        aria-selected={active === tab} className={`committee-tab beginners-course-tab ${active === tab ? "is-active" : ""}`}
        variant="ghost" onClick={() => { const next = new URLSearchParams(searchParams); next.set("tab", tab); setSearchParams(next); }}>
        {tab === "indoor" ? "Indoor" : "Outdoor"}
      </Button>)}
    </div>
    {active === "outdoor" ? <OutdoorTablePage currentUserProfile={currentUserProfile} />
      : <IndoorTablePage currentUserProfile={currentUserProfile} />}
  </div>;
}
