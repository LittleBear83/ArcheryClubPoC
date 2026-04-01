import { useState } from "react";
import selbyLogo from "../../assets/selby_Archery_Logo.svg";

const SIMULATED_RFID_TAG = "RFID-CFLEETHAM-001";

export function LoginPage({
  onGuestLogin,
  onLogin,
  onRfidLogin,
  seededUsername,
}) {
  const [username, setUsername] = useState(seededUsername);
  const [password, setPassword] = useState("");
  const [guestFirstName, setGuestFirstName] = useState("");
  const [guestSurname, setGuestSurname] = useState("");
  const [guestMembershipNumber, setGuestMembershipNumber] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

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

    if (membershipDigits.length < 7) {
      setError("Archery GB membership number must contain at least 7 digits.");
      return;
    }

    setIsSubmitting(true);

    const result = await onGuestLogin({
      firstName: guestFirstName,
      surname: guestSurname,
      archeryGbMembershipNumber: guestMembershipNumber,
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
    setIsSubmitting(true);
    const result = await onRfidLogin(SIMULATED_RFID_TAG);

    if (!result.success) {
      setError(result.message);
      setIsSubmitting(false);
      return;
    }

    setError("");
    setIsSubmitting(false);
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
    </main>
  );
}
