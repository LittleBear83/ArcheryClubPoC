import { RangeUsageView } from "./range-usage/RangeUsageView";
import { useRangeUsagePageState } from "./range-usage/useRangeUsagePageState";

export function RangeUsagePage({ currentUserProfile }) {
  const rangeUsagePageState = useRangeUsagePageState(currentUserProfile);

  return <RangeUsageView {...rangeUsagePageState} />;
}
