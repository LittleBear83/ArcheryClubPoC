import { useEffect, useRef, useState } from "react";
import selbyLogo from "../../assets/selby_Archery_Logo.svg";
import { Button } from "../components/Button";
import { useIsMobile } from "../hooks/useIsMobile";
import {
  connectPublicServerEvents,
  disconnectPublicServerEvents,
  subscribeToPublicServerEvent,
} from "../../lib/publicServerEvents";

const SIMULATED_RFID_TAG = "7673CF3D";
const ENABLE_RFID_SIMULATOR =
  import.meta.env.DEV || import.meta.env.VITE_ENABLE_RFID_SIMULATOR === "true";

export function LoginPage({ onLogin, onRfidLogin, initialMessage = "" }) {
  const isMobile = useIsMobile();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(initialMessage);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const latestRfidSequenceRef = useRef(0);

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
    connectPublicServerEvents();

    const unsubscribe = subscribeToPublicServerEvent("rfid.scan", async (scan) => {
      const latestScan = scan as {
        sequence?: number;
        rfidTag?: string;
        scanType?: string;
      } | null;

      if (
        isSubmitting ||
        !latestScan?.rfidTag ||
        latestScan.scanType === "payment-card" ||
        (latestScan.sequence ?? 0) <= latestRfidSequenceRef.current
      ) {
        return;
      }

      latestRfidSequenceRef.current = latestScan.sequence ?? 0;

      try {
        const loginResult = await onRfidLogin(latestScan.rfidTag);
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
  }, [isSubmitting, onRfidLogin]);

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

          {ENABLE_RFID_SIMULATOR ? (
            <section className="rfid-panel" aria-label="RFID sign in">
              <p className="section-title">RFID Access</p>
              <p className="rfid-copy">
                Tap your club card to sign in. For now, use the simulator below
                to test RFID sign-in.
              </p>
              <Button
                type="button"
                className="rfid-simulate-button"
                onClick={handleSimulatedRfid}
                disabled={isSubmitting || !ENABLE_RFID_SIMULATOR}
                variant="secondary"
              >
                {isSubmitting ? "Checking RFID..." : "Simulate RFID Tap"}
              </Button>
            </section>
          ) : null}
        </div>
      </section>
    </main>
  );
}
