import "./App.css";
import { useEffect, useRef, useState } from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import { HomePage } from "./presentation/pages/HomePage";
import { LoginPage } from "./presentation/pages/LoginPage";
import { InMemoryMemberDataSource } from "./data/sources/InMemoryMemberDataSource";
import { MemberRepositoryImpl } from "./data/repositories/MemberRepositoryImpl";
import { GetMembersUseCase } from "./usecases/GetMembersUseCase";
import { AddMemberUseCase } from "./usecases/AddMemberUseCase";
import { normalizeUserProfile } from "./utils/userProfile";

const AUTH_STORAGE_KEY = "archeryclubpoc-authenticated";
const AUTH_USER_STORAGE_KEY = "archeryclubpoc-authenticated-user";
const AUTH_MESSAGE_STORAGE_KEY = "archeryclubpoc-auth-message";
const DEFAULT_USERNAME = "Cfleetham";
const INACTIVITY_TIMEOUT_MS = 120000;
const RFID_SESSION_HANDOFF_IDLE_MS = 30000;

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
        message: "Login service is unavailable. Make sure the local auth server is running.",
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
        message: "RFID service is unavailable. Make sure the local auth server is running.",
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
        message: "Guest login service is unavailable. Make sure the local auth server is running.",
      };
    }
  };

  useEffect(() => {
    if (isAuthenticated && !currentUserProfile) {
      handleLogout();
    }
  }, [currentUserProfile, isAuthenticated]);

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
        handleLogout();
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

    const pollForIdleSessionRfidHandoff = async () => {
      if (!isActive || isHandingOff) {
        return;
      }

      const idleForMs = Date.now() - lastActivityAtRef.current;

      if (idleForMs < RFID_SESSION_HANDOFF_IDLE_MS) {
        return;
      }

      try {
        const response = await fetch("/api/auth/rfid/latest-scan", {
          cache: "no-store",
        });
        const result = await response.json();

        if (!isActive || !response.ok || !result.success || !result.scan?.rfidTag) {
          return;
        }

        isHandingOff = true;
        const loginResult = await handleRfidLogin(result.scan.rfidTag);

        if (!isActive) {
          return;
        }

        if (!loginResult.success) {
          handleLogout(loginResult.message);
          return;
        }
      } catch {
        return;
      } finally {
        isHandingOff = false;
      }
    };

    const intervalId = window.setInterval(pollForIdleSessionRfidHandoff, 1500);

    return () => {
      isActive = false;
      window.clearInterval(intervalId);
    };
  }, [isAuthenticated]);

  if (!isAuthenticated) {
    return (
      <LoginPage
        onGuestLogin={handleGuestLogin}
        onLogin={handleLogin}
        onRfidLogin={handleRfidLogin}
        initialMessage={loginMessage}
        seededUsername={DEFAULT_USERNAME}
      />
    );
  }

  return (
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
  );
}

export default App;
