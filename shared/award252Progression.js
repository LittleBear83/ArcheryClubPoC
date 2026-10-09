// A later 252 sign-off establishes each earlier round, while an explicit
// earlier date keeps its own provenance.
export function derive252SignOffDates(value) {
  const dates = Array.isArray(value)
    ? value.slice(0, 3).map((date) => typeof date === "string" ? date : "")
    : [];
  while (dates.length < 3) dates.push("");
  for (let index = 1; index >= 0; index -= 1) {
    if (!dates[index]) dates[index] = dates[index + 1];
  }
  return dates;
}

// Reaching a higher shooting distance requires three 252 rounds at each lower distance.
// Return the nearest signed-off higher distance without inventing score dates.
export function find252CompletionSignOffDistance(distanceYards, signedOffDistances) {
  if (!Number.isFinite(distanceYards) || !Array.isArray(signedOffDistances)) return null;
  const higherDistances = signedOffDistances.filter(
    (distance) => Number.isFinite(distance) && distance > distanceYards,
  );
  return higherDistances.length ? Math.min(...higherDistances) : null;
}

