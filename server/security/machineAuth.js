export function createMachineSyncAuth({
  credentials = [],
  verifySecret,
}) {
  const credentialsByMachineId = new Map(
    credentials
      .filter((entry) => entry && !entry.disabled)
      .map((entry) => [entry.machineId, entry]),
  );

  return {
    authenticateMachineRequest(req, res, next) {
      const machineId = String(req.get("x-sync-machine-id") ?? "").trim();
      const machineSecret = req.get("x-sync-machine-secret") ?? "";

      if (!machineId || !machineSecret) {
        res.status(401).json({
          success: false,
          message: "Valid machine credentials are required.",
        });
        return;
      }

      const credential = credentialsByMachineId.get(machineId);

      if (!credential || !verifySecret(machineSecret, credential.secretHash)) {
        res.status(401).json({
          success: false,
          message: "Valid machine credentials are required.",
        });
        return;
      }

      req.syncMachine = {
        machineId,
      };
      next();
    },
  };
}
