export type PermissionOption = {
  key: string;
  label: string;
  description?: string;
};

export type Role = {
  roleKey: string;
  title: string;
  permissions: string[];
  assignedUserCount: number;
  isSystem?: boolean;
};

export type RoleDefinitionInput = {
  title: string;
  permissions: string[];
};

export type RolesSnapshot = {
  roles: Role[];
  permissions: PermissionOption[];
};
