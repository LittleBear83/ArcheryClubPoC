import { useEffect, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { Button } from "../components/Button";
import { BeginnersCoursesPage } from "./BeginnersCoursesPage";
import { BeginnersAndTasterReportingPage } from "./BeginnersAndTasterReportingPage";
import { hasPermission } from "../../utils/userProfile";

const TAB_OPTIONS = [
  {
    id: "taster-session",
    label: "Taster Sessions",
    permissionKeys: ["manage_have_a_go_sessions", "approve_have_a_go_sessions"],
  },
  {
    id: "beginners",
    label: "Beginners Courses",
    permissionKeys: ["manage_beginners_courses", "approve_beginners_courses"],
  },
  {
    id: "reporting",
    label: "Reporting",
    permissionKeys: ["view_reports"],
  },
] as const;

type TabId = (typeof TAB_OPTIONS)[number]["id"];

type BeginnersAndTasterPageProps = {
  currentUserProfile: unknown;
};

function canAccessTab(currentUserProfile: unknown, permissionKeys: readonly string[]) {
  return permissionKeys.some((permissionKey) =>
    hasPermission(currentUserProfile, permissionKey),
  );
}

export function BeginnersAndTasterPage({
  currentUserProfile,
}: BeginnersAndTasterPageProps) {
  const [searchParams, setSearchParams] = useSearchParams();

  const availableTabs = useMemo(
    () =>
      TAB_OPTIONS.filter((tab) =>
        canAccessTab(currentUserProfile, tab.permissionKeys),
      ),
    [currentUserProfile],
  );

  const requestedTab = searchParams.get("tab");
  const defaultTab = availableTabs[0]?.id ?? "taster-session";
  const activeTab = availableTabs.some((tab) => tab.id === requestedTab)
    ? (requestedTab as TabId)
    : defaultTab;

  useEffect(() => {
    if (requestedTab === activeTab) {
      return;
    }

    const nextSearchParams = new URLSearchParams(searchParams);
    nextSearchParams.set("tab", activeTab);
    setSearchParams(nextSearchParams, { replace: true });
  }, [activeTab, requestedTab, searchParams, setSearchParams]);

  if (availableTabs.length === 0) {
    return <p>You do not have permission to manage beginners courses, Taster Sessions, or view this reporting.</p>;
  }

  return (
    <div className="beginners-course-combined-page">
      {availableTabs.length > 1 ? (
        <div
          className="committee-tabs beginners-course-tabs"
          role="tablist"
          aria-label="Course types"
        >
          {availableTabs.map((tab) => {
            const isActive = tab.id === activeTab;

            return (
              <Button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                className={`committee-tab beginners-course-tab ${isActive ? "is-active" : ""}`}
                variant="ghost"
                onClick={() => {
                  const nextSearchParams = new URLSearchParams(searchParams);
                  nextSearchParams.set("tab", tab.id);
                  setSearchParams(nextSearchParams);
                }}
              >
                {tab.label}
              </Button>
            );
          })}
        </div>
      ) : null}

      {activeTab === "reporting" ? (
        <BeginnersAndTasterReportingPage currentUserProfile={currentUserProfile} />
      ) : (
        <BeginnersCoursesPage
          currentUserProfile={currentUserProfile}
          variant={activeTab}
        />
      )}
    </div>
  );
}
