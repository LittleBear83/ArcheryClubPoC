import { useSyncExternalStore } from "react";
import {
  getServerEventDiagnostics,
  subscribeToServerEventDiagnostics,
} from "../../lib/serverEvents";

export function useServerEventDiagnostics() {
  return useSyncExternalStore(
    subscribeToServerEventDiagnostics,
    getServerEventDiagnostics,
    getServerEventDiagnostics,
  );
}
