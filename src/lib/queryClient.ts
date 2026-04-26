import { QueryClient } from "@tanstack/react-query";

// Central React Query defaults. A short stale time keeps dashboard data fresh
// without forcing every component to duplicate polling and retry policy.
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30000,
      refetchOnWindowFocus: true,
      retry: 1,
    },
  },
});
