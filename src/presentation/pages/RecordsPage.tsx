import { useIsMobile } from "../hooks/useIsMobile";
import { RecordsDesktopView } from "./records/RecordsDesktopView";
import { RecordsMobileView } from "./records/RecordsMobileView";
import { useRecordsPageState } from "./records/useRecordsPageState";
import type { UserProfile } from "../../types/app";

export function RecordsPage({ currentUserProfile }: { currentUserProfile: UserProfile | null }) {
  const isMobile = useIsMobile();
  const recordsPageState = useRecordsPageState(currentUserProfile);

  return isMobile
    ? <RecordsMobileView {...recordsPageState} />
    : <RecordsDesktopView {...recordsPageState} />;
}
