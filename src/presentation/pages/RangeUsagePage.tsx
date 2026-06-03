import { useIsMobile } from "../hooks/useIsMobile";
import { RangeUsageDesktopView } from "./range-usage/RangeUsageDesktopView";
import { RangeUsageMobileView } from "./range-usage/RangeUsageMobileView";
import { useRangeUsagePageState } from "./range-usage/useRangeUsagePageState";

export function RangeUsagePage({ currentUserProfile }) {
  const isMobile = useIsMobile();
  const rangeUsagePageState = useRangeUsagePageState(currentUserProfile);

  return isMobile
    ? <RangeUsageMobileView {...rangeUsagePageState} />
    : <RangeUsageDesktopView {...rangeUsagePageState} />;
}
