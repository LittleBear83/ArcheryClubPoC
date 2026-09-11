import { useEffect, useRef, useState } from "react";
import "./LoginPage.css";
import selbyLogo from "../../assets/selby_Archery_Logo.svg";
import { Button } from "../components/Button";
import { useIsMobile } from "../hooks/useIsMobile";
import { getCurrentMobileInstallContext } from "../../utils/mobileInstall";
import { subscribeToLocalRfidBridgeScans } from "../../utils/localRfidBridge";
import {
  connectPublicServerEvents,
  disconnectPublicServerEvents,
  subscribeToPublicServerEvent,
} from "../../lib/publicServerEvents";

const SIMULATED_RFID_TAG = "7673CF3D";
const ENABLE_RFID_SIMULATOR =
  import.meta.env.DEV || import.meta.env.VITE_ENABLE_RFID_SIMULATOR === "true";

type LocalRfidReaderStatus = {
  bridgeAvailable: boolean;
  available: boolean;
  pcscAvailable: boolean;
  readerCount: number;
  readers: string[];
  lastError?: string | null;
};

export function LoginPage({ onLogin, onRfidLogin, initialMessage = "" }) {
  const isMobile = useIsMobile();
  const installContext = getCurrentMobileInstallContext();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(initialMessage);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [rfidReaderStatus, setRfidReaderStatus] =
    useState<LocalRfidReaderStatus | null>(null);
  const latestRfidSequenceRef = useRef(0);
  const isSubmittingRef = useRef(false);
  const lastProcessedRfidTagRef = useRef("");
  const lastProcessedRfidAtRef = useRef(0);
  const showInstallHelp = isMobile && installContext.isIos;

  let installTitle = "";
  let installMessage = "";

  if (showInstallHelp) {
    if (installContext.isStandalone) {
      installTitle = "Home Screen app detected";
      installMessage =
        "This copy is already running from the iPhone Home Screen. If an older saved shortcut is failing, delete that shortcut and add the portal again from Safari.";
    } else if (installContext.isEmbeddedWebView) {
      installTitle = "Open this in Safari to install";
      installMessage =
        "This headless in-app browser cannot show 'Add to Home Screen'. Open the portal in Safari, then use Share > Add to Home Screen. If a bookmark opens here and fails, recreate it from Safari.";
    } else {
      installTitle = "Install on iPhone";
      installMessage =
        "To add the portal to the Home Screen, open the Safari share menu and choose 'Add to Home Screen'.";
    }
  }

  const attemptRfidLogin = async (rfidTag) => {
    if (!rfidTag) {
      return;
    }

    setIsSubmitting(true);

    try {
      const loginResult = await onRfidLogin(rfidTag);

      if (!loginResult?.success) {
        setError(loginResult?.message ?? "Unable to log in with RFID.");
        return;
      }

      setError("");
    } catch {
      setError(
        "RFID service is unavailable. Make sure the local auth server is running.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  useEffect(() => {
    setError(initialMessage);
  }, [initialMessage]);

  useEffect(() => {
    isSubmittingRef.current = isSubmitting;
  }, [isSubmitting]);

  useEffect(() => {
    connectPublicServerEvents();

    const unsubscribe = subscribeToPublicServerEvent("rfid.scan", async (scan) => {
      const latestScan = scan as {
        sequence?: number;
        rfidTag?: string;
        scanType?: string;
      } | null;

      if (
        isSubmittingRef.current ||
        !latestScan?.rfidTag ||
        latestScan.scanType === "payment-card" ||
        (latestScan.sequence ?? 0) <= latestRfidSequenceRef.current
      ) {
        return;
      }

      latestRfidSequenceRef.current = latestScan.sequence ?? 0;

      const rfidTag = String(latestScan.rfidTag).trim().toUpperCase();
      const now = Date.now();

      if (
        lastProcessedRfidTagRef.current === rfidTag &&
        now - lastProcessedRfidAtRef.current < 1000
      ) {
        return;
      }

      lastProcessedRfidTagRef.current = rfidTag;
      lastProcessedRfidAtRef.current = now;

      try {
        const loginResult = await onRfidLogin(rfidTag);
        if (!loginResult?.success) {
          setError(loginResult?.message ?? "Unable to log in with RFID.");
          return;
        }

        setError("");
      } catch {
        setError(
          "RFID service is unavailable. Make sure the local auth server is running.",
        );
      }
    });

    return () => {
      unsubscribe();
      disconnectPublicServerEvents();
    };
  }, [onRfidLogin]);

  useEffect(() => {
    return subscribeToLocalRfidBridgeScans(
      async (scan) => {
        const rfidTag = String(scan?.rfidTag ?? "").trim().toUpperCase();

        if (isSubmittingRef.current || !rfidTag) {
          return;
        }

        const now = Date.now();

        if (
          lastProcessedRfidTagRef.current === rfidTag &&
          now - lastProcessedRfidAtRef.current < 1000
        ) {
          return;
        }

        lastProcessedRfidTagRef.current = rfidTag;
        lastProcessedRfidAtRef.current = now;

        isSubmittingRef.current = true;
        setIsSubmitting(true);

        try {
          const loginResult = await onRfidLogin(rfidTag);

          if (!loginResult?.success) {
            setError(loginResult?.message ?? "Unable to log in with RFID.");
            return;
          }

          setError("");
        } catch {
          setError(
            "RFID service is unavailable. Make sure the local reader bridge is running.",
          );
        } finally {
          isSubmittingRef.current = false;
          setIsSubmitting(false);
        }
      },
      {
        onStatus: (status) => {
          setRfidReaderStatus(status);
        },
      },
    );
  }, [onRfidLogin]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setIsSubmitting(true);

    const result = await onLogin({
      username,
      password,
      deviceType: isMobile ? "mobile" : "desktop",
    });

    if (!result.success) {
      setError(result.message);
      setIsSubmitting(false);
      return;
    }

    setError("");
    setIsSubmitting(false);
  };

  const handleSimulatedRfid = async () => {
    await attemptRfidLogin(SIMULATED_RFID_TAG);
  };

  return (
    <main className="login-shell">
      <div className="login-arrow-field" aria-hidden="true">
        {Array.from({ length: 8 }, (_, index) => (
          <span
            key={`arrow-${index + 1}`}
            className={`login-flying-arrow login-flying-arrow-${index + 1}`}
          >
            <span className="login-flying-arrow-line" />
            <span className="login-flying-arrow-head" />
            <span className="login-flying-arrow-fletching" />
          </span>
        ))}
      </div>

      <section className="login-card" aria-labelledby="login-title">
        <div className="login-header">
          <img
            src={selbyLogo}
            alt="Selby Archers Logo"
            className="login-logo"
          />
          <p className="login-eyebrow">Selby Archers</p>
          <h1 id="login-title" className="login-title">
            Member Login
          </h1>
          <p className="login-copy">Sign in to access the club portal.</p>

          {error ? (
            <p className="login-error login-error-banner" role="alert">
              {error}
            </p>
          ) : null}

          {showInstallHelp ? (
            <div className="login-install-help" role="note" aria-live="polite">
              <p className="login-install-help-title">{installTitle}</p>
              <p className="login-install-help-copy">{installMessage}</p>
            </div>
          ) : null}
        </div>

        <div className="login-stage">
          <section
            className="member-panel login-panel login-form-panel"
            aria-label="Member sign in"
          >
            <div className="login-panel-header">
              <p className="section-title">Member Sign In</p>
              <p className="login-panel-copy">
                Use your club username and password to open the portal.
              </p>
            </div>
            <form
              className="login-form"
              onSubmit={handleSubmit}
              autoComplete="off"
            >
              <label>
                Username
                <input
                  type="text"
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  autoComplete="off"
                  name="member-login-username"
                  disabled={isSubmitting}
                />
              </label>

              <label>
                Password
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="new-password"
                  name="member-login-password"
                  disabled={isSubmitting}
                />
              </label>

              <Button
                type="submit"
                className="login-submit"
                disabled={isSubmitting}
              >
                {isSubmitting ? "Signing In..." : "Log In"}
              </Button>
            </form>
          </section>

          {ENABLE_RFID_SIMULATOR || rfidReaderStatus?.bridgeAvailable ? (
            <section className="rfid-panel" aria-label="RFID sign in">
              <p className="section-title">RFID Access</p>

              {rfidReaderStatus?.available ? (
                <>
                  <p className="rfid-copy">
                    RFID reader connected. Tap your club card or fob to sign in.
                  </p>
                  <p className="rfid-copy">
                    Reader: {rfidReaderStatus.readers.join(", ")}
                  </p>
                </>
              ) : rfidReaderStatus?.bridgeAvailable &&
                !rfidReaderStatus.pcscAvailable ? (
                <p className="rfid-copy">
                  RFID Reader Bridge is running, but the reader driver is
                  unavailable.
                </p>
              ) : rfidReaderStatus?.bridgeAvailable ? (
                <p className="rfid-copy">
                  RFID Reader Bridge is running, but no RFID reader is connected.
                </p>
              ) : (
                <p className="rfid-copy">
                  Use the simulator below to test RFID sign-in.
                </p>
              )}

              {ENABLE_RFID_SIMULATOR ? (
                <Button
                  type="button"
                  className="rfid-simulate-button"
                  onClick={handleSimulatedRfid}
                  disabled={isSubmitting}
                  variant="secondary"
                >
                  {isSubmitting ? "Checking RFID..." : "Simulate RFID Tap"}
                </Button>
              ) : null}
            </section>
          ) : null}
        </div>
      </section>
    </main>
  );
}
