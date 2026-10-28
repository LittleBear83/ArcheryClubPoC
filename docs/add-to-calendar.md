# Add to Calendar checks

The calendar detail views offer Google Calendar and a downloadable `.ics` file for Apple Calendar and compatible apps. The export is a local browser action; it does not make a booking or change an existing one. Times are stored in the file as UTC after conversion from Europe/London. A missing venue is omitted. Invalid dates, missing times, or an end time that is not after the start hide the export control.

Automated tests cover competition and social events, coaching, Beginners, Taster and Have a Go lessons; cancelled, rejected and pending entries; GMT/BST and both clock changes; invalid dates; missing venue; `.ics` escaping, line folding and stable UID; and Google URL fields.

Manual checks when devices are available:

1. On iPhone Safari and the installed portal PWA, open an eligible event, a coaching session and a course lesson. Tap **Add to Calendar**, download the `.ics` file, and open it from Downloads/Files in Calendar. Confirm title, time, location, description and portal link.
2. On Android Chrome, use both the Google Calendar link and the `.ics` download with a compatible calendar app. Confirm the same fields.
3. At narrow and desktop widths, check that both options wrap without clipping and that the detail modal remains usable.
4. Confirm that adding an activity leaves club booking status unchanged.

These device and layout checks were not performed in the development environment. Browser handling of downloaded `.ics` files varies; if the browser does not open the file directly, open it from Downloads in a calendar app. The Google link requires access to Google Calendar but no portal calendar authorisation.

## My Events follow-up

On desktop and on iPhone Safari/PWA and Android Chrome, open **My Events** using the calendar action buttons or the home shortcut. Check the list and its empty state at narrow widths, use Tab and Escape to navigate and close the modal, and confirm focus returns to the button. Book and leave a club event and a coaching session, then reopen the list to confirm it refreshes. As an assigned coach, check a regular coaching session and a Beginners, Taster or Have a Go lesson, including one without a participant booking. Check that a current event remains listed until its end time. The Apple and Google options in each list entry use the same export controls as event details. These device checks remain manual.

## Quick Event Creation follow-up

In a desktop browser, double-click empty and populated day cells, including a date in another month. Confirm Add Event opens with that date. Double-click an event label and the calendar navigation controls to confirm they do not open the form. Single-click a day, then use Add event and confirm its date matches the selection. On iPhone Safari/PWA and Android Chrome, confirm ordinary single-tap navigation still works and Add event uses the selected day. Check that the multiple-date pickers still select dates with a single click or tap. These browser checks remain manual.

## Home shortcut follow-up

On desktop and mobile, select anywhere on **Your Club Events List**. Confirm it opens the existing My Events modal at `/event-calendar?view=my-events`, including when no bookings are listed. Check keyboard focus styling and Enter activation, refresh the URL, use Back while the modal is open, and close it with its close control. Confirm the URL no longer requests the modal after closing and that the card works again on a later visit. These browser checks remain manual.
