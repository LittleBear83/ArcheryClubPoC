import { useState } from "react";
import { Button } from "./Button";

type GuestLoginResult = {
  success: boolean;
  message?: string;
};

type GuestLoginFormProps = {
  invitingMemberName: string;
  invitedByUsername: string;
  onGuestLogin: (details: {
    firstName: string;
    surname: string;
    archeryGbMembershipNumber: string;
    invitedByUsername: string;
    paymentMethod: "paypal" | "cash";
  }) => Promise<GuestLoginResult>;
};

export function GuestLoginForm({
  invitingMemberName,
  invitedByUsername,
  onGuestLogin,
}: GuestLoginFormProps) {
  const [guestFirstName, setGuestFirstName] = useState("");
  const [guestSurname, setGuestSurname] = useState("");
  const [guestMembershipNumber, setGuestMembershipNumber] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    const membershipDigits = guestMembershipNumber.replace(/\D/g, "");

    if (!invitedByUsername) {
      setError("The signed-in member could not be identified.");
      setSuccessMessage("");
      return;
    }

    if (membershipDigits.length < 7) {
      setError("Archery GB membership number must contain at least 7 digits.");
      setSuccessMessage("");
      return;
    }

    if (paymentMethod !== "paypal" && paymentMethod !== "cash") {
      setError("Select a payment method before signing in the guest.");
      setSuccessMessage("");
      return;
    }

    setIsSubmitting(true);

    const result = await onGuestLogin({
      firstName: guestFirstName,
      surname: guestSurname,
      archeryGbMembershipNumber: guestMembershipNumber,
      invitedByUsername,
      paymentMethod,
    });

    if (!result.success) {
      setError(result.message ?? "Unable to sign in this guest right now.");
      setSuccessMessage("");
      setIsSubmitting(false);
      return;
    }

    setError("");
    setSuccessMessage("Guest signed in successfully.");
    setGuestFirstName("");
    setGuestSurname("");
    setGuestMembershipNumber("");
    setPaymentMethod("");
    setIsSubmitting(false);
  };

  return (
    <form className="login-form" onSubmit={handleSubmit} autoComplete="off">
      {error ? (
        <p className="login-error login-error-banner" role="alert">
          {error}
        </p>
      ) : null}
      {successMessage ? (
        <p className="profile-success" role="status">
          {successMessage}
        </p>
      ) : null}

      <label>
        First name
        <input
          type="text"
          value={guestFirstName}
          onChange={(event) => setGuestFirstName(event.target.value)}
          autoComplete="off"
          name="guest-first-name"
          disabled={isSubmitting}
          required
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
          required
        />
      </label>

      <label>
        Member
        <input
          type="text"
          value={invitingMemberName}
          name="guest-inviting-member"
          disabled
          readOnly
        />
      </label>

      <label>
        Archery GB membership number
        <input
          type="text"
          value={guestMembershipNumber}
          onChange={(event) => setGuestMembershipNumber(event.target.value)}
          inputMode="numeric"
          autoComplete="off"
          name="guest-membership-number"
          disabled={isSubmitting}
          required
        />
      </label>

      <label>
        Payment
        <select
          value={paymentMethod}
          onChange={(event) => {
            setPaymentMethod(event.target.value);
            setError("");
          }}
          name="guest-payment-method"
          disabled={isSubmitting}
          required
        >
          <option value="">Select payment method</option>
          <option value="paypal">PayPal</option>
          <option value="cash">Cash</option>
        </select>
      </label>

      <Button
        type="submit"
        className="guest-submit-button"
        disabled={isSubmitting}
      >
        {isSubmitting ? "Signing In Guest..." : "Guest Sign In"}
      </Button>
    </form>
  );
}
