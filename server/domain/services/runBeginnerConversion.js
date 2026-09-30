export class BeginnerConversionFailure extends Error {
  constructor(response) {
    super(response.message);
    this.response = response;
  }
}

export async function runBeginnerConversion({ prepareCase, saveMembership, loanCase, markParticipant, inTransaction }) {
  return inTransaction(async (context) => {
    // All equipment checks happen before the first membership write.
    const preparedCase = prepareCase ? await prepareCase(context) : null;
    const membershipResult = await saveMembership(context);
    if (!membershipResult.success) throw new BeginnerConversionFailure(membershipResult);
    if (preparedCase) await loanCase(preparedCase, context);
    await markParticipant(context);
  });
}
