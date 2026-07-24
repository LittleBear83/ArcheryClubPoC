import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getGeneralInfo } from "../../api/generalInfoApi";
import { getDefaultGeneralInfoContent } from "../../../shared/generalInfoDefaults.js";
import { SectionPanel } from "../components/SectionPanel";
import { StatusMessagePanel } from "../components/StatusMessagePanel";

type GeneralInfoPageProps = {
  currentUserProfile: unknown;
};

const generalInfoQueryKeys = {
  detail: (actorUsername: string) => ["general-info", actorUsername] as const,
};

export function GeneralInfoPage({ currentUserProfile }: GeneralInfoPageProps) {
  const actorUsername =
    (currentUserProfile as { auth?: { username?: string | null } } | null)?.auth?.username ?? "";
  const { data, isLoading, error } = useQuery({
    queryKey: generalInfoQueryKeys.detail(actorUsername),
    queryFn: () => getGeneralInfo(currentUserProfile),
    enabled: Boolean(actorUsername),
  });

  const generalInfo = useMemo(
    () => data?.generalInfo ?? getDefaultGeneralInfoContent(),
    [data?.generalInfo],
  );

  return (
    <div className="profile-page general-info-page">
      <SectionPanel className="profile-form" title="Club Information Centre">
        <StatusMessagePanel
          error={error instanceof Error ? error.message : ""}
          loading={isLoading}
          loadingLabel="Loading general information..."
        />
        <h2 className="profile-section-title">Club Information Centre</h2>
        {generalInfo.introParagraphs.map((paragraph) => (
          <p key={paragraph}>{paragraph}</p>
        ))}
      </SectionPanel>

      <section className="general-info-grid">
        <section className="home-panel">
          <h3 className="home-panel-title">At A Glance</h3>
          <ul className="home-info-list">
            {generalInfo.quickFacts.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>

        <section className="home-panel">
          <h3 className="home-panel-title">Facilities</h3>
          <ul className="home-info-list">
            {generalInfo.facilities.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>

        <section className="home-panel">
          <h3 className="home-panel-title">Beginners And Membership</h3>
          <ul className="home-info-list">
            {generalInfo.beginners.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>

        <section className="home-panel">
          <h3 className="home-panel-title">Club Life</h3>
          <ul className="home-info-list">
            {generalInfo.clubLife.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
      </section>
    </div>
  );
}
