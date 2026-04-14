import { createRoot } from "react-dom/client";
import { AppCompositionRoot } from "./bootstrap/AppCompositionRoot";
import { AppProviders } from "./bootstrap/AppProviders";

createRoot(document.getElementById("root")!).render(
  <AppProviders>
    <AppCompositionRoot />
  </AppProviders>,
);
