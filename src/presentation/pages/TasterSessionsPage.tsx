import { BeginnersCoursesPage } from "./BeginnersCoursesPage";

export function TasterSessionsPage({ currentUserProfile }) {
  return (
    <BeginnersCoursesPage
      currentUserProfile={currentUserProfile}
      variant="taster-session"
    />
  );
}
