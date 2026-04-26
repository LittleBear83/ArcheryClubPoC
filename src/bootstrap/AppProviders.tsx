import { StrictMode, type ReactNode } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "../theme/ThemeProvider";
import "../theme/theme.css";
import "../index.css";
import { queryClient } from "../lib/queryClient";

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <StrictMode>
      {/* Shared app providers live here so the rest of the tree can focus on
         feature wiring instead of global React infrastructure. */}
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>{children}</ThemeProvider>
      </QueryClientProvider>
    </StrictMode>
  );
}
