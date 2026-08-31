function createSqliteBeginnersCourseWriteGateway({
  cancelBeginnersCourse,
  db,
  deleteBeginnersCourseParticipant,
  deleteBeginnersLessonCoachesByLessonId,
  insertBeginnersCourse,
  insertBeginnersCourseLesson,
  insertBeginnersCourseParticipant,
  insertBeginnersLessonCoach,
  markBeginnersCourseParticipantConverted,
  transferBeginnersCourseParticipant,
  updateBeginnersCourseApproval,
  updateBeginnersCourseLessonSchedule,
  updateBeginnersCourseParticipant,
  updateBeginnersCourseParticipantNoShow,
  updateBeginnersCourseParticipantCase,
  updateBeginnersCourseSchedule,
  updateUserPassword,
  upsertUser,
}) {
  return {
    async cancelCourse({
      actorUsername,
      cancelledAtDate,
      cancelledAtTime,
      courseId,
      reason,
    }) {
      cancelBeginnersCourse.run(
        reason,
        actorUsername,
        cancelledAtDate,
        cancelledAtTime,
        courseId,
      );
    },
    async deleteParticipant(participantId) {
      deleteBeginnersCourseParticipant.run(participantId);
    },
    async createCourseWithLessons({
      actorUsername,
      courseType,
      endTime,
      firstLessonDate,
      lessonCount,
      lessonDates,
      startTime,
      beginnerCapacity,
      coordinatorUsername,
      createdAtDate,
      createdAtTime,
    }) {
      const transaction = db.transaction(() => {
        const result = insertBeginnersCourse.run(
          courseType,
          coordinatorUsername,
          actorUsername,
          firstLessonDate,
          startTime,
          endTime,
          lessonCount,
          beginnerCapacity,
          "pending",
          null,
          null,
          null,
          null,
          createdAtDate,
          createdAtTime,
        );

        for (const lesson of lessonDates) {
          insertBeginnersCourseLesson.run(
            result.lastInsertRowid,
            lesson.lessonNumber,
            lesson.lessonDate,
            startTime,
            endTime,
          );
        }

        return Number(result.lastInsertRowid);
      });

      return transaction();
    },
    async createParticipant({
      actorUsername,
      courseId,
      createdAtDate,
      createdAtTime,
      originCourseType,
      participant,
      username,
    }) {
      insertBeginnersCourseParticipant.run(
        courseId,
        username,
        participant.firstName,
        participant.surname,
        participant.sizeCategory,
        participant.heightText,
        participant.drawLength,
        participant.handedness,
        participant.eyeDominance,
        participant.initialEmailSent ? 1 : 0,
        participant.thirtyDayReminderSent ? 1 : 0,
        participant.courseFeePaid ? 1 : 0,
        originCourseType,
        0,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        actorUsername,
        createdAtDate,
        createdAtTime,
      );
    },
    async markParticipantConverted({
      actorUsername,
      convertedAtDate,
      convertedAtTime,
      participantId,
    }) {
      markBeginnersCourseParticipantConverted.run(
        convertedAtDate,
        convertedAtTime,
        actorUsername,
        participantId,
      );
    },
    async transferParticipantToCourse({ courseId, participantId }) {
      transferBeginnersCourseParticipant.run(courseId, participantId);
    },
    async replaceLessonCoaches({
      actorUsername,
      assignedAtDate,
      assignedAtTime,
      coachUsernames,
      lessonId,
    }) {
      const transaction = db.transaction(() => {
        deleteBeginnersLessonCoachesByLessonId.run(lessonId);

        for (const coachUsername of coachUsernames) {
          insertBeginnersLessonCoach.run(
            lessonId,
            coachUsername,
            actorUsername,
            assignedAtDate,
            assignedAtTime,
          );
        }
      });

      transaction();
    },
    async resetParticipantPassword({ passwordHash, username }) {
      updateUserPassword.run(passwordHash, username);
    },
    async reviewCourse({
      approvalStatus,
      approvedAtDate,
      approvedAtTime,
      approvedByUsername,
      courseId,
      rejectionReason,
    }) {
      updateBeginnersCourseApproval.run(
        approvalStatus,
        rejectionReason,
        approvedByUsername,
        approvedAtDate,
        approvedAtTime,
        courseId,
      );
    },
    async rescheduleCourse({
      approvalStatus,
      approvedAtDate,
      approvedAtTime,
      approvedByUsername,
      courseId,
      endTime,
      firstLessonDate,
      lessonDates,
      rejectionReason,
      startTime,
    }) {
      const transaction = db.transaction(() => {
        updateBeginnersCourseSchedule.run(
          firstLessonDate,
          startTime,
          endTime,
          approvalStatus,
          rejectionReason,
          approvedByUsername,
          approvedAtDate,
          approvedAtTime,
          courseId,
        );

        for (const lesson of lessonDates) {
          updateBeginnersCourseLessonSchedule.run(
            lesson.lessonDate,
            startTime,
            endTime,
            courseId,
            lesson.lessonNumber,
          );
        }
      });

      transaction();
    },
    async updateParticipant({
      existingUser,
      participant,
      participantId,
    }) {
      updateBeginnersCourseParticipant.run({
        id: participantId,
        firstName: participant.firstName,
        surname: participant.surname,
        sizeCategory: participant.sizeCategory,
        heightText: participant.heightText,
        drawLength: participant.drawLength,
        handedness: participant.handedness,
        eyeDominance: participant.eyeDominance,
        initialEmailSent: participant.initialEmailSent ? 1 : 0,
        thirtyDayReminderSent: participant.thirtyDayReminderSent ? 1 : 0,
        courseFeePaid: participant.courseFeePaid ? 1 : 0,
        noShowRecorded: participant.noShowRecorded ? 1 : 0,
        noShowRecordedAtDate: participant.noShowRecordedAtDate,
        noShowRecordedAtTime: participant.noShowRecordedAtTime,
        noShowRecordedByUsername: participant.noShowRecordedByUsername,
      });

      if (existingUser) {
        upsertUser.run({
          username: existingUser.username,
          firstName: participant.firstName,
          surname: participant.surname,
          password: existingUser.password,
          rfidTag: existingUser.rfid_tag,
          activeMember: existingUser.active_member,
          affiliateMember: existingUser.affiliate_member,
          membershipFeesDue: existingUser.membership_fees_due,
          coachingVolunteer: existingUser.coaching_volunteer,
        });
      }
    },
    async updateParticipantCase({
      actorUsername,
      assignedCaseId,
      assignedAtDate,
      assignedAtTime,
      participantId,
    }) {
      updateBeginnersCourseParticipantCase.run(
        assignedCaseId,
        assignedCaseId ? actorUsername : null,
        assignedCaseId ? assignedAtDate : null,
        assignedCaseId ? assignedAtTime : null,
        participantId,
      );
    },
    async updateParticipantNoShow({
      noShowRecorded,
      noShowRecordedAtDate,
      noShowRecordedAtTime,
      noShowRecordedByUsername,
      participantId,
    }) {
      updateBeginnersCourseParticipantNoShow.run(
        noShowRecorded ? 1 : 0,
        noShowRecordedAtDate,
        noShowRecordedAtTime,
        noShowRecordedByUsername,
        participantId,
      );
    },
  };
}

