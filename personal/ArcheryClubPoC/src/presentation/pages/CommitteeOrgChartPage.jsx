import { useCallback, useEffect, useState } from "react";

function buildHeaders(currentUserProfile) {
  return {
    "Content-Type": "application/json",
    "x-actor-username": currentUserProfile?.auth?.username ?? "",
  };
}

async function readJsonResponse(response, fallbackMessage) {
  const contentType = response.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    return response.json();
  }

  const responseText = await response.text();

  if (responseText.trim().startsWith("<!DOCTYPE")) {
    throw new Error(
      `${fallbackMessage} If the server was already running, restart it and try again.`,
    );
  }

  throw new Error(fallbackMessage);
}

export function CommitteeOrgChartPage({ currentUserProfile }) {
  const [roles, setRoles] = useState([]);
  const [members, setMembers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [savingRoleId, setSavingRoleId] = useState(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const isAdmin = currentUserProfile?.membership?.role === "admin";

  const loadCommitteeRoles = useCallback(async (signal) => {
    setIsLoading(true);
    setError("");

    try {
      const response = await fetch("/api/committee-roles", {
        headers: buildHeaders(currentUserProfile),
        cache: "no-store",
        signal,
      });
      const result = await readJsonResponse(
        response,
        "Unable to load committee roles.",
      );

      if (!response.ok || !result.success) {
        throw new Error(result.message ?? "Unable to load committee roles.");
      }

      if (signal?.aborted) {
        return;
      }

      setRoles(result.roles ?? []);
      setMembers(result.members ?? []);
    } catch (loadError) {
      if (!signal?.aborted) {
        setError(loadError.message);
      }
    } finally {
      if (!signal?.aborted) {
        setIsLoading(false);
      }
    }
  }, [currentUserProfile]);

  useEffect(() => {
    const abortController = new AbortController();
    loadCommitteeRoles(abortController.signal);

    return () => {
      abortController.abort();
    };
  }, [loadCommitteeRoles]);

  const handleAssignMember = async (roleId, assignedUsername) => {
    setSavingRoleId(roleId);
    setError("");
    setMessage("");

    try {
      const response = await fetch(`/api/committee-roles/${roleId}`, {
        method: "PUT",
        headers: buildHeaders(currentUserProfile),
        cache: "no-store",
        body: JSON.stringify({
          assignedUsername: assignedUsername || null,
        }),
      });
      const result = await readJsonResponse(
        response,
        "Unable to update committee role.",
      );

      if (!response.ok || !result.success) {
        throw new Error(result.message ?? "Unable to update committee role.");
      }

      setRoles((current) =>
        current.map((role) => (role.id === result.role.id ? result.role : role)),
      );
      setMessage(`${result.role.title} updated successfully.`);
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setSavingRoleId(null);
    }
  };

  return (
    <div className="profile-page">
      <p>
        Committee roles for the archery club, ordered from senior governance roles
        through to associate member positions.
      </p>

      {isLoading ? <p>Loading committee roles...</p> : null}
      {error ? <p className="profile-error">{error}</p> : null}
      {message ? <p className="profile-success">{message}</p> : null}

      {!isLoading ? (
        <section className="profile-form committee-roles-panel">
          <h3 className="profile-section-title committee-roles-title">
            Committee Roles Table
          </h3>

          <div className="committee-roles-table-wrap">
            <table className="committee-roles-table">
              <thead>
                <tr>
                  <th>Committee role</th>
                  <th>Summary</th>
                  <th>Assigned member</th>
                </tr>
              </thead>
              <tbody>
                {roles.map((role) => (
                  <tr key={role.id}>
                    <td>{role.title}</td>
                    <td>{role.summary}</td>
                    <td>
                      {isAdmin ? (
                        <label className="committee-role-assignment">
                          <select
                            value={role.assignedMember?.username ?? ""}
                            onChange={(event) =>
                              handleAssignMember(role.id, event.target.value)
                            }
                            disabled={savingRoleId === role.id}
                          >
                            <option value="">Unassigned</option>
                            {members.map((member) => (
                              <option key={member.username} value={member.username}>
                                {member.fullName} ({member.username})
                              </option>
                            ))}
                          </select>
                        </label>
                      ) : role.assignedMember ? (
                        `${role.assignedMember.fullName} (${role.assignedMember.username})`
                      ) : (
                        "Unassigned"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  );
}
