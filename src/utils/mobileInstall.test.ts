import assert from "node:assert/strict";
import test from "node:test";
import { detectMobileInstallContext } from "./mobileInstall";

test("detects iPhone Safari as installable browser context", () => {
  assert.deepStrictEqual(
    detectMobileInstallContext(
      {
        userAgent:
          "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
        platform: "iPhone",
        maxTouchPoints: 5,
      },
      {
        matchMedia: () => ({ matches: false }),
      },
    ),
    {
      isIos: true,
      isStandalone: false,
      isSafari: true,
      isEmbeddedWebView: false,
    },
  );
});

test("detects standalone iPhone launch separately from Safari tab", () => {
  assert.deepStrictEqual(
    detectMobileInstallContext(
      {
        userAgent:
          "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148",
        platform: "iPhone",
        maxTouchPoints: 5,
        standalone: true,
      },
      {
        matchMedia: () => ({ matches: true }),
      },
    ),
    {
      isIos: true,
      isStandalone: true,
      isSafari: false,
      isEmbeddedWebView: false,
    },
  );
});

test("detects embedded iPhone webview where install is unavailable", () => {
  assert.deepStrictEqual(
    detectMobileInstallContext(
      {
        userAgent:
          "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148",
        platform: "iPhone",
        maxTouchPoints: 5,
      },
      {
        matchMedia: () => ({ matches: false }),
      },
    ),
    {
      isIos: true,
      isStandalone: false,
      isSafari: false,
      isEmbeddedWebView: true,
    },
  );
});
