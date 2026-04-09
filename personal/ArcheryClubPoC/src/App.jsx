import "./App.css";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import lawnmower from "./assets/lawnmower.svg";
import { HomePage } from "./presentation/pages/HomePage";
import { LoginPage } from "./presentation/pages/LoginPage";
import { Modal } from "./presentation/components/Modal";
import { InMemoryMemberDataSource } from "./data/sources/InMemoryMemberDataSource";
import { MemberRepositoryImpl } from "./data/repositories/MemberRepositoryImpl";
import { GetMembersUseCase } from "./usecases/GetMembersUseCase";
import { AddMemberUseCase } from "./usecases/AddMemberUseCase";
import { normalizeUserProfile } from "./utils/userProfile";
import { subscribeToRfidScans } from "./utils/rfidScanHub";

const AUTH_STORAGE_KEY = "archeryclubpoc-authenticated";
const AUTH_USER_STORAGE_KEY = "archeryclubpoc-authenticated-user";
const AUTH_MESSAGE_STORAGE_KEY = "archeryclubpoc-auth-message";
const DEFAULT_USERNAME = "Cfleetham";
const INACTIVITY_TIMEOUT_MS = 120000;
const RFID_SESSION_HANDOFF_IDLE_MS = 15000;
const DEFAULT_PAYMENT_CARD_MESSAGE =
  "Thank you for your $5000 donation for the children of Namibia, this will go a long way to the PPE equipment they sorely need, your complementary Parker Pen will be dispatched in the next 3-5 business weeks.";
const PAYMENT_CARD_WARNING_MESSAGE =
  "please ensure not to use any other token or card other than the one that was issued to you";

const dataSource = new InMemoryMemberDataSource();
const memberRepository = new MemberRepositoryImpl({ dataSource });
const getMembersUseCase = new GetMembersUseCase({ memberRepository });
const addMemberUseCase = new AddMemberUseCase({ memberRepository });

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

function App() {
  const inactivityTimeoutRef = useRef(null);
  const lastActivityAtRef = useRef(Date.now());
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    return window.localStorage.getItem(AUTH_STORAGE_KEY) === "true";
  });
  const [currentUserProfile, setCurrentUserProfile] = useState(() =>
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

  const persistAuthenticatedUser = (userProfile) => {
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

  const handleCurrentUserProfileUpdate = (userProfile) => {
    persistAuthenticatedUser(userProfile);
  };

  const handleLogin = async ({ username, password }) => {
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ username, password }),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        return {
          success: false,
          message: result.message ?? "Unable to log in.",
        };
      }

      persistAuthenticatedUser(result.userProfile);

      return { success: true, username: result.userProfile.auth.username };
    } catch {
      return {
        success: false,
        message:
          "Login service is unavailable. Make sure the local auth server is running.",
      };
    }
  };

  const handleLogout = (message = "") => {
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
    setIsAuthenticated(false);
    setCurrentUserProfile(null);
  };

  const handleRfidLogin = async (rfidTag) => {
    try {
      const response = await fetch("/api/auth/rfid", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ rfidTag }),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        return {
          success: false,
          message: result.message ?? "Unable to log in with RFID.",
        };
      }

      persistAuthenticatedUser(result.userProfile);

      return {
        success: true,
        username: result.userProfile.auth.username,
      };
    } catch {
      return {
        success: false,
        message:
          "RFID service is unavailable. Make sure the local auth server is running.",
      };
    }
  };

  const handleGuestLogin = async ({
    firstName,
    surname,
    archeryGbMembershipNumber,
    invitedByUsername,
  }) => {
    try {
      const response = await fetch("/api/auth/guest-login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          firstName,
          surname,
          archeryGbMembershipNumber,
          invitedByUsername,
        }),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        return {
          success: false,
          message: result.message ?? "Unable to create guest login.",
        };
      }

      persistAuthenticatedUser(result.userProfile);

      return {
        success: true,
      };
    } catch {
      return {
        success: false,
        message:
          "Guest login service is unavailable. Make sure the local auth server is running.",
      };
    }
  };

  const handleLogoutEvent = useEffectEvent((message = "") => {
    handleLogout(message);
  });
  const handleRfidLoginEvent = useEffectEvent(async (rfidTag) => {
    return handleRfidLogin(rfidTag);
  });

  useEffect(() => {
    if (isAuthenticated && !currentUserProfile) {
      handleLogout();
    }
  }, [currentUserProfile, isAuthenticated]);

  useEffect(() => {
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
  }, []);

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
        const response = await fetch(`/api/user-profiles/${username}`, {
          headers: {
            "x-actor-username": username,
          },
          cache: "no-store",
          signal: abortController.signal,
        });
        const result = await response.json();

        if (!response.ok || !result.success || abortController.signal.aborted) {
          return;
        }

        persistAuthenticatedUser(result.userProfile);
      } catch {
        // Keep the active session if the refresh fails; the next successful
        // profile load or login will rehydrate the latest permissions.
      }
    };

    refreshAuthenticatedUser();

    return () => {
      abortController.abort();
    };
  }, [currentUserProfile?.auth?.username, isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) {
      return undefined;
    }

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
          onLogin={handleLogin}
          onRfidLogin={handleRfidLogin}
          initialMessage={loginMessage}
          seededUsername={DEFAULT_USERNAME}
        />
        <Modal
          open={paymentCardModal.open}
          onClose={handlePaymentCardModalClose}
          title="Card Payment Detected"
        >
          <div className="payment-card-modal">
            <img
              src={lawnmower}
              alt="Illustration of a lawnmower"
              className="payment-card-modal-image"
            />
            <p className="payment-card-modal-copy">
              {paymentCardModal.cardBrand
                ? `${paymentCardModal.cardBrand} contactless card detected.`
                : "Contactless payment card detected."}
            </p>
            <p className="payment-card-modal-copy">
              {paymentCardModal.message}
            </p>
            <button
              type="button"
              className="secondary-button"
              onClick={handlePaymentCardModalClose}
            >
              Close
            </button>
          </div>
        </Modal>
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
                getMembersUseCase={getMembersUseCase}
                addMemberUseCase={addMemberUseCase}
                currentUserProfile={currentUserProfile}
                onCurrentUserProfileUpdate={handleCurrentUserProfileUpdate}
                onLogout={handleLogout}
              />
            }
          />
        </Routes>
      </Router>
      <Modal
        open={paymentCardModal.open}
        onClose={handlePaymentCardModalClose}
        title="Demo Only"
      >
        <div className="payment-card-modal">
          <img
            src={lawnmower}
            alt="Illustration of a lawnmower"
            className="payment-card-modal-image"
          />
          <p className="payment-card-modal-copy">
            {paymentCardModal.cardBrand
              ? `${paymentCardModal.cardBrand} contactless card detected.`
              : "Contactless payment card detected."}
          </p>
          <p className="payment-card-modal-copy">{paymentCardModal.message}</p>
          <button
            type="button"
            className="secondary-button"
            onClick={handlePaymentCardModalClose}
          >
            Close
          </button>
        </div>
      </Modal>
    </>
  );
}

export default App;
