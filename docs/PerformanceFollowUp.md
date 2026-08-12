# Performance Follow-Up

Last updated: `2026-08-12`

## Next Step

The next recommended optimisation pass is a careful extraction of profile-related
styles from [src/App.css](/abs/path/C:/Users/cfleetham/personal/ArcheryClubPoC/src/App.css:1)
into a profile-specific stylesheet loaded only with the profile route.

## Why This Is Next

- The shared CSS bundle has already been reduced by moving login and calendar
  styles into route-scoped stylesheets.
- Profile styles are one of the remaining large style islands, but they are
  reused across multiple profile-adjacent components, so the extraction needs
  to be deliberate rather than mechanical.
- The current build also reports notable time in CSS post-processing, which is
  another sign that shrinking the global stylesheet is still worthwhile.

## Resume Plan

1. Audit which `profile-*` selectors are truly profile-route-only versus shared
   by equipment, roles, records, and other pages.
2. Move only the profile-route-owned selectors into a dedicated stylesheet.
3. Re-run `npm run lint`, `npm run typecheck`, and `npm run build`.
4. Compare the shared CSS bundle size before and after the extraction.
