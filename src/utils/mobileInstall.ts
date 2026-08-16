type NavigatorLike = {
  maxTouchPoints?: number;
  platform?: string;
  standalone?: boolean;
  userAgent?: string;
};

type WindowLike = {
  matchMedia?: (query: string) => { matches: boolean };
};

export type MobileInstallContext = {
  isIos: boolean;
  isStandalone: boolean;
  isSafari: boolean;
  isEmbeddedWebView: boolean;
};

function hasTouchMacPlatform(navigatorLike: NavigatorLike) {
  return (
    navigatorLike.platform === "MacIntel" &&
    Number(navigatorLike.maxTouchPoints ?? 0) > 1
  );
}

export function detectMobileInstallContext(
  navigatorLike: NavigatorLike,
  windowLike: WindowLike,
): MobileInstallContext {
  const userAgent = navigatorLike.userAgent ?? "";
  const isIosDevice =
    /iPad|iPhone|iPod/i.test(userAgent) || hasTouchMacPlatform(navigatorLike);
  const isStandalone =
    navigatorLike.standalone === true ||
    windowLike.matchMedia?.("(display-mode: standalone)")?.matches === true;
  const hasSafariToken = /Safari/i.test(userAgent);
  const excludedBrowserToken = /CriOS|FxiOS|EdgiOS|OPiOS|DuckDuckGo|YaBrowser/i.test(
    userAgent,
  );
  const isSafari = isIosDevice && hasSafariToken && !excludedBrowserToken;
  const isEmbeddedWebView = isIosDevice && !isStandalone && !isSafari;

  return {
    isIos: isIosDevice,
    isStandalone,
    isSafari,
    isEmbeddedWebView,
  };
}

export function getCurrentMobileInstallContext(): MobileInstallContext {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return {
      isIos: false,
      isStandalone: false,
      isSafari: false,
      isEmbeddedWebView: false,
    };
  }

  return detectMobileInstallContext(navigator, window);
}
