import { useState } from "react";
import App from "../App";
import { createAppDependencies } from "./createAppDependencies";

export function AppCompositionRoot() {
  // Build dependencies once per browser session. Keeping this stable prevents
  // use case instances from changing on every render.
  const [dependencies] = useState(() => createAppDependencies());

  return <App dependencies={dependencies} />;
}
