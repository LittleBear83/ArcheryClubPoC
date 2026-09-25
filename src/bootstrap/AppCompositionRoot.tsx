import { useMemo } from "react";
import App from "../App";
import { createAppDependencies } from "./createAppDependencies";

export function AppCompositionRoot() {
  // Keep dependencies stable during normal renders, but rebuild them when the
  // factory changes during development hot reload.
  const dependencies = useMemo(() => createAppDependencies(), [createAppDependencies]);

  return <App dependencies={dependencies} />;
}
