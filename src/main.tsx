import { createRoot } from "react-dom/client";
import { AppCompositionRoot } from "./bootstrap/AppCompositionRoot";
import { AppProviders } from "./bootstrap/AppProviders";

// Application entrypoint: global providers stay outside the composition root so
// feature code can assume query caching and theming are already available.
createRoot(document.getElementById("root")!).render(
  <AppProviders>
    <AppCompositionRoot />
  </AppProviders>,
);
