import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { SectionPanel } from "../components/SectionPanel";
import { StatusMessagePanel } from "../components/StatusMessagePanel";
import { hasPermission } from "../../utils/userProfile";
import { fetchApi } from "../../lib/api";

function buildHeaders(currentUserProfile) {
  return {
    "Content-Type": "application/json",
    "x-actor-username": currentUserProfile?.auth?.username ?? "",
  };
}

type CommitteeMember = {
  username: string;
  fullName: string;
};

type CommitteeRole = {
  id: number;
  title: string;
  summary: string;
  assignedMember?: CommitteeMember | null;
};

type CommitteeRolesResponse = {
  success: true;
  roles?: CommitteeRole[];
  members?: CommitteeMember[];
};

const committeeQueryKeys = {
  roles: (actorUsername: string) => ["committee-roles", actorUsername] as const,
};

export function CommitteeOrgChartPage({ currentUserProfile }) {
  const [savingRoleId, setSavingRoleId] = useState(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const canManageCommitteeRoles = hasPermission(
    currentUserProfile,
    "manage_committee_roles",
  );
  const actorUsername = currentUserProfile?.auth?.username ?? "";
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: committeeQueryKeys.roles(actorUsername),
    queryFn: () =>
      fetchApi<CommitteeRolesResponse>("/api/committee-roles", {
        headers: buildHeaders(currentUserProfile),
        cache: "no-store",
      }),
    enabled: Boolean(actorUsername),
  });

  const roles = data?.roles ?? [];
  const members = data?.members ?? [];

  const assignMemberMutation = useMutation({
    mutationFn: async ({
      roleId,
      assignedUsername,
    }: {
      roleId: number;
      assignedUsername: string;
    }) =>
      fetchApi<{ success: true; role: CommitteeRole }>(
        `/api/committee-roles/${roleId}`,
        {
          method: "PUT",
          headers: buildHeaders(currentUserProfile),
          cache: "no-store",
          body: JSON.stringify({
            assignedUsername: assignedUsername || null,
          }),
        },
      ),
    onMutate: ({ roleId }) => {
      setSavingRoleId(roleId);
      setError("");
      setMessage("");
    },
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({
        queryKey: committeeQueryKeys.roles(actorUsername),
      });
      setMessage(`${result.role.title} updated successfully.`);
    },
    onError: (saveError: Error) => {
      setError(saveError.message);
    },
    onSettled: () => {
      setSavingRoleId(null);
    },
  });

  const handleAssignMember = async (roleId, assignedUsername) => {
    await assignMemberMutation.mutateAsync({ roleId, assignedUsername });
  };

  return (
    <div className="profile-page">
      <p>
        Committee roles for the archery club, ordered from senior governance roles
        through to associate member positions.
      </p>

      <StatusMessagePanel
        error={error}
        loading={isLoading}
        loadingLabel="Loading committee roles..."
        success={message}
      />

      {data ? (
        <SectionPanel
          className="profile-form committee-roles-panel"
          title="Committee Roles Table"
          titleClassName="committee-roles-title"
        >
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
                      {canManageCommitteeRoles ? (
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
        </SectionPanel>
      ) : null}
    </div>
  );
}
