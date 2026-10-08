export const DEFAULT_BEGINNERS_COACHES_PER_LESSON = 5;

function isValidCoachCount(value) {
  return Number.isInteger(value) && value >= 1 && value <= 2147483647;
}

export function buildCourseLessonCoachRequirements({ courseType, lessonCount, payload }) {
  const supportsCoachRequirements = courseType === "beginners" || courseType === "taster-session";
  const defaultCount = supportsCoachRequirements
    ? payload?.requiredCoachesDefault ?? DEFAULT_BEGINNERS_COACHES_PER_LESSON
    : 1;
  if (!isValidCoachCount(defaultCount)) {
    return { success: false, message: "Coaches needed per lesson must be a whole number from 1 to 2,147,483,647." };
  }

  const requested = supportsCoachRequirements ? payload?.lessonCoachRequirements ?? {} : {};
  if (!requested || typeof requested !== "object" || Array.isArray(requested)) {
    return { success: false, message: "Lesson coach requirements must be an object of lesson numbers and coach counts." };
  }
  const requirements = {};
  for (const [key, value] of Object.entries(requested)) {
    const lessonNumber = Number(key);
    if (!Number.isInteger(lessonNumber) || lessonNumber < 1 || lessonNumber > lessonCount || !isValidCoachCount(value)) {
      return { success: false, message: "Each lesson coach requirement must be a whole number of at least 1 for a lesson in this course." };
    }
    requirements[lessonNumber] = value;
  }
  return {
    success: true,
    requiredCoachesDefault: defaultCount,
    lessonCoachRequirements: Object.fromEntries(
      Array.from({ length: lessonCount }, (_value, index) => {
        const lessonNumber = index + 1;
        return [lessonNumber, requirements[lessonNumber] ?? defaultCount];
      }),
    ),
  };
}
