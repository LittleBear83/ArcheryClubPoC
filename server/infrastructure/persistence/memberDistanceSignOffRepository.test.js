import assert from "node:assert/strict";
import test from "node:test";
import { mapDistanceSignOffsByDiscipline } from "./memberDistanceSignOffRepository.js";

test("a higher outdoor distance implies lower distances in the same discipline", () => {
  const explicit20 = { discipline: "Recurve Bow", distanceYards: 20, source: "manual", signedOffAt: "2026-01-01" };
  const explicit50 = { discipline: "Recurve Bow", distanceYards: 50, source: "golden-records", signedOffAt: "2026-02-01" };
  const otherBow = { discipline: "Bare Bow", distanceYards: 30, source: "manual", signedOffAt: "2026-03-01" };
  const rows = [explicit20, explicit50, otherBow];
  const result = mapDistanceSignOffsByDiscipline(rows, ["Recurve Bow", "Bare Bow"], ["Recurve Bow", "Bare Bow"], [20, 30, 40, 50, 60]);
  const recurve = result[0].distances.map((distance) => distance.signOff);
  assert.equal(recurve[0], explicit20);
  assert.equal(recurve[1].source, "inferred");
  assert.equal(recurve[1].inferredFromDistanceYards, 50);
  assert.equal(recurve[1].signedOffAt, "2026-02-01");
  assert.equal(recurve[2].source, "inferred");
  assert.equal(recurve[3], explicit50);
  assert.equal(recurve[4], null);
  assert.equal(result[1].distances[0].signOff.source, "inferred");
  assert.equal(result[1].distances[0].signOff.inferredFromDistanceYards, 30);
  assert.equal(result[1].distances[2].signOff, null);
  assert.deepEqual(rows, [explicit20, explicit50, otherBow]);
});
