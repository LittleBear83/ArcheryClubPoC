import { BeginnersCoursesPage } from "./BeginnersCoursesPage";

export function HaveAGoSessionsPage({ currentUserProfile }) {
  return (
    <BeginnersCoursesPage
      currentUserProfile={currentUserProfile}
      variant="have-a-go"
    />
  );
}
