import "./App.css";
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import lawnmower from "./assets/lawnmower.svg";
import { subscribeToServerEvent } from "./lib/serverEvents";
import { Button } from "./presentation/components/Button";
import { Modal } from "./presentation/components/Modal";
import { useIsMobile } from "./presentation/hooks/useIsMobile";
import { normalizeUserProfile } from "./utils/userProfile";
import { subscribeToRfidScans } from "./utils/rfidScanHub";
import { useSseFallbackDiagnostics } from "./presentation/state/useSseFallbackDiagnostics";
import { useServerEventDiagnostics } from "./presentation/state/useServerEventDiagnostics";
import {
  AUTHENTICATED_EVENT_QUERY_GROUPS,
  useServerEvents,
} from "./presentation/state/useServerEvents";
import {
  getCurrentSession,
  loginAsGuest,
  loginWithCredentials,
  loginWithRfid,
  logoutSession,
} from "./api/authApi";
import type { UserProfile } from "./types/app";
import type { AppDependencies } from "./bootstrap/createAppDependencies";

const HomePage = lazy(() =>
  import("./presentation/pages/HomePage").then((module) => ({
    default: module.HomePage,
  })),
);
const LoginPage = lazy(() =>
  import("./presentation/pages/LoginPage").then((module) => ({
    default: module.LoginPage,
  })),
);

const AUTH_STORAGE_KEY = "archeryclubpoc-authenticated";
const AUTH_USER_STORAGE_KEY = "archeryclubpoc-authenticated-user";
const AUTH_MESSAGE_STORAGE_KEY = "archeryclubpoc-auth-message";
const DESKTOP_INACTIVITY_TIMEOUT_MS = 120000;
const MOBILE_INACTIVITY_TIMEOUT_MS = 300000;
const RFID_SESSION_HANDOFF_IDLE_MS = 15000;
const DEFAULT_PAYMENT_CARD_MESSAGE =
  "Thank you for your $5000 donation for the children of Namibia, this will go a long way to the PPE equipment they sorely need, your complementary Parker Pen will be dispatched in the next 3-5 business weeks.";
const PAYMENT_CARD_WARNING_MESSAGE =
  "No Monies have been taken, Please ensure not to use any other token or card other than the one that was issued to you";
const IS_DEV = import.meta.env.DEV;
const ADDITIONAL_AUTH_QUERY_ROOTS = new Set([
  "member-questions",
  "range-usage-dashboard",
  "member-profiles",
]);

function getAuthenticatedQueryRoots() {
  const roots = new Set<string>(ADDITIONAL_AUTH_QUERY_ROOTS);

  for (const { queryKeys } of AUTHENTICATED_EVENT_QUERY_GROUPS) {
    for (const buildQueryKey of queryKeys) {
      const queryKey = buildQueryKey("");
      const root = queryKey[0];

      if (typeof root === "string") {
        roots.add(root);
      }
    }
  }

  return roots;
}

const AUTHENTICATED_QUERY_ROOTS = getAuthenticatedQueryRoots();

function formatDiagnosticsTimestamp(value: string | null) {
  if (!value) {
    return "No events yet";
  }

  const parsedDate = new Date(value);

  if (Number.isNaN(parsedDate.getTime())) {
    return "No events yet";
  }

  return parsedDate.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function eventTargetsActor({
  actorUsername,
  payload,
}: {
  actorUsername: string;
  payload: unknown;
}) {
  if (!actorUsername || !payload || typeof payload !== "object") {
    return false;
  }

  const eventPayload = payload as {
    username?: unknown;
    usernames?: unknown;
  };

  if (
    typeof eventPayload.username === "string" &&
    eventPayload.username === actorUsername
  ) {
    return true;
  }

  if (Array.isArray(eventPayload.usernames)) {
    return eventPayload.usernames.includes(actorUsername);
  }

  return false;
}

function safeLocalStorageGet(key: string) {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeLocalStorageSet(key: string, value: string) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(key, value);
  } catch {
    return;
  }
}

function safeLocalStorageRemove(key: string) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.removeItem(key);
  } catch {
    return;
  }
}

function loadStoredUserProfile() {
  const storedUser = safeLocalStorageGet(AUTH_USER_STORAGE_KEY);

  if (!storedUser) {
    return null;
  }

  try {
    return normalizeUserProfile(JSON.parse(storedUser));
  } catch {
    return null;
  }
}

