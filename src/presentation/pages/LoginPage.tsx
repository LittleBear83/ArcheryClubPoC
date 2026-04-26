import { useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import selbyLogo from "../../assets/selby_Archery_Logo.svg";
import { Button } from "../components/Button";
import { Modal } from "../components/Modal";
import { formatMemberDisplayName } from "../../utils/userProfile";
import { getRfidReaderStatus, listGuestInviterMembers } from "../../api/authApi";
import { listRangeMembers } from "../../api/memberApi";

const SIMULATED_RFID_TAG = "7673CF3D";
const RFID_LOGIN_POLL_INTERVAL_MS = 1500;
const ENABLE_RFID_SIMULATOR =
  import.meta.env.DEV || import.meta.env.VITE_ENABLE_RFID_SIMULATOR === "true";
const RFID_READER_MISSING_MESSAGE =
  "Card reader not detected, please use your username and password to sign in";

type RangeMember = {
  accountType: string;
  auth: { username: string };
  personal: { fullName: string };
  membership?: { role?: string };
};

type ClubMember = {
  username: string;
  surname: string;
  userType?: string;
  fullName?: string;
  personal?: { fullName: string };
};

function getMemberDisplayName(member: RangeMember | ClubMember | null) {
  if (!member) {
    return "";
  }

  return formatMemberDisplayName(member) || ("username" in member ? member.username : member.auth.username);
}

export function LoginPage({
  onGuestLogin,
  onLatestRfidLogin,
  onLogin,
  onRfidLogin,
  initialMessage = "",
  seededUsername,
}) {
  const INVITING_MEMBER_NOT_LISTED = "__inviting-member-not-listed__";
  const [username, setUsername] = useState(seededUsername);
  const [password, setPassword] = useState("");
  const [guestFirstName, setGuestFirstName] = useState("");
  const [guestSurname, setGuestSurname] = useState("");
  const [guestMembershipNumber, setGuestMembershipNumber] = useState("");
  const [selectedInvitingMemberUsername, setSelectedInvitingMemberUsername] =
    useState("");
  const [memberSearchSurname, setMemberSearchSurname] = useState("");
  const [isInvitingMemberModalOpen, setIsInvitingMemberModalOpen] =
    useState(false);
  const [error, setError] = useState(initialMessage);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const latestRfidLoginInFlightRef = useRef(false);
  const latestRfidLoginUnavailableRef = useRef(false);
  const rfidReaderStatusQuery = useQuery({
    queryKey: ["rfid-reader-status"],
    queryFn: getRfidReaderStatus,
    retry: false,
    refetchInterval: 10000,
  });

  const guestInviterOptionsQuery = useQuery({
    queryKey: ["guest-inviter-options"],
    queryFn: async () => {
      const [rangeMembersResult, allMembersResult] = await Promise.all([
        listRangeMembers(),
        listGuestInviterMembers(),
      ]);

      return {
        rangeMembers: ((rangeMembersResult.members ?? []) as RangeMember[]).filter(
          (member) => member.accountType === "member",
        ),
        allMembers: (allMembersResult.members ?? []) as ClubMember[],
      };
    },
    enabled: false,
  });

  const rangeMembers = useMemo(
    () => guestInviterOptionsQuery.data?.rangeMembers ?? [],
    [guestInviterOptionsQuery.data?.rangeMembers],
  );
  const allMembers = useMemo(
    () => guestInviterOptionsQuery.data?.allMembers ?? [],
    [guestInviterOptionsQuery.data?.allMembers],
  );

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
      setError("RFID service is unavailable. Make sure the local auth server is running.");
    } finally {
      setIsSubmitting(false);
    }
  };
  const attemptLatestRfidLoginEvent = useEffectEvent(async () => {
    if (
      isSubmitting ||
      latestRfidLoginInFlightRef.current ||
      latestRfidLoginUnavailableRef.current
    ) {
      return;
    }

    latestRfidLoginInFlightRef.current = true;

    try {
      const loginResult = await onLatestRfidLogin();

      if (loginResult?.unavailable) {
        latestRfidLoginUnavailableRef.current = true;
        return;
      }

      if (loginResult?.pending) {
        return;
      }

      if (!loginResult?.success) {
        setError(loginResult?.message ?? "Unable to log in with RFID.");
        return;
      }

      setError("");
    } catch {
      setError("RFID service is unavailable. Make sure the local auth server is running.");
    } finally {
      latestRfidLoginInFlightRef.current = false;
    }
  });

  useEffect(() => {
    setError(initialMessage);
  }, [initialMessage]);

  const loginBannerMessage = error
    ? error
    : (
        !initialMessage &&
        rfidReaderStatusQuery.data?.checked &&
        !rfidReaderStatusQuery.data.detected
      )
      ? RFID_READER_MISSING_MESSAGE
      : "";

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      if (latestRfidLoginUnavailableRef.current) {
        window.clearInterval(intervalId);
        return;
      }

      try {
        void attemptLatestRfidLoginEvent();
      } catch {
        setIsSubmitting(false);
      }
    }, RFID_LOGIN_POLL_INTERVAL_MS);

    void attemptLatestRfidLoginEvent();

    return () => {
      window.clearInterval(intervalId);
    };
  }, []);

  const filteredAllMembers = useMemo(() => {
    const normalizedSearch = memberSearchSurname.trim().toLowerCase();

    if (!normalizedSearch) {
      return [];
    }

    return allMembers.filter((member) =>
      member.surname.toLowerCase().includes(normalizedSearch),
    );
  }, [allMembers, memberSearchSurname]);
  const selectedInvitingMember = useMemo(() => {
    return (
      allMembers.find(
        (member) => member.username === selectedInvitingMemberUsername,
      ) ??
      rangeMembers.find(
        (member) => member.auth?.username === selectedInvitingMemberUsername,
      ) ??
      null
    );
  }, [allMembers, rangeMembers, selectedInvitingMemberUsername]);
  const isSelectedInvitingMemberAtRange = useMemo(() => {
    return rangeMembers.some(
      (member) => member.auth?.username === selectedInvitingMemberUsername,
    );
  }, [rangeMembers, selectedInvitingMemberUsername]);

  const openInvitingMemberModal = async () => {
    setMemberSearchSurname("");
    setIsInvitingMemberModalOpen(true);
    setError("");

    if (!guestInviterOptionsQuery.data && !guestInviterOptionsQuery.isFetching) {
      try {
        await guestInviterOptionsQuery.refetch();
      } catch {
        setError("Unable to load the club member list right now.");
      }
    }
  };

  const handleSelectInvitingMember = (member: ClubMember) => {
    setSelectedInvitingMemberUsername(member.username);
    setIsInvitingMemberModalOpen(false);
    setMemberSearchSurname("");
    setError("");
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setIsSubmitting(true);

    const result = await onLogin({ username, password });

    if (!result.success) {
      setError(result.message);
      setIsSubmitting(false);
      return;
    }

    setError("");
    setIsSubmitting(false);
  };

  const handleGuestSubmit = async (event) => {
    event.preventDefault();
    const membershipDigits = guestMembershipNumber.replace(/\D/g, "");

    if (!selectedInvitingMemberUsername) {
      setError("Select the member who invited this guest before signing in.");
      return;
    }

    if (membershipDigits.length < 7) {
      setError("Archery GB membership number must contain at least 7 digits.");
      return;
    }

    setIsSubmitting(true);

    const result = await onGuestLogin({
      firstName: guestFirstName,
      surname: guestSurname,
      archeryGbMembershipNumber: guestMembershipNumber,
      invitedByUsername: selectedInvitingMemberUsername,
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

          {loginBannerMessage ? (
            <p className="login-error login-error-banner" role="alert">
              {loginBannerMessage}
            </p>
          ) : null}
        </div>

        <div className="login-sections">
          <section className="member-panel" aria-label="Member sign in">
            <p className="section-title">Member Sign In</p>
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

            {ENABLE_RFID_SIMULATOR ? (
              <section className="rfid-panel" aria-label="RFID sign in">
                <p className="section-title">RFID Access</p>
                <p className="rfid-copy">
                  Tap your club card to sign in. For now, use the simulator below
                  for the {seededUsername} account.
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
          </section>

          <section className="guest-panel" aria-label="Guest sign in">
            <p className="section-title">Guest Sign In</p>
            <p className="rfid-copy">
              Record a guest visit with their name and Archery GB membership
              number.
            </p>
            <form
              className="login-form"
              onSubmit={handleGuestSubmit}
              autoComplete="off"
            >
              <label>
                First name
                <input
                  type="text"
                  value={guestFirstName}
                  onChange={(event) => setGuestFirstName(event.target.value)}
                  autoComplete="off"
                  name="guest-first-name"
                  disabled={isSubmitting}
                />
              </label>

              <label>
                Surname
                <input
                  type="text"
                  value={guestSurname}
                  onChange={(event) => setGuestSurname(event.target.value)}
                  autoComplete="off"
                  name="guest-surname"
                  disabled={isSubmitting}
                />
              </label>

              <label>
                Attending with:
                <select
                  value={selectedInvitingMemberUsername}
                  onChange={(event) => {
                    if (event.target.value === INVITING_MEMBER_NOT_LISTED) {
                      setSelectedInvitingMemberUsername("");
                      void openInvitingMemberModal();
                      return;
                    }

                    setSelectedInvitingMemberUsername(event.target.value);
                    setError("");
                  }}
                  name="guest-inviting-member"
                  disabled={isSubmitting}
                >
                  <option value="">
                    Enter inviting member username below
                  </option>
                  {rangeMembers.map((member) => (
                    <option
                      key={member.auth.username}
                      value={member.auth.username}
                    >
                      {formatMemberDisplayName(member)}
                    </option>
                  ))}
                  {selectedInvitingMember &&
                  !isSelectedInvitingMemberAtRange ? (
                    <option value={selectedInvitingMemberUsername}>
                      {getMemberDisplayName(selectedInvitingMember) +
                        " (selected from club list)"}
                    </option>
                  ) : null}
                  <option value={INVITING_MEMBER_NOT_LISTED}>
                    Inviting member is not on this list
                  </option>
                </select>
              </label>

              <label>
                Inviting member username
                <input
                  type="text"
                  value={selectedInvitingMemberUsername}
                  onChange={(event) => {
                    setSelectedInvitingMemberUsername(event.target.value);
                    setError("");
                  }}
                  autoComplete="off"
                  name="guest-inviting-member-username"
                  disabled={isSubmitting}
                />
              </label>

              {selectedInvitingMember ? (
                <p className="guest-inviting-member-summary">
                  Invited by{" "}
                  <strong>
                    {getMemberDisplayName(selectedInvitingMember)}
                  </strong>
                </p>
              ) : null}

              <label>
                Archery GB membership number
                <input
                  type="text"
                  value={guestMembershipNumber}
                  onChange={(event) =>
                    setGuestMembershipNumber(event.target.value)
                  }
                  inputMode="numeric"
                  autoComplete="off"
                  name="guest-membership-number"
                  disabled={isSubmitting}
                />
              </label>

              <Button
                type="submit"
                className="guest-submit-button"
                disabled={isSubmitting}
              >
                {isSubmitting ? "Signing In Guest..." : "Guest Sign In"}
              </Button>
            </form>
          </section>
        </div>
      </section>

      <Modal
        open={isInvitingMemberModalOpen}
        onClose={() => {
          setIsInvitingMemberModalOpen(false);
          setMemberSearchSurname("");
        }}
        title="Find Inviting Member"
      >
        <div className="guest-member-modal">
          <p className="guest-member-modal-copy">
            Start typing the inviting member&apos;s surname, then select them
            from the filtered club member list.
          </p>

          <label className="guest-member-modal-search">
            Inviting member surname
            <input
              type="text"
              value={memberSearchSurname}
              onChange={(event) => setMemberSearchSurname(event.target.value)}
              autoComplete="off"
              name="guest-inviting-member-search"
            />
          </label>

          <div className="guest-member-modal-results" role="list">
            {guestInviterOptionsQuery.isFetching ? (
              <p className="guest-member-modal-empty">
                Loading club members...
              </p>
            ) : guestInviterOptionsQuery.isError ? (
              <p className="guest-member-modal-empty">
                Unable to load the club member list right now.
              </p>
            ) : filteredAllMembers.length > 0 ? (
              filteredAllMembers.map((member) => (
                <Button
                  key={member.username}
                  type="button"
                  className="guest-member-modal-option"
                  onClick={() => handleSelectInvitingMember(member)}
                  variant="unstyled"
                >
                  <span>{formatMemberDisplayName(member)}</span>
                </Button>
              ))
            ) : (
              <p className="guest-member-modal-empty">
                {memberSearchSurname.trim()
                  ? "No club members match that surname yet."
                  : "Start typing a surname to filter the club member list."}
              </p>
            )}
          </div>
        </div>
      </Modal>
    </main>
  );
}
