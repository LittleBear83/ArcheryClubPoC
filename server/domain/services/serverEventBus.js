function normalizePermissions(permissions) {
  if (!Array.isArray(permissions)) {
    return [];
  }

  return permissions.filter((permission) => typeof permission === "string");
}

function writeSseEvent(res, eventName, data) {
  res.write(`event: ${eventName}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

export function createServerEventBus() {
  const clients = new Map();

  const disconnectClient = (clientId) => {
    const client = clients.get(clientId);

    if (!client) {
      return;
    }

    if (client.heartbeatIntervalId) {
      clearInterval(client.heartbeatIntervalId);
    }

    clients.delete(clientId);
  };

  const addClient = ({
    permissions = [],
    res,
    username,
  }) => {
    const clientId = `${username}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
    const heartbeatIntervalId = setInterval(() => {
      if (res.writableEnded || res.destroyed) {
        disconnectClient(clientId);
        return;
      }

      res.write(": ping\n\n");
    }, 25000);

    clients.set(clientId, {
      heartbeatIntervalId,
      permissions: normalizePermissions(permissions),
      res,
      username,
    });

    return {
      clientId,
      disconnect: () => disconnectClient(clientId),
    };
  };

  const broadcastToMatcher = (matcher, eventName, data) => {
    for (const [clientId, client] of clients.entries()) {
      if (!matcher(client)) {
        continue;
      }

      if (client.res.writableEnded || client.res.destroyed) {
        disconnectClient(clientId);
        continue;
      }

      writeSseEvent(client.res, eventName, data);
    }
  };

  return {
    addClient,
    broadcastToAll(eventName, data = {}) {
      broadcastToMatcher(() => true, eventName, data);
    },
    broadcastToPermission(permissionKey, eventName, data = {}) {
      broadcastToMatcher(
        (client) => client.permissions.includes(permissionKey),
        eventName,
        data,
      );
    },
    broadcastToAnyPermission(permissionKeys, eventName, data = {}) {
      const normalizedPermissionKeys = new Set(
        Array.isArray(permissionKeys)
          ? permissionKeys.filter((permissionKey) => typeof permissionKey === "string")
          : [],
      );

      if (normalizedPermissionKeys.size === 0) {
        return;
      }

      broadcastToMatcher(
        (client) => client.permissions.some((permission) => normalizedPermissionKeys.has(permission)),
        eventName,
        data,
      );
    },
    broadcastToUsers(usernames, eventName, data = {}) {
      const usernameSet = new Set(
        Array.isArray(usernames)
          ? usernames.filter((username) => typeof username === "string")
          : [],
      );

      broadcastToMatcher(
        (client) => usernameSet.has(client.username),
        eventName,
        data,
      );
    },
    getClientCount() {
      return clients.size;
    },
  };
}
