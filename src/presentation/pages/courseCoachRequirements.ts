export const DEFAULT_BEGINNERS_COACHES_PER_LESSON = 5;

export type LessonCoachRequirementOverrides = Record<number, string>;

export function resizeLessonCoachRequirementOverrides(
  overrides: LessonCoachRequirementOverrides,
  lessonCount: number,
): LessonCoachRequirementOverrides {
  return Object.fromEntries(
    Object.entries(overrides).filter(([lessonNumber]) => Number(lessonNumber) <= lessonCount),
  );
}

export function setLessonCoachRequirementOverride(
  overrides: LessonCoachRequirementOverrides,
  lessonNumber: number,
  value: string,
  courseDefault: string,
): LessonCoachRequirementOverrides {
  if (value === courseDefault) {
    const next = { ...overrides };
    delete next[lessonNumber];
    return next;
  }
  return { ...overrides, [lessonNumber]: value };
}

export function buildLessonCoachRequirements(
  lessonCount: number,
  courseDefault: string,
  overrides: LessonCoachRequirementOverrides,
): Record<number, number> | null {
  const defaultCount = Number(courseDefault);
  if (!Number.isInteger(defaultCount) || defaultCount < 1 || defaultCount > 2147483647) return null;

  const requirements: Record<number, number> = {};
  for (let lessonNumber = 1; lessonNumber <= lessonCount; lessonNumber += 1) {
    const value = overrides[lessonNumber] ?? courseDefault;
    const count = Number(value);
    if (!Number.isInteger(count) || count < 1 || count > 2147483647) return null;
    requirements[lessonNumber] = count;
  }
  return requirements;
}
