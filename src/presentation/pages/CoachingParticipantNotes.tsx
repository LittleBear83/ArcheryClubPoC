import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { addCoachingParticipantNote, listCoachingParticipantNotes } from "../../api/homeApi";
import { Button } from "../components/Button";
import { Modal } from "../components/Modal";
import type { CoachingParticipant } from "./coachingHubModel";

export function coachingNoteDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "2-digit", year: "2-digit", timeZone: "Europe/London" }).format(new Date(value));
}

export function CoachingParticipantNotes({ username, lessonId, participant, onClose }: {
  username: string;
  lessonId: string | number;
  participant: CoachingParticipant | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const participantId = participant?.id;
  const notesKey = ["coaching-participant-notes", username, lessonId, participantId];
  const notesQuery = useQuery({
    queryKey: notesKey,
    queryFn: () => listCoachingParticipantNotes(username, lessonId, participantId!),
    enabled: Boolean(participantId && username),
  });
  const closeAll = () => { setAdding(false); setDraft(""); setError(""); onClose(); };
  const save = async () => {
    const text = draft.trim();
    if (!text || text.length > 500 || !participantId) return;
    setSaving(true);
    setError("");
    try {
      await addCoachingParticipantNote(username, lessonId, participantId, text);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: notesKey }),
        queryClient.invalidateQueries({ queryKey: ["my-coaching-notes", username] }),
        queryClient.invalidateQueries({ queryKey: ["coaching-session-details", username, String(lessonId)] }),
      ]);
      setAdding(false);
      setDraft("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The note could not be saved.");
    } finally {
      setSaving(false);
    }
  };
  return <>
    <Modal open={Boolean(participant)} onClose={closeAll} title={participant ? `Coaching notes · ${participant.firstName} ${participant.surname}` : "Coaching notes"} contentClassName="coaching-notes-modal">
      <div className="coaching-notes-toolbar">
        <p>Notes are kept for 12 months from the date they are added.</p>
        <Button variant="primary" onClick={() => { setError(""); setDraft(""); setAdding(true); }}>Add note</Button>
      </div>
      {notesQuery.isPending ? <p role="status">Loading notes…</p> : null}
      {notesQuery.isError ? <div role="alert"><p>Notes could not be loaded.</p><Button variant="secondary" onClick={() => void notesQuery.refetch()}>Try again</Button></div> : null}
      {notesQuery.data && !notesQuery.data.notes.length ? <p>No coaching notes have been added for this participant.</p> : null}
      {notesQuery.data?.notes.length ? <ul className="coaching-notes-list" aria-label="Participant coaching notes">
        {notesQuery.data.notes.map((note) => <li key={note.id}><span>{coachingNoteDate(note.createdAt)} - {note.authorInitials} - </span><span>{note.text}</span></li>)}
      </ul> : null}
    </Modal>
    <Modal open={Boolean(participant && adding)} onClose={() => { if (!saving) setAdding(false); }} title="Add coaching note" contentClassName="coaching-note-entry-modal">
      <div className="coaching-note-entry">
        <label htmlFor="coaching-note-text">Note</label>
        <textarea id="coaching-note-text" rows={6} maxLength={500} value={draft} onChange={(event) => setDraft(event.target.value)} autoFocus />
        <span className="coaching-note-counter" aria-live="polite">{draft.length}/500 characters</span>
        {error ? <p role="alert">{error}</p> : null}
        <div className="coaching-hub-row-actions">
          <Button variant="secondary" disabled={saving} onClick={() => setAdding(false)}>Cancel</Button>
          <Button variant="primary" disabled={saving || !draft.trim()} onClick={() => void save()}>{saving ? "Saving…" : "OK"}</Button>
        </div>
      </div>
    </Modal>
  </>;
}
