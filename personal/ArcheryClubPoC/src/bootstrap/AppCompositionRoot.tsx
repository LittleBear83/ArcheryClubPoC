import { useState } from "react";
import App from "../App";
import { createAppDependencies } from "./createAppDependencies";

export function AppCompositionRoot() {
  const [dependencies] = useState(() => createAppDependencies());

  return <App dependencies={dependencies} />;
}
