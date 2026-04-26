import "./App.css";
import { useCallback, useEffect, useEffectEvent, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import lawnmower from "./assets/lawnmower.svg";
import { Button } from "./presentation/components/Button";
import { HomePage } from "./presentation/pages/HomePage";
import { LoginPage } from "./presentation/pages/LoginPage";
import { Modal } from "./presentation/components/Modal";
import { normalizeUserProfile } from "./utils/userProfile";
import { subscribeToRfidScans } from "./utils/rfidScanHub";
import {
  getCurrentSession,
  loginAsGuest,
  loginWithCredentials,
  loginWithLatestRfidScan,
  loginWithRfid,
  logoutSession,
} from "./api/authApi";
import type { UserProfile } from "./types/app";
import type { AppDependencies } from "./bootstrap/createAppDependencies";

const AUTH_STORAGE_KEY = "archeryclubpoc-authenticated";
const AUTH_USER_STORAGE_KEY = "archeryclubpoc-authenticated-user";
const AUTH_MESSAGE_STORAGE_KEY = "archeryclubpoc-auth-message";
const DEFAULT_USERNAME = "Cfleetham";
const INACTIVITY_TIMEOUT_MS = 120000;
const RFID_SESSION_HANDOFF_IDLE_MS = 15000;
const DEFAULT_PAYMENT_CARD_MESSAGE =
  "Thank you for your $5000 donation for the children of Namibia, this will go a long way to the PPE equipment they sorely need, your complementary Parker Pen will be dispatched in the next 3-5 business weeks.";
const PAYMENT_CARD_WARNING_MESSAGE =
  "No Monies have been taken, Please ensure not to use any other token or card other than the one that was issued to you";

function loadStoredUserProfile() {
  const storedUser = window.localStorage.getItem(AUTH_USER_STORAGE_KEY);

  if (!storedUser) {
    return null;
  }

  try {
    return normalizeUserProfile(JSON.parse(storedUser));
  } catch {
    return null;
  }
}

function PaymentCardModal({
  cardBrand,
  message,
  open,
  title,
  onClose,
}: {
  cardBrand: string;
  message: string;
  open: boolean;
  title: string;
  onClose: () => void;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
    >
      <div className="payment-card-modal">
        <img
          src={lawnmower}
          alt="Illustration of a lawnmower"
          className="payment-card-modal-image"
        />
        <p className="payment-card-modal-copy">
          {cardBrand
            ? `${cardBrand} contactless card detected.`
            : "Contactless payment card detected."}
        </p>
        <p className="payment-card-modal-copy">{message}</p>
        <Button
          type="button"
          className="secondary-button"
          onClick={onClose}
          variant="secondary"
        >
          Close
        </Button>
      </div>
    </Modal>
  );
}

function App({ dependencies }: { dependencies: AppDependencies }) {
  // The app keeps a local session snapshot for fast reloads, then verifies it
  // against the server and refreshes the canonical member profile after login.
  const inactivityTimeoutRef = useRef<number | null>(null);
  const lastActivityAtRef = useRef(Date.now());
  const queryClient = useQueryClient();
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    return window.localStorage.getItem(AUTH_STORAGE_KEY) === "true";
  });
  const [currentUserProfile, setCurrentUserProfile] = useState<UserProfile | null>(() =>
    loadStoredUserProfile(),
  );
  const [loginMessage, setLoginMessage] = useState(() => {
    return window.localStorage.getItem(AUTH_MESSAGE_STORAGE_KEY) ?? "";
  });
  const [paymentCardModal, setPaymentCardModal] = useState({
    open: false,
    cardBrand: "",
    message: DEFAULT_PAYMENT_CARD_MESSAGE,
  });

  const handlePaymentCardModalClose = () => {
    // Demo payment cards intentionally use a two-step message: the first close
    // reveals the warning, the second close dismisses the modal.
    setPaymentCardModal((current) => {
      if (current.message === PAYMENT_CARD_WARNING_MESSAGE) {
        return {
          open: false,
          cardBrand: "",
          message: DEFAULT_PAYMENT_CARD_MESSAGE,
        };
      }

      return {
        ...current,
        message: PAYMENT_CARD_WARNING_MESSAGE,
      };
    });
  };

  const persistAuthenticatedUser = (userProfile: unknown) => {
    // Normalize before persisting so old API shapes and current API shapes are
    // read consistently by the rest of the frontend.
    const storedUserProfile = normalizeUserProfile(userProfile);

    lastActivityAtRef.current = Date.now();
    window.localStorage.removeItem(AUTH_MESSAGE_STORAGE_KEY);
    setLoginMessage("");
    window.localStorage.setItem(AUTH_STORAGE_KEY, "true");
    window.localStorage.setItem(
      AUTH_USER_STORAGE_KEY,
      JSON.stringify(storedUserProfile),
    );
    window.history.replaceState({}, "", "/");
    setIsAuthenticated(true);
    setCurrentUserProfile(storedUserProfile);
    window.dispatchEvent(new Event("member-session-updated"));
  };

  const handleCurrentUserProfileUpdate = (userProfile: UserProfile | unknown) => {
    persistAuthenticatedUser(userProfile);
    void queryClient.invalidateQueries();
  };

  const handleLogin = async ({
    username,
    password,
  }: {
    username: string;
    password: string;
  }) => {
    try {
      const result = await loginWithCredentials(username, password);

      persistAuthenticatedUser(result.userProfile);

      return { success: true, username: result.userProfile.auth.username };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error
          ? error.message
          : "Login service is unavailable. Make sure the local auth server is running.",
      };
    }
  };

  const handleLogout = useCallback((message = "") => {
    if (inactivityTimeoutRef.current) {
      window.clearTimeout(inactivityTimeoutRef.current);
      inactivityTimeoutRef.current = null;
    }

    lastActivityAtRef.current = Date.now();
    if (message) {
      window.localStorage.setItem(AUTH_MESSAGE_STORAGE_KEY, message);
      setLoginMessage(message);
    } else {
      window.localStorage.removeItem(AUTH_MESSAGE_STORAGE_KEY);
      setLoginMessage("");
    }
    window.localStorage.removeItem(AUTH_STORAGE_KEY);
    window.localStorage.removeItem(AUTH_USER_STORAGE_KEY);
    void logoutSession().catch(() => undefined);
    setIsAuthenticated(false);
    setCurrentUserProfile(null);
    void queryClient.invalidateQueries();
  }, [queryClient]);

  const handleRfidLogin = async (rfidTag: string) => {
    try {
      const result = await loginWithRfid(rfidTag);

      persistAuthenticatedUser(result.userProfile);

      return {
        success: true,
        username: result.userProfile.auth.username,
      };
    } catch (error) {
      const message = error instanceof Error
        ? error.message
        : "RFID service is unavailable. Make sure the local auth server is running.";

      if (
        message.includes("/api/auth/rfid/latest-login") ||
        message.includes("Cannot POST /api/auth/rfid/latest-login")
      ) {
        return {
          success: false,
          pending: true,
          unavailable: true,
        };
      }

      return {
        success: false,
        message,
      };
    }
  };

  const handleLatestRfidLogin = async () => {
    try {
      const result = await loginWithLatestRfidScan();

      if (!result.userProfile) {
        return { success: false, pending: true };
      }

      const storedUserProfile = normalizeUserProfile(result.userProfile);
      persistAuthenticatedUser(storedUserProfile);

      return {
        success: true,
        username: storedUserProfile.auth.username,
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error
          ? error.message
          : "RFID service is unavailable. Make sure the local auth server is running.",
      };
    }
  };

  const handleGuestLogin = async ({
    firstName,
    surname,
    archeryGbMembershipNumber,
    invitedByUsername,
  }: {
    firstName: string;
    surname: string;
    archeryGbMembershipNumber: string;
    invitedByUsername: string;
  }) => {
    try {
      const result = await loginAsGuest({
        firstName,
        surname,
        archeryGbMembershipNumber,
        invitedByUsername,
      });

      persistAuthenticatedUser(result.userProfile);

      return {
        success: true,
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error
          ? error.message
          : "Guest login service is unavailable. Make sure the local auth server is running.",
      };
    }
  };

  const handleLogoutEvent = useEffectEvent((message = "") => {
    handleLogout(message);
  });
  const handleRfidLoginEvent = useEffectEvent(async (rfidTag: string) => {
    return handleRfidLogin(rfidTag);
  });
  const validateServerSessionEvent = useEffectEvent(async () => {
    if (!isAuthenticated) {
      return;
    }

    try {
      const result = await getCurrentSession();
      const sessionProfile = normalizeUserProfile(result.userProfile);
      const storedUsername = currentUserProfile?.auth?.username;
      const sessionUsername = sessionProfile?.auth?.username;

      if (storedUsername && sessionUsername && storedUsername !== sessionUsername) {
        handleLogout("Your session has changed. Please sign in again.");
        return;
      }

      persistAuthenticatedUser(result.userProfile);
    } catch (error) {
      handleLogout(
        error instanceof Error
          ? error.message
          : "Your session has expired. Please sign in again.",
      );
    }
  });

  useEffect(() => {
    if (isAuthenticated && !currentUserProfile) {
      handleLogout();
    }
  }, [currentUserProfile, handleLogout, isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) {
      return;
    }

    void validateServerSessionEvent();
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) {
      return undefined;
    }

    let isActive = true;

    const unsubscribe = subscribeToRfidScans((scan) => {
      if (!isActive || scan?.scanType !== "payment-card") {
        return;
      }

      setPaymentCardModal({
        open: true,
        cardBrand: scan.cardBrand ?? "",
        message: DEFAULT_PAYMENT_CARD_MESSAGE,
      });
    });

    return () => {
      isActive = false;
      unsubscribe();
    };
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) {
      return undefined;
    }

    const username = currentUserProfile?.auth?.username;

    if (!username) {
      return undefined;
    }

    const abortController = new AbortController();

    const refreshAuthenticatedUser = async () => {
      try {
        const result = await dependencies.getUserProfileUseCase.execute({
          actorUsername: username,
          username,
          signal: abortController.signal,
        });

        if (abortController.signal.aborted) {
          return;
        }

        persistAuthenticatedUser(result);
      } catch {
        return;
      }
    };

    refreshAuthenticatedUser();

    return () => {
      abortController.abort();
    };
  }, [
    currentUserProfile?.auth?.username,
    dependencies.getUserProfileUseCase,
    isAuthenticated,
  ]);

  useEffect(() => {
    if (!isAuthenticated) {
      return undefined;
    }

    // Any authenticated interaction resets the idle timer; expiry signs the
    // local user out and asks the server to clear the cookie-backed session.
    const resetInactivityTimeout = () => {
      lastActivityAtRef.current = Date.now();

      if (inactivityTimeoutRef.current) {
        window.clearTimeout(inactivityTimeoutRef.current);
      }

      inactivityTimeoutRef.current = window.setTimeout(() => {
        handleLogoutEvent();
      }, INACTIVITY_TIMEOUT_MS);
    };

    const activityEvents = [
      "click",
      "keydown",
      "mousemove",
      "mousedown",
      "scroll",
      "touchstart",
    ];

    resetInactivityTimeout();

    for (const eventName of activityEvents) {
      window.addEventListener(eventName, resetInactivityTimeout);
    }

    return () => {
      if (inactivityTimeoutRef.current) {
        window.clearTimeout(inactivityTimeoutRef.current);
        inactivityTimeoutRef.current = null;
      }

      for (const eventName of activityEvents) {
        window.removeEventListener(eventName, resetInactivityTimeout);
      }
    };
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) {
      return undefined;
    }

    // RFID scans can hand the kiosk over to another member only after a short
    // idle window, which avoids replacing an actively used session mid-action.
    let isActive = true;
    let isHandingOff = false;

    return subscribeToRfidScans(async (scan) => {
      if (!isActive || isHandingOff || !scan?.rfidTag) {
        return;
      }

      if (scan.scanType === "payment-card") {
        return;
      }

      const idleForMs = Date.now() - lastActivityAtRef.current;

      if (idleForMs < RFID_SESSION_HANDOFF_IDLE_MS) {
        return;
      }

      isHandingOff = true;

      try {
        const loginResult = await handleRfidLoginEvent(scan.rfidTag);

        if (!isActive) {
          return;
        }

        if (!loginResult.success) {
          handleLogoutEvent(loginResult.message);
        }
      } finally {
        isHandingOff = false;
      }
    });
  }, [isAuthenticated]);

  if (!isAuthenticated) {
    return (
      <>
        <LoginPage
          onGuestLogin={handleGuestLogin}
          onLatestRfidLogin={handleLatestRfidLogin}
          onLogin={handleLogin}
          onRfidLogin={handleRfidLogin}
          initialMessage={loginMessage}
          seededUsername={DEFAULT_USERNAME}
        />
        <PaymentCardModal
          open={paymentCardModal.open}
          cardBrand={paymentCardModal.cardBrand}
          message={paymentCardModal.message}
          onClose={handlePaymentCardModalClose}
          title="Card Payment Detected"
        />
      </>
    );
  }

  return (
    <>
      <Router>
        <Routes>
          <Route
            path="/*"
            element={
              <HomePage
                currentUserProfile={currentUserProfile}
                onCurrentUserProfileUpdate={handleCurrentUserProfileUpdate}
                onLogout={handleLogout}
                memberProfileCrud={dependencies}
                roleCrud={dependencies}
                tournamentCrud={dependencies}
                equipmentCrud={dependencies}
              />
            }
          />
        </Routes>
      </Router>
      <PaymentCardModal
        open={paymentCardModal.open}
        cardBrand={paymentCardModal.cardBrand}
        message={paymentCardModal.message}
        onClose={handlePaymentCardModalClose}
        title="Demo Only"
      />
    </>
  );
}

export default App;
