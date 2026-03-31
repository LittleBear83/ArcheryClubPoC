import "./App.css";
import { useEffect, useRef, useState } from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import { HomePage } from "./presentation/pages/HomePage";
import { LoginPage } from "./presentation/pages/LoginPage";
import { InMemoryMemberDataSource } from "./data/sources/InMemoryMemberDataSource";
import { MemberRepositoryImpl } from "./data/repositories/MemberRepositoryImpl";
import { GetMembersUseCase } from "./usecases/GetMembersUseCase";
import { AddMemberUseCase } from "./usecases/AddMemberUseCase";

const AUTH_STORAGE_KEY = "archeryclubpoc-authenticated";
const AUTH_USER_STORAGE_KEY = "archeryclubpoc-authenticated-user";
const DEFAULT_USERNAME = "Cfleetham";
const INACTIVITY_TIMEOUT_MS = 120000;

const dataSource = new InMemoryMemberDataSource();
const memberRepository = new MemberRepositoryImpl({ dataSource });
const getMembersUseCase = new GetMembersUseCase({ memberRepository });
const addMemberUseCase = new AddMemberUseCase({ memberRepository });

function App() {
  const inactivityTimeoutRef = useRef(null);
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    return window.localStorage.getItem(AUTH_STORAGE_KEY) === "true";
  });
  const [currentUser, setCurrentUser] = useState(() => {
    const storedUser = window.localStorage.getItem(AUTH_USER_STORAGE_KEY);

    if (!storedUser) {
      return null;
    }

    try {
      return JSON.parse(storedUser);
    } catch {
      return null;
    }
  });

  const persistAuthenticatedUser = (user) => {
    const storedUser = {
      username: user.username,
      firstName: user.firstName,
      surname: user.surname,
      userType: user.userType,
      archeryGbMembershipNumber: user.archeryGbMembershipNumber ?? null,
    };

    window.localStorage.setItem(AUTH_STORAGE_KEY, "true");
    window.localStorage.setItem(
      AUTH_USER_STORAGE_KEY,
      JSON.stringify(storedUser),
    );
    window.history.replaceState({}, "", "/");
    setIsAuthenticated(true);
    setCurrentUser(storedUser);
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

      persistAuthenticatedUser(result.user);

      return { success: true, username: result.user.username };
    } catch {
      return {
        success: false,
        message: "Login service is unavailable. Make sure the local auth server is running.",
      };
    }
  };

  const handleLogout = () => {
    if (inactivityTimeoutRef.current) {
      window.clearTimeout(inactivityTimeoutRef.current);
      inactivityTimeoutRef.current = null;
    }

    window.localStorage.removeItem(AUTH_STORAGE_KEY);
    window.localStorage.removeItem(AUTH_USER_STORAGE_KEY);
    setIsAuthenticated(false);
    setCurrentUser(null);
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

      persistAuthenticatedUser(result.user);

      return {
        success: true,
        username: result.user.username,
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
        }),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        return {
          success: false,
          message: result.message ?? "Unable to create guest login.",
        };
      }

      persistAuthenticatedUser(result.user);

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
    if (!isAuthenticated) {
      return undefined;
    }

    const resetInactivityTimeout = () => {
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

  if (!isAuthenticated) {
    return (
      <LoginPage
        onGuestLogin={handleGuestLogin}
        onLogin={handleLogin}
        onRfidLogin={handleRfidLogin}
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
              currentUser={currentUser}
              onLogout={handleLogout}
            />
          }
        />
      </Routes>
    </Router>
  );
}

export default App;
