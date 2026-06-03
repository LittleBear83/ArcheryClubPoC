import { useEffect, useState } from "react";

const DEFAULT_MOBILE_BREAKPOINT_PX = 900;

export function useIsMobile(breakpointPx = DEFAULT_MOBILE_BREAKPOINT_PX) {
  const getMatches = () =>
    typeof window !== "undefined"
      ? window.matchMedia(`(max-width: ${breakpointPx - 1}px)`).matches
      : false;

  const [isMobile, setIsMobile] = useState(getMatches);

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    const mediaQuery = window.matchMedia(`(max-width: ${breakpointPx - 1}px)`);
    const updateIsMobile = (event?: MediaQueryListEvent) => {
      setIsMobile(event ? event.matches : mediaQuery.matches);
    };

    updateIsMobile();
    mediaQuery.addEventListener("change", updateIsMobile);

    return () => {
      mediaQuery.removeEventListener("change", updateIsMobile);
    };
  }, [breakpointPx]);

  return isMobile;
}
