import { validateRoundPairings, hasPairingResults } from "../../domain/services/tournamentPairings.js";

export function registerTournamentPairingRoutes({ app, getActorUser, actorHasPermission, PERMISSIONS, tournamentGateway, loadTournamentSnapshot, persistRoundPairings, syncTournamentMatches, auditChangeLogger, getUtcTimestampParts, broadcastTournamentsUpdated, toUtcDateString }) {
  app.put("/api/tournaments/:id/rounds/:roundNumber/pairings", async (req, res) => {
    const actor = getActorUser(req);
    if (!actor || !actorHasPermission(actor, PERMISSIONS.MANAGE_TOURNAMENTS)) return res.status(403).json({ success: false, message: "You do not have permission to edit pairings." });
    const tournament = await tournamentGateway.findTournamentById(req.params.id);
    if (!tournament) return res.status(404).json({ success: false, message: "Tournament not found." });
    const { builtTournament } = await loadTournamentSnapshot(tournament, actor.username);
    const roundNumber = Number(req.params.roundNumber);
    const rounds = builtTournament.bracket?.rounds ?? [];
    const round = rounds.find((entry) => entry.roundNumber === roundNumber);
    const priorReady = rounds.filter((entry) => entry.roundNumber < roundNumber).every((entry) => entry.matches.every((match) => ["completed", "finalised", "progressed", "walkover", "disqualified", "bye", "retired_both", "empty"].includes(match.status)));
    if (!round || roundNumber !== builtTournament.currentRoundNumber || !priorReady || toUtcDateString(new Date()) <= tournament.registration_end_date || rounds.filter((entry) => entry.roundNumber >= roundNumber).some((entry) => hasPairingResults(entry.matches))) return res.status(409).json({ success: false, message: "Only an unplayed current round can be edited. Recorded results must be preserved." });
    const slots = round.matches.flatMap((match) => [match.leftParticipant?.username ?? null, match.rightParticipant?.username ?? null]);
    if (!validateRoundPairings(req.body?.pairings, slots)) return res.status(400).json({ success: false, message: "Include every eligible archer exactly once, preserving the number of bye slots." });
    const updated = await persistRoundPairings(tournament, roundNumber, req.body.pairings);
    const snapshot = await syncTournamentMatches(updated, actor.username);
    if (auditChangeLogger) {
      const [date, time] = getUtcTimestampParts();
      await auditChangeLogger.recordEntityChange({ action: "pairings_overridden", actorUsername: actor.username, before: round, after: { roundNumber, pairings: req.body.pairings }, changedAtDate: date, changedAtTime: time, entityId: String(tournament.id), entityLabel: tournament.name, entityType: "tournament", req, target: `/api/tournaments/${tournament.id}/rounds/${roundNumber}/pairings` }).catch((error) => console.error("Failed to record tournament pairing audit event", error));
    }
    broadcastTournamentsUpdated("tournaments.pairings");
    return res.json({ success: true, tournament: snapshot.builtTournament });
  });
}
