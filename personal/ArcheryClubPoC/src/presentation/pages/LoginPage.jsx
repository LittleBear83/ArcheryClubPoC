import { useEffect, useState } from "react";
import selbyLogo from "../../assets/selby_Archery_Logo.svg";
import { Modal } from "../components/Modal";

const SIMULATED_RFID_TAG = "RFID-CFLEETHAM-001";

export function LoginPage({
  onGuestLogin,
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
  const [rangeMembers, setRangeMembers] = useState([]);
  const [allMembers, setAllMembers] = useState([]);
  const [selectedInvitingMemberUsername, setSelectedInvitingMemberUsername] =
    useState("");
  const [memberSearchSurname, setMemberSearchSurname] = useState("");
  const [isInvitingMemberModalOpen, setIsInvitingMemberModalOpen] =
    useState(false);
  const [lastHandledRfidSequence, setLastHandledRfidSequence] = useState(0);
  const [error, setError] = useState(initialMessage);
  const [isSubmitting, setIsSubmitting] = useState(false);

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

  useEffect(() => {
    setError(initialMessage);
  }, [initialMessage]);

  useEffect(() => {
    let isActive = true;

    const loadGuestInviterOptions = async () => {
      try {
        const [rangeMembersResponse, allMembersResponse] = await Promise.all([
          fetch("/api/range-members"),
          fetch("/api/guest-inviter-members"),
        ]);

        const [rangeMembersResult, allMembersResult] = await Promise.all([
          rangeMembersResponse.json(),
          allMembersResponse.json(),
        ]);

        if (!isActive) {
          return;
        }

        if (rangeMembersResponse.ok && rangeMembersResult.success) {
          setRangeMembers(
            (rangeMembersResult.members ?? []).filter(
              (member) => member.accountType === "member",
            ),
          );
        }

        if (allMembersResponse.ok && allMembersResult.success) {
          setAllMembers(allMembersResult.members ?? []);
        }
      } catch {
        if (!isActive) {
          return;
        }

        setRangeMembers([]);
        setAllMembers([]);
      }
    };

    loadGuestInviterOptions();

    return () => {
      isActive = false;
    };
  }, []);

  useEffect(() => {
    let isActive = true;

    const pollForRfidScan = async () => {
      if (isSubmitting) {
        return;
      }

      try {
        const response = await fetch("/api/auth/rfid/latest-scan", {
          cache: "no-store",
        });
        const result = await response.json();

        if (!isActive || !response.ok || !result.success || !result.scan) {
          return;
        }

        if (
          result.scan.sequence <= lastHandledRfidSequence ||
          !result.scan.rfidTag
        ) {
          return;
        }

        setLastHandledRfidSequence(result.scan.sequence);
        await attemptRfidLogin(result.scan.rfidTag);
      } catch {
        if (isActive) {
          setIsSubmitting(false);
        }
      }
    };

    pollForRfidScan();
    const intervalId = window.setInterval(pollForRfidScan, 1500);

    return () => {
      isActive = false;
      window.clearInterval(intervalId);
    };
  }, [isSubmitting, lastHandledRfidSequence, onRfidLogin]);

  const filteredAllMembers = allMembers.filter((member) =>
    memberSearchSurname.trim()
      ? member.surname
          .toLowerCase()
          .includes(memberSearchSurname.trim().toLowerCase())
      : false,
  );
  const selectedInvitingMember =
    allMembers.find(
      (member) => member.username === selectedInvitingMemberUsername,
    ) ??
    rangeMembers.find(
      (member) => member.auth?.username === selectedInvitingMemberUsername,
    ) ??
    null;
  const isSelectedInvitingMemberAtRange = rangeMembers.some(
    (member) => member.auth?.username === selectedInvitingMemberUsername,
  );

  const openInvitingMemberModal = () => {
    setMemberSearchSurname("");
    setIsInvitingMemberModalOpen(true);
  };

  const handleSelectInvitingMember = (member) => {
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

          {error ? (
            <p className="login-error login-error-banner" role="alert">
              {error}
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

              <button
                type="submit"
                className="login-submit"
                disabled={isSubmitting}
              >
                {isSubmitting ? "Signing In..." : "Log In"}
              </button>
            </form>

            <section className="rfid-panel" aria-label="RFID sign in">
              <p className="section-title">RFID Access</p>
              <p className="rfid-copy">
                Tap your club card to sign in. For now, use the simulator below
                for the {seededUsername} account.
              </p>
              <button
                type="button"
                className="rfid-simulate-button"
                onClick={handleSimulatedRfid}
                disabled={isSubmitting}
              >
                {isSubmitting ? "Checking RFID..." : "Simulate RFID Tap"}
              </button>
            </section>
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
                      openInvitingMemberModal();
                      return;
                    }

                    setSelectedInvitingMemberUsername(event.target.value);
                    setError("");
                  }}
                  name="guest-inviting-member"
                  disabled={isSubmitting}
                >
                  <option value="">
                    Select a member currently at the range
                  </option>
                  {rangeMembers.map((member) => (
                    <option
                      key={member.auth.username}
                      value={member.auth.username}
                    >
                      {member.personal.fullName}
                    </option>
                  ))}
                  {selectedInvitingMember &&
                  !isSelectedInvitingMemberAtRange ? (
                    <option value={selectedInvitingMemberUsername}>
                      {(selectedInvitingMember.fullName ??
                        selectedInvitingMember.personal?.fullName) +
                        " (selected from club list)"}
                    </option>
                  ) : null}
                  <option value={INVITING_MEMBER_NOT_LISTED}>
                    Inviting member is not on this list
                  </option>
                </select>
              </label>

              {selectedInvitingMember ? (
                <p className="guest-inviting-member-summary">
                  Invited by{" "}
                  <strong>
                    {selectedInvitingMember.fullName ??
                      selectedInvitingMember.personal?.fullName}
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

              <button
                type="submit"
                className="guest-submit-button"
                disabled={isSubmitting}
              >
                {isSubmitting ? "Signing In Guest..." : "Guest Sign In"}
              </button>
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
            {filteredAllMembers.length > 0 ? (
              filteredAllMembers.map((member) => (
                <button
                  key={member.username}
                  type="button"
                  className="guest-member-modal-option"
                  onClick={() => handleSelectInvitingMember(member)}
                >
                  <span>{member.fullName}</span>
                </button>
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
