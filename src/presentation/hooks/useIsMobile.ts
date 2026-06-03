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
    const updateIsMobile = (event?: MediaQueryListEvent | MediaQueryList) => {
      setIsMobile(event ? event.matches : mediaQuery.matches);
    };

    updateIsMobile();

    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", updateIsMobile);

      return () => {
        mediaQuery.removeEventListener("change", updateIsMobile);
      };
    }

    if (typeof mediaQuery.addListener === "function") {
      mediaQuery.addListener(updateIsMobile);

      return () => {
        mediaQuery.removeListener(updateIsMobile);
      };
    }

    return undefined;
  }, [breakpointPx]);

  return isMobile;
}
