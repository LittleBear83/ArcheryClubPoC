import type { ButtonHTMLAttributes, ReactNode } from "react";

type ButtonVariant = "primary" | "secondary" | "danger" | "ghost" | "unstyled";
type ButtonSize = "sm" | "md" | "lg";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  fullWidth?: boolean;
  size?: ButtonSize;
  variant?: ButtonVariant;
};

const variantClassMap: Record<ButtonVariant, string> = {
  primary: "app-button--primary",
  secondary: "app-button--secondary",
  danger: "app-button--danger",
  ghost: "app-button--ghost",
  unstyled: "app-button--unstyled",
};

const sizeClassMap: Record<ButtonSize, string> = {
  sm: "app-button--sm",
  md: "app-button--md",
  lg: "app-button--lg",
};

export function Button({
  children,
  className = "",
  fullWidth = false,
  size = "md",
  type = "button",
  variant = "primary",
  ...props
}: ButtonProps) {
  const classes = [
    "app-button",
    variantClassMap[variant],
    sizeClassMap[size],
    fullWidth ? "app-button--full-width" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button type={type} className={classes} {...props}>
      {children}
    </button>
  );
}
