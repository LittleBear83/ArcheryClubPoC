import type { ReactNode } from "react";

export function MobileCardList({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={["mobile-card-list", className].filter(Boolean).join(" ")}>
      {children}
    </div>
  );
}