function createPostgresBeginnersCourseWriteGateway({ pool }) {
  return {
    async cancelCourse({
      actorUsername,
      cancelledAtDate,
      cancelledAtTime,
      courseId,
      reason,
    }) {
      await pool.query(
        `
          UPDATE beginners_courses
          SET
            is_cancelled = 1,
            cancellation_reason = $1,
            cancelled_by_username = $2,
            cancelled_at_date = $3,
            cancelled_at_time = $4
          WHERE id = $5
        `,
        [reason, actorUsername, cancelledAtDate, cancelledAtTime, courseId],
      );
    },
    async deleteParticipant(participantId) {
      await pool.query(
        `
          DELETE FROM beginners_course_participants
          WHERE id = $1
        `,
        [participantId],
      );
    },
    async createCourseWithLessons({
      actorUsername,
      courseType,
      endTime,
      firstLessonDate,
      lessonCount,
      lessonDates,
      startTime,
      beginnerCapacity,
      coordinatorUsername,
      createdAtDate,
      createdAtTime,
    }) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const courseResult = await client.query(
          `
            INSERT INTO beginners_courses (
              course_type,
              coordinator_username,
              submitted_by_username,
              first_lesson_date,
              start_time,
              end_time,
              lesson_count,
              beginner_capacity,
              approval_status,
              rejection_reason,
              approved_by_username,
              approved_at_date,
              approved_at_time,
              created_at_date,
              created_at_time
            )
            VALUES (
              $1, $2, $3, $4, $5, $6, $7, $8, 'pending', NULL, NULL, NULL, NULL, $9, $10
            )
            RETURNING id
          `,
          [
            courseType,
            coordinatorUsername,
            actorUsername,
            firstLessonDate,
            startTime,
            endTime,
            lessonCount,
            beginnerCapacity,
            createdAtDate,
            createdAtTime,
          ],
        );
        const courseId = Number(courseResult.rows[0].id);
        for (const lesson of lessonDates) {
          await client.query(
            `
              INSERT INTO beginners_course_lessons (
                course_id,
                lesson_number,
                lesson_date,
                start_time,
                end_time
              )
              VALUES ($1, $2, $3, $4, $5)
            `,
            [courseId, lesson.lessonNumber, lesson.lessonDate, startTime, endTime],
          );
        }
        await client.query("COMMIT");
        return courseId;
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },
    async createParticipant({
      actorUsername,
      courseId,
      createdAtDate,
      createdAtTime,
      originCourseType,
      participant,
      username,
    }) {
      await pool.query(
        `
          INSERT INTO beginners_course_participants (
            course_id,
            username,
            first_name,
            surname,
            beginner_size_category,
            height_text,
            draw_length,
            handedness,
            eye_dominance,
            initial_email_sent,
            thirty_day_reminder_sent,
            course_fee_paid,
            origin_course_type,
            no_show_recorded,
            no_show_recorded_at_date,
            no_show_recorded_at_time,
            no_show_recorded_by_username,
            assigned_case_id,
            assigned_case_by_username,
            assigned_case_at_date,
            assigned_case_at_time,
            created_by_username,
            created_at_date,
            created_at_time
          )
          VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 0, NULL, NULL, NULL, NULL, NULL, NULL, NULL, $14, $15, $16
          )
        `,
        [
          courseId,
          username,
          participant.firstName,
          participant.surname,
          participant.sizeCategory,
          participant.heightText,
          participant.drawLength,
          participant.handedness,
          participant.eyeDominance,
          participant.initialEmailSent ? 1 : 0,
          participant.thirtyDayReminderSent ? 1 : 0,
          participant.courseFeePaid ? 1 : 0,
          originCourseType,
          actorUsername,
          createdAtDate,
          createdAtTime,
        ],
      );
    },
    async markParticipantConverted({
      actorUsername,
      convertedAtDate,
      convertedAtTime,
      participantId,
    }) {
      await pool.query(
        `
          UPDATE beginners_course_participants
          SET
            converted_to_member = 1,
            converted_at_date = $1,
            converted_at_time = $2,
            converted_by_username = $3
          WHERE id = $4
        `,
        [convertedAtDate, convertedAtTime, actorUsername, participantId],
      );
    },
    async transferParticipantToCourse({ courseId, participantId }) {
      await pool.query(
        `
          UPDATE beginners_course_participants
          SET
            course_id = $1,
            assigned_case_id = NULL,
            assigned_case_by_username = NULL,
            assigned_case_at_date = NULL,
            assigned_case_at_time = NULL,
            no_show_recorded = 0,
            no_show_recorded_at_date = NULL,
            no_show_recorded_at_time = NULL,
            no_show_recorded_by_username = NULL,
            converted_to_member = 0,
            converted_at_date = NULL,
            converted_at_time = NULL,
            converted_by_username = NULL
          WHERE id = $2
        `,
        [courseId, participantId],
      );
    },
    async replaceLessonCoaches({
      actorUsername,
      assignedAtDate,
      assignedAtTime,
      coachUsernames,
      lessonId,
    }) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query(
          `DELETE FROM beginners_course_lesson_coaches WHERE lesson_id = $1`,
          [lessonId],
        );
        for (const coachUsername of coachUsernames) {
          await client.query(
            `
              INSERT INTO beginners_course_lesson_coaches (
                lesson_id,
                coach_username,
                assigned_by_username,
                assigned_at_date,
                assigned_at_time
              )
              VALUES ($1, $2, $3, $4, $5)
              ON CONFLICT DO NOTHING
            `,
            [lessonId, coachUsername, actorUsername, assignedAtDate, assignedAtTime],
          );
        }
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },
    async resetParticipantPassword({ passwordHash, username }) {
      await pool.query(
        `
          UPDATE users
          SET password = $1
          WHERE LOWER(username) = LOWER($2)
        `,
        [passwordHash, username],
      );
    },
    async reviewCourse({
      approvalStatus,
      approvedAtDate,
      approvedAtTime,
      approvedByUsername,
      courseId,
      rejectionReason,
    }) {
      await pool.query(
        `
          UPDATE beginners_courses
          SET
            approval_status = $1,
            rejection_reason = $2,
            approved_by_username = $3,
            approved_at_date = $4,
            approved_at_time = $5
          WHERE id = $6
        `,
        [
          approvalStatus,
          rejectionReason,
          approvedByUsername,
          approvedAtDate,
          approvedAtTime,
          courseId,
        ],
      );
    },
    async rescheduleCourse({
      approvalStatus,
      approvedAtDate,
      approvedAtTime,
      approvedByUsername,
      courseId,
      endTime,
      firstLessonDate,
      lessonDates,
      rejectionReason,
      startTime,
    }) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query(
          `
            UPDATE beginners_courses
            SET
              first_lesson_date = $1,
              start_time = $2,
              end_time = $3,
              approval_status = $4,
              rejection_reason = $5,
              approved_by_username = $6,
              approved_at_date = $7,
              approved_at_time = $8
            WHERE id = $9
          `,
          [
            firstLessonDate,
            startTime,
            endTime,
            approvalStatus,
            rejectionReason,
            approvedByUsername,
            approvedAtDate,
            approvedAtTime,
            courseId,
          ],
        );

        for (const lesson of lessonDates) {
          await client.query(
            `
              UPDATE beginners_course_lessons
              SET
                lesson_date = $1,
                start_time = $2,
                end_time = $3
              WHERE course_id = $4 AND lesson_number = $5
            `,
            [
              lesson.lessonDate,
              startTime,
              endTime,
              courseId,
              lesson.lessonNumber,
            ],
          );
        }
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },
    async updateParticipant({
      existingUser,
      participant,
      participantId,
    }) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query(
          `
            UPDATE beginners_course_participants
            SET
              first_name = $1,
              surname = $2,
              beginner_size_category = $3,
              height_text = $4,
              draw_length = $5,
              handedness = $6,
              eye_dominance = $7,
              initial_email_sent = $8,
              thirty_day_reminder_sent = $9,
              course_fee_paid = $10,
              no_show_recorded = $11,
              no_show_recorded_at_date = $12,
              no_show_recorded_at_time = $13,
              no_show_recorded_by_username = $14
            WHERE id = $15
          `,
          [
            participant.firstName,
            participant.surname,
            participant.sizeCategory,
            participant.heightText,
            participant.drawLength,
            participant.handedness,
            participant.eyeDominance,
            participant.initialEmailSent ? 1 : 0,
            participant.thirtyDayReminderSent ? 1 : 0,
            participant.courseFeePaid ? 1 : 0,
            participant.noShowRecorded ? 1 : 0,
            participant.noShowRecordedAtDate,
            participant.noShowRecordedAtTime,
            participant.noShowRecordedByUsername,
            participantId,
          ],
        );
        if (existingUser) {
          await client.query(
            `
              UPDATE users
              SET
                first_name = $1,
                surname = $2,
                password = $3,
                rfid_tag = $4,
                active_member = $5,
                affiliate_member = $6,
                membership_fees_due = $7,
                coaching_volunteer = $8
              WHERE LOWER(username) = LOWER($9)
            `,
            [
              participant.firstName,
              participant.surname,
              existingUser.password,
              existingUser.rfid_tag,
              existingUser.active_member,
              existingUser.affiliate_member,
              existingUser.membership_fees_due,
              existingUser.coaching_volunteer,
              existingUser.username,
            ],
          );
        }
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },
    async updateParticipantCase({
      actorUsername,
      assignedCaseId,
      assignedAtDate,
      assignedAtTime,
      participantId,
    }) {
      await pool.query(
        `
          UPDATE beginners_course_participants
          SET
            assigned_case_id = $1,
            assigned_case_by_username = $2,
            assigned_case_at_date = $3,
            assigned_case_at_time = $4
          WHERE id = $5
        `,
        [
          assignedCaseId,
          assignedCaseId ? actorUsername : null,
          assignedCaseId ? assignedAtDate : null,
          assignedCaseId ? assignedAtTime : null,
          participantId,
        ],
      );
    },
    async updateParticipantNoShow({
      noShowRecorded,
      noShowRecordedAtDate,
      noShowRecordedAtTime,
      noShowRecordedByUsername,
      participantId,
    }) {
      await pool.query(
        `
          UPDATE beginners_course_participants
          SET
            no_show_recorded = $1,
            no_show_recorded_at_date = $2,
            no_show_recorded_at_time = $3,
            no_show_recorded_by_username = $4
          WHERE id = $5
        `,
        [
          noShowRecorded ? 1 : 0,
          noShowRecordedAtDate,
          noShowRecordedAtTime,
          noShowRecordedByUsername,
          participantId,
        ],
      );
    },
  };
}

export function createBeginnersCourseWriteGateway(options) {
  if (options.databaseEngine === "postgres") {
    return createPostgresBeginnersCourseWriteGateway(options);
  }

  return createSqliteBeginnersCourseWriteGateway(options);
}
