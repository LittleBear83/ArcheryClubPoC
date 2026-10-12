import { useMemo } from "react";
import { BrowserRouter } from "react-router-dom";
import App from "../App";
import { createAppDependencies } from "./createAppDependencies";

export function AppCompositionRoot() {
  // Keep dependencies stable during normal renders, but rebuild them when the
  // factory changes during development hot reload.
  const dependencies = useMemo(() => createAppDependencies(), [createAppDependencies]);

  return (
    <BrowserRouter>
      <App dependencies={dependencies} />
    </BrowserRouter>
  );
}
