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
  const [fieldErrors, setFieldErrors] = useState({
    guestFirstName: false,
    guestSurname: false,
    guestMembershipNumber: false,
    paymentMethod: false,
  });
  const [guestFirstName, setGuestFirstName] = useState("");
  const [guestSurname, setGuestSurname] = useState("");
  const [guestMembershipNumber, setGuestMembershipNumber] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"" | "paypal" | "cash">("");
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  function isValidPaymentMethod(value: string): value is "paypal" | "cash" {
    return value === "paypal" || value === "cash";
  }

  const handleSubmit = async (event) => {
    event.preventDefault();
    const membershipDigits = guestMembershipNumber.replace(/\D/g, "");
    const nextFieldErrors = {
      guestFirstName: guestFirstName.trim().length === 0,
      guestSurname: guestSurname.trim().length === 0,
      guestMembershipNumber: membershipDigits.length < 7,
      paymentMethod: paymentMethod !== "paypal" && paymentMethod !== "cash",
    };

    setFieldErrors(nextFieldErrors);

    if (!invitedByUsername) {
      setError("The signed-in member could not be identified.");
      setSuccessMessage("");
      return;
    }

    if (nextFieldErrors.guestFirstName || nextFieldErrors.guestSurname) {
      setError("Complete all required guest details before booking in the guest.");
      setSuccessMessage("");
      return;
    }

    if (nextFieldErrors.guestMembershipNumber) {
      setError("Archery GB membership number must contain at least 7 digits.");
      setSuccessMessage("");
      return;
    }

    if (nextFieldErrors.paymentMethod) {
      setError("Select a payment method before signing in the guest.");
      setSuccessMessage("");
      return;
    }

    const selectedPaymentMethod = isValidPaymentMethod(paymentMethod)
      ? paymentMethod
      : null;

    if (!selectedPaymentMethod) {
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
      paymentMethod: selectedPaymentMethod,
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
    setFieldErrors({
      guestFirstName: false,
      guestSurname: false,
      guestMembershipNumber: false,
      paymentMethod: false,
    });
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

      <label className={fieldErrors.guestFirstName ? "login-form-field--invalid" : ""}>
        First name
        <input
          type="text"
          value={guestFirstName}
          onChange={(event) => {
            setGuestFirstName(event.target.value);
            setFieldErrors((current) => ({
              ...current,
              guestFirstName: event.target.value.trim().length === 0,
            }));
            setError("");
          }}
          autoComplete="off"
          name="guest-first-name"
          disabled={isSubmitting}
          aria-invalid={fieldErrors.guestFirstName}
          required
        />
      </label>

      <label className={fieldErrors.guestSurname ? "login-form-field--invalid" : ""}>
        Surname
        <input
          type="text"
          value={guestSurname}
          onChange={(event) => {
            setGuestSurname(event.target.value);
            setFieldErrors((current) => ({
              ...current,
              guestSurname: event.target.value.trim().length === 0,
            }));
            setError("");
          }}
          autoComplete="off"
          name="guest-surname"
          disabled={isSubmitting}
          aria-invalid={fieldErrors.guestSurname}
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

      <label className={fieldErrors.guestMembershipNumber ? "login-form-field--invalid" : ""}>
        Archery GB membership number
        <input
          type="text"
          value={guestMembershipNumber}
          onChange={(event) => {
            setGuestMembershipNumber(event.target.value);
            setFieldErrors((current) => ({
              ...current,
              guestMembershipNumber:
                event.target.value.replace(/\D/g, "").length < 7,
            }));
            setError("");
          }}
          inputMode="numeric"
          autoComplete="off"
          name="guest-membership-number"
          disabled={isSubmitting}
          aria-invalid={fieldErrors.guestMembershipNumber}
          required
        />
      </label>

      <label className={fieldErrors.paymentMethod ? "login-form-field--invalid" : ""}>
        Payment
        <select
          value={paymentMethod}
          onChange={(event) => {
            const nextPaymentMethod = event.target.value as "" | "paypal" | "cash";
            setPaymentMethod(nextPaymentMethod);
            setFieldErrors((current) => ({
              ...current,
              paymentMethod: !isValidPaymentMethod(nextPaymentMethod),
            }));
            setError("");
          }}
          name="guest-payment-method"
          disabled={isSubmitting}
          aria-invalid={fieldErrors.paymentMethod}
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
        {isSubmitting ? "Booking In Guest..." : "Book In Guest"}
      </Button>
    </form>
  );
}
