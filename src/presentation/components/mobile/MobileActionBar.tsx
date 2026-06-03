import type { ReactNode } from "react";

export function MobileActionBar({ children }: { children: ReactNode }) {
  return <div className="mobile-action-bar">{children}</div>;
}
