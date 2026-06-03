import { useIsMobile } from "../hooks/useIsMobile";
import { RecordsDesktopView } from "./records/RecordsDesktopView";
import { RecordsMobileView } from "./records/RecordsMobileView";
import { useRecordsPageState } from "./records/useRecordsPageState";

export function RecordsPage() {
  const isMobile = useIsMobile();
  const recordsPageState = useRecordsPageState();

  return isMobile
    ? <RecordsMobileView {...recordsPageState} />
    : <RecordsDesktopView {...recordsPageState} />;
}
