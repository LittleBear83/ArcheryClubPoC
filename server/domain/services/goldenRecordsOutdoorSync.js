import {
  GOLDEN_RECORDS_CLASSIFICATION_TO_FIELD,
  GOLDEN_RECORDS_OUTDOOR_ACHIEVEMENT_MAPPINGS,
  applyGoldenRecordsAchievementsToEntry,
  applyGoldenRecordsClassificationsToEntry,
  buildEmptyOutdoorEntryPayload,
  buildGoldenRecordsManagedOutdoorFieldReset,
  getGoldenRecords252AwardKey,
  mapGoldenRecordsBowClassToOutdoorBowType,
} from "./goldenRecordsOutdoorMapping.js";
import { derive252SignOffDates } from "../../../shared/award252Progression.js";

export function createGoldenRecordsOutdoorSync({ outdoorTableGateway, getUtcTimestampParts }) {
  async function syncOutdoorTableFromGoldenRecords({
    disciplines,
    goldenRecordsSnapshot,
    user,
  }) {
    const outdoorHandicaps = (goldenRecordsSnapshot?.handicaps ?? []).filter(
      (entry) =>
        String(entry.type ?? "").trim().toLowerCase() === "outdoor" &&
        Number.isInteger(entry.handicap),
    );
    const matchedMemberId = String(goldenRecordsSnapshot?.matchedMemberId ?? "").trim();
    const outdoorClassifications = (goldenRecordsSnapshot?.classifications ?? []).filter(
      (entry) => {
        if (matchedMemberId && String(entry.memberId ?? "").trim() !== matchedMemberId) {
          return false;
        }

        return (
          String(entry.type ?? "").trim().toLowerCase() === "outdoor" &&
          GOLDEN_RECORDS_CLASSIFICATION_TO_FIELD.has(
            String(entry.classification ?? "").trim().toLowerCase(),
          )
        );
      },
    );
    const outdoorAchievements = (goldenRecordsSnapshot?.achievements ?? []).filter((entry) => {
      const achievementName = String(entry.achievement ?? "").trim().toLowerCase();
      const roundName = String(entry.round ?? "").trim();

      if (matchedMemberId && String(entry.memberId ?? "").trim() !== matchedMemberId) {
        return false;
      }

      return (
        Boolean(
          getGoldenRecords252AwardKey({
            achievementName: entry.achievement,
            roundName,
          }),
        ) ||
        GOLDEN_RECORDS_OUTDOOR_ACHIEVEMENT_MAPPINGS.some(
          (candidate) => candidate.achievement.toLowerCase() === achievementName,
        )
      );
    });

    if (
      outdoorHandicaps.length === 0 &&
      outdoorAchievements.length === 0 &&
      outdoorClassifications.length === 0
    ) {
      return {
        createdCount: 0,
        syncedCount: 0,
        updatedCount: 0,
      };
    }

    const currentSeasonYear = new Date().getUTCFullYear();
    const currentEntries = await outdoorTableGateway.listEntriesByYear(currentSeasonYear);
    const memberEntriesByBowType = new Map(
      currentEntries
        .filter((entry) => entry.archerUsername === user.username)
        .map((entry) => [entry.bowType, entry]),
    );
    const allowedBowTypes = new Set(
      disciplines.flatMap((discipline) => {
        switch (discipline) {
          case "Recurve Bow":
            return ["Rec"];
          case "Compound Bow":
            return ["Comp"];
          case "Bare Bow":
            return ["B/bow"];
          case "Long Bow":
            return ["L/bow"];
          default:
            return [];
        }
      }),
    );
    const [updatedAtDate, updatedAtTime] = getUtcTimestampParts();
    const syncUpdatedByUsername =
      String(user?.username ?? "").trim() || "system";
    let createdCount = 0;
    let updatedCount = 0;
    const achievementsByBowType = outdoorAchievements.reduce((next, achievement) => {
      const bowType = mapGoldenRecordsBowClassToOutdoorBowType(achievement.bowClass);

      if (!bowType || !allowedBowTypes.has(bowType)) {
        return next;
      }

      const current = next.get(bowType) ?? [];
      current.push(achievement);
      next.set(bowType, current);

      return next;
    }, new Map());
    const classificationsByBowType = outdoorClassifications.reduce((next, classification) => {
      const bowType = mapGoldenRecordsBowClassToOutdoorBowType(classification.bowClass);

      if (!bowType || !allowedBowTypes.has(bowType)) {
        return next;
      }

      const current = next.get(bowType) ?? [];
      current.push(classification);
      next.set(bowType, current);

      return next;
    }, new Map());
    const targetBowTypes = new Set([
      ...outdoorHandicaps
        .map((entry) => mapGoldenRecordsBowClassToOutdoorBowType(entry.bowClass))
        .filter((bowType) => bowType && allowedBowTypes.has(bowType)),
      ...achievementsByBowType.keys(),
      ...classificationsByBowType.keys(),
    ]);

    for (const bowType of targetBowTypes) {
      const handicapEntry = outdoorHandicaps.find(
        (entry) => mapGoldenRecordsBowClassToOutdoorBowType(entry.bowClass) === bowType,
      );
      const achievementEntries = achievementsByBowType.get(bowType) ?? [];
      const classificationEntries = classificationsByBowType.get(bowType) ?? [];
      const existingEntry = memberEntriesByBowType.get(bowType);

      if (existingEntry) {
        let nextEntry = buildGoldenRecordsManagedOutdoorFieldReset(existingEntry);
        let hasChanges =
          JSON.stringify(buildGoldenRecordsManagedOutdoorFieldReset(existingEntry)) !==
          JSON.stringify(existingEntry);

        if (nextEntry.handicap !== (handicapEntry?.handicap ?? nextEntry.handicap)) {
          nextEntry = {
            ...nextEntry,
            handicap: handicapEntry?.handicap ?? nextEntry.handicap,
          };
          hasChanges = true;
        }

        const achievementResult = applyGoldenRecordsAchievementsToEntry(
          nextEntry,
          achievementEntries,
          (dates) => derive252SignOffDates(dates).filter(Boolean).length >= 3,
        );
        nextEntry = achievementResult.entry;
        hasChanges = hasChanges || achievementResult.hasChanges;
        const classificationResult = applyGoldenRecordsClassificationsToEntry(
          nextEntry,
          classificationEntries,
        );
        nextEntry = classificationResult.entry;
        hasChanges = hasChanges || classificationResult.hasChanges;

        if (!hasChanges) {
          continue;
        }

        const updatedEntry = await outdoorTableGateway.updateEntry({
          ...nextEntry,
          updatedAtDate,
          updatedAtTime,
          updatedByUsername: syncUpdatedByUsername,
        });

        memberEntriesByBowType.set(bowType, updatedEntry);
        updatedCount += 1;
        continue;
      }

      const createdPayload = buildEmptyOutdoorEntryPayload({
        archerUsername: user.username,
        bowType,
        handicap: handicapEntry?.handicap ?? null,
        updatedAtDate,
        updatedAtTime,
        updatedByUsername: syncUpdatedByUsername,
      });
      const createdResult = applyGoldenRecordsAchievementsToEntry(
        createdPayload,
        achievementEntries,
        (dates) => derive252SignOffDates(dates).filter(Boolean).length >= 3,
      );
      const createdWithClassifications = applyGoldenRecordsClassificationsToEntry(
        createdResult.entry,
        classificationEntries,
      );
      const createdEntry = await outdoorTableGateway.createEntry(
        createdWithClassifications.entry,
      );

      memberEntriesByBowType.set(bowType, createdEntry);
      createdCount += 1;
    }

    return {
      createdCount,
      syncedCount: createdCount + updatedCount,
      updatedCount,
    };
  }

  return syncOutdoorTableFromGoldenRecords;
}
