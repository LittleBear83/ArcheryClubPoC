# Add to Calendar checks

The calendar detail views offer Google Calendar and a downloadable `.ics` file for Apple Calendar and compatible apps. The export is a local browser action; it does not make a booking or change an existing one. Times are stored in the file as UTC after conversion from Europe/London. A missing venue is omitted. Invalid dates, missing times, or an end time that is not after the start hide the export control.

Automated tests cover competition and social events, coaching, Beginners, Taster and Have a Go lessons; cancelled, rejected and pending entries; GMT/BST and both clock changes; invalid dates; missing venue; `.ics` escaping, line folding and stable UID; and Google URL fields.

Manual checks when devices are available:

1. On iPhone Safari and the installed portal PWA, open an eligible event, a coaching session and a course lesson. Tap **Add to Calendar**, download the `.ics` file, and open it from Downloads/Files in Calendar. Confirm title, time, location, description and portal link.
2. On Android Chrome, use both the Google Calendar link and the `.ics` download with a compatible calendar app. Confirm the same fields.
3. At narrow and desktop widths, check that both options wrap without clipping and that the detail modal remains usable.
4. Confirm that adding an activity leaves club booking status unchanged.

These device and layout checks were not performed in the development environment. Browser handling of downloaded `.ics` files varies; if the browser does not open the file directly, open it from Downloads in a calendar app. The Google link requires access to Google Calendar but no portal calendar authorisation.