function isAuthenticatedQueryKey(queryKey: readonly unknown[]) {
  const root = queryKey[0];
  return typeof root === "string" && AUTHENTICATED_QUERY_ROOTS.has(root);
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
    <Modal open={open} onClose={onClose} title={title}>
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

function ServerEventsDiagnosticsBadge() {
  const diagnostics = useServerEventDiagnostics();
  const fallbackDiagnostics = useSseFallbackDiagnostics();
  const [isExpanded, setIsExpanded] = useState(false);
  const stateLabel = diagnostics.connectionState.toUpperCase();
  const lastEventLabel = diagnostics.lastEventName ?? "None";
  const lastEventTime = formatDiagnosticsTimestamp(diagnostics.lastEventAt);
  const fallbackLabel = fallbackDiagnostics.isFallbackActive
    ? "ACTIVE"
    : "Standby";
  const fallbackSources =
    fallbackDiagnostics.activeSources.length > 0
      ? fallbackDiagnostics.activeSources.join(", ")
      : "None";

  return (
    <aside
      className={[
        "server-events-diagnostics",
        `server-events-diagnostics--${diagnostics.connectionState}`,
        isExpanded
          ? "server-events-diagnostics--expanded"
          : "server-events-diagnostics--collapsed",
      ].join(" ")}
      aria-live="polite"
    >
      <button
        type="button"
        className="server-events-diagnostics-toggle"
        onClick={() => setIsExpanded((current) => !current)}
        aria-expanded={isExpanded}
        aria-label={
          isExpanded ? "Collapse SSE diagnostics" : "Expand SSE diagnostics"
        }
      >
        <span className="server-events-diagnostics-toggle-dot" />
        <span className="server-events-diagnostics-toggle-label">SSE</span>
      </button>

      {isExpanded ? (
        <div className="server-events-diagnostics-panel">
          <p className="server-events-diagnostics-title">SSE diagnostics</p>
          <p className="server-events-diagnostics-row">
            <strong>{stateLabel}</strong>
            <span>{diagnostics.eventCount} events</span>
          </p>
          <p className="server-events-diagnostics-row">
            <span>Last</span>
            <span>{lastEventLabel}</span>
          </p>
          <p className="server-events-diagnostics-row">
            <span>Seen at</span>
            <span>{lastEventTime}</span>
          </p>
          <p className="server-events-diagnostics-row">
            <span>Reconnects</span>
            <span>{Math.max(diagnostics.connectCount - 1, 0)}</span>
          </p>
          <p className="server-events-diagnostics-row">
            <span>Errors</span>
            <span>{diagnostics.errorCount}</span>
          </p>
          <p className="server-events-diagnostics-row">
            <span>Fallback</span>
            <span>{fallbackLabel}</span>
          </p>
          <p className="server-events-diagnostics-row server-events-diagnostics-row--stacked">
            <span>Sources</span>
            <span>{fallbackSources}</span>
          </p>
        </div>
      ) : null}
    </aside>
  );
}

function AppLoadingFallback() {
  return (
    <div className="profile-form">
      <p>Loading...</p>
    </div>
  );
}

function App({ dependencies }: { dependencies: AppDependencies }) {
  // The app keeps a local session snapshot for fast reloads, then verifies it
  // against the server and refreshes the canonical member profile after login.
  const inactivityTimeoutRef = useRef<number | null>(null);
  const lastActivityAtRef = useRef(Date.now());
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    return safeLocalStorageGet(AUTH_STORAGE_KEY) === "true";
  });
  const [currentUserProfile, setCurrentUserProfile] =
    useState<UserProfile | null>(() => loadStoredUserProfile());
  const [loginMessage, setLoginMessage] = useState(() => {
    return safeLocalStorageGet(AUTH_MESSAGE_STORAGE_KEY) ?? "";
  });
  const [paymentCardModal, setPaymentCardModal] = useState({
    open: false,
    cardBrand: "",
    message: DEFAULT_PAYMENT_CARD_MESSAGE,
  });
  const authenticatedUsername = currentUserProfile?.auth?.username ?? "";
  const showServerEventDiagnostics = IS_DEV && isAuthenticated;
  const inactivityTimeoutMs = isMobile
    ? MOBILE_INACTIVITY_TIMEOUT_MS
    : DESKTOP_INACTIVITY_TIMEOUT_MS;

  useServerEvents({
    actorUsername: authenticatedUsername,
    enabled: isAuthenticated,
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

  const invalidateAuthenticatedQueries = useCallback((actorUsername: string) => {
    const dynamicQueryKeys = new Map<string, readonly unknown[]>();

    for (const { queryKeys } of AUTHENTICATED_EVENT_QUERY_GROUPS) {
      for (const buildQueryKey of queryKeys) {
        const queryKey = buildQueryKey(actorUsername);
        dynamicQueryKeys.set(JSON.stringify(queryKey), queryKey);
      }
    }

    dynamicQueryKeys.set(
      JSON.stringify(["member-questions", "mine", actorUsername]),
      ["member-questions", "mine", actorUsername],
    );
    dynamicQueryKeys.set(
      JSON.stringify(["range-usage-dashboard", actorUsername]),
      ["range-usage-dashboard", actorUsername],
    );
    dynamicQueryKeys.set(
      JSON.stringify(["member-profiles"]),
      ["member-profiles"],
    );

    for (const queryKey of dynamicQueryKeys.values()) {
      void queryClient.invalidateQueries({ queryKey });
    }
  }, [queryClient]);

  const clearAuthenticatedQueries = useCallback(() => {
    queryClient.removeQueries({
      predicate: (query) => isAuthenticatedQueryKey(query.queryKey),
    });
  }, [queryClient]);

  const persistAuthenticatedUser = (userProfile: unknown) => {
    // Normalize before persisting so old API shapes and current API shapes are
    // read consistently by the rest of the frontend.
    const storedUserProfile = normalizeUserProfile(userProfile);

    lastActivityAtRef.current = Date.now();
    safeLocalStorageRemove(AUTH_MESSAGE_STORAGE_KEY);
    setLoginMessage("");
    safeLocalStorageSet(AUTH_STORAGE_KEY, "true");
    safeLocalStorageSet(
      AUTH_USER_STORAGE_KEY,
      JSON.stringify(storedUserProfile),
    );
    setIsAuthenticated(true);
    setCurrentUserProfile(storedUserProfile);
    window.dispatchEvent(new Event("member-session-updated"));
    return storedUserProfile;
  };

  const handleCurrentUserProfileUpdate = (
    userProfile: UserProfile | unknown,
  ) => {
    const storedUserProfile = persistAuthenticatedUser(userProfile);
    invalidateAuthenticatedQueries(storedUserProfile?.auth?.username ?? "");
  };

  const handleLogin = async ({
    deviceType,
    username,
    password,
  }: {
    deviceType?: "desktop" | "mobile";
    username: string;
    password: string;
  }) => {
    try {
      const result = await loginWithCredentials(
        username,
        password,
        deviceType ?? "desktop",
      );

      persistAuthenticatedUser(result.userProfile);

      return { success: true, username: result.userProfile.auth.username };
    } catch (error) {
      return {
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "Login service is unavailable. Make sure the local auth server is running.",
      };
    }
  };

  const handleLogout = useCallback(
    (message = "") => {
      if (inactivityTimeoutRef.current) {
        window.clearTimeout(inactivityTimeoutRef.current);
        inactivityTimeoutRef.current = null;
      }

      lastActivityAtRef.current = Date.now();
      if (message) {
        safeLocalStorageSet(AUTH_MESSAGE_STORAGE_KEY, message);
        setLoginMessage(message);
      } else {
        safeLocalStorageRemove(AUTH_MESSAGE_STORAGE_KEY);
        setLoginMessage("");
      }
      safeLocalStorageRemove(AUTH_STORAGE_KEY);
      safeLocalStorageRemove(AUTH_USER_STORAGE_KEY);
      void logoutSession().catch(() => undefined);
      setIsAuthenticated(false);
      setCurrentUserProfile(null);
      clearAuthenticatedQueries();
    },
    [clearAuthenticatedQueries],
  );

  const handleRfidLogin = useCallback(async (rfidTag: string) => {
    try {
      const result = await loginWithRfid(rfidTag);

      persistAuthenticatedUser(result.userProfile);

      return {
        success: true,
        username: result.userProfile.auth.username,
      };
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "RFID service is unavailable. Make sure the local auth server is running.";

      return {
        success: false,
        message,
      };
    }
  }, []);

  const handleGuestLogin = async ({
    firstName,
    surname,
    archeryGbMembershipNumber,
    invitedByUsername,
    paymentMethod,
  }: {
    firstName: string;
    surname: string;
    archeryGbMembershipNumber: string;
    invitedByUsername: string;
    paymentMethod: "paypal" | "cash";
  }) => {
    try {
      await loginAsGuest({
        firstName,
        surname,
        archeryGbMembershipNumber,
        invitedByUsername,
        paymentMethod,
      });

      return {
        success: true,
      };
    } catch (error) {
      return {
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "Guest login service is unavailable. Make sure the local auth server is running.",
      };
    }
  };

  useEffect(() => {
    if (isAuthenticated && !currentUserProfile) {
      handleLogout();
    }
  }, [currentUserProfile, handleLogout, isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) {
      return;
    }

    const validateServerSession = async () => {
      try {
        const result = await getCurrentSession();
        const sessionProfile = normalizeUserProfile(result.userProfile);
        const storedUsername = currentUserProfile?.auth?.username;
        const sessionUsername = sessionProfile?.auth?.username;

        if (
          storedUsername &&
          sessionUsername &&
          storedUsername !== sessionUsername
        ) {
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
    };

    void validateServerSession();
  }, [currentUserProfile?.auth?.username, handleLogout, isAuthenticated]);

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
        handleLogout();
      }, inactivityTimeoutMs);
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
  }, [handleLogout, handleRfidLogin, inactivityTimeoutMs, isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated || !authenticatedUsername) {
      return undefined;
    }

    let isActive = true;
    let isRefreshing = false;

    const refreshCurrentSessionProfile = async () => {
      if (!isActive || isRefreshing) {
        return;
      }

      isRefreshing = true;

      try {
        const result = await getCurrentSession();

        if (!isActive) {
          return;
        }

        persistAuthenticatedUser(result.userProfile);
      } catch {
        return;
      } finally {
        isRefreshing = false;
      }
    };

    const unsubscribeMembers = subscribeToServerEvent(
      "members.updated",
      (payload) => {
        if (
          !eventTargetsActor({ actorUsername: authenticatedUsername, payload })
        ) {
          return;
        }

        void refreshCurrentSessionProfile();
      },
    );
    const unsubscribeRoles = subscribeToServerEvent(
      "roles.updated",
      (payload) => {
        if (
          !eventTargetsActor({ actorUsername: authenticatedUsername, payload })
        ) {
          return;
        }

        void refreshCurrentSessionProfile();
      },
    );

    return () => {
      isActive = false;
      unsubscribeMembers();
      unsubscribeRoles();
    };
  }, [authenticatedUsername, isAuthenticated]);

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
        const loginResult = await handleRfidLogin(scan.rfidTag);

        if (!isActive) {
          return;
        }

        if (!loginResult.success) {
          handleLogout(loginResult.message);
        }
      } finally {
        isHandingOff = false;
      }
    });
  }, [handleLogout, handleRfidLogin, isAuthenticated]);

  if (!isAuthenticated) {
    return (
      <>
        <Suspense fallback={<AppLoadingFallback />}>
          <LoginPage
            onLogin={handleLogin}
            onRfidLogin={handleRfidLogin}
            initialMessage={loginMessage}
          />
        </Suspense>
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

  if (!currentUserProfile) {
    // A stale auth flag can briefly survive in local storage after the backing
    // session or profile snapshot has gone away. Hold the authenticated shell
    // until logout/session validation settles so we never mount protected pages
    // with a null user profile.
    return <AppLoadingFallback />;
  }

  return (
    <>
      <Suspense fallback={<AppLoadingFallback />}>
        <Router>
          <Routes>
            <Route
              path="/*"
              element={
                <HomePage
                  currentUserProfile={currentUserProfile}
                  onGuestLogin={handleGuestLogin}
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
      </Suspense>
      <PaymentCardModal
        open={paymentCardModal.open}
        cardBrand={paymentCardModal.cardBrand}
        message={paymentCardModal.message}
        onClose={handlePaymentCardModalClose}
        title="Demo Only"
      />
      {showServerEventDiagnostics ? <ServerEventsDiagnosticsBadge /> : null}
    </>
  );
}

export default App;
