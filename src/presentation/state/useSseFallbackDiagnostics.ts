import { useSyncExternalStore } from "react";
import {
  getSseFallbackDiagnostics,
  subscribeToSseFallbackDiagnostics,
} from "./sseFallbackDiagnostics";

export function useSseFallbackDiagnostics() {
  return useSyncExternalStore(
    subscribeToSseFallbackDiagnostics,
    getSseFallbackDiagnostics,
    getSseFallbackDiagnostics,
  );
}
