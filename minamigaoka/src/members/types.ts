export type FamilyStatus = "active" | "inactive";
export type MemberRole = "admin" | "officer" | "parent" | "child" | "teacher";
export type MemberStatus = "active" | "inactive";
export type MemberPermission = string;
export type RelationshipType =
  | "father"
  | "mother"
  | "grandfather"
  | "grandmother"
  | "uncle"
  | "aunt"
  | "guardian_other";
export type RelationStatus = "active" | "inactive";

export type FamilyRecord = {
  id: string;
  name: string;
  status: FamilyStatus;
  notes: string;
  createdAt: unknown;
  updatedAt: unknown;
};

export type MemberRecord = {
  id: string;
  familyId: string;
  name: string;
  nameKana: string;
  role: MemberRole;
  permissions: MemberPermission[];
  status: MemberStatus;
  loginId: string;
  authUid: string;
  authEmail: string;
  createdAt: unknown;
  updatedAt: unknown;
};

export type MemberRelationRecord = {
  id: string;
  childMemberId: string;
  guardianMemberId: string;
  relationType: RelationshipType;
  status: RelationStatus;
  createdAt: unknown;
  updatedAt: unknown;
};

export type AuthUserSummary = {
  uid: string;
  email: string;
  displayName: string;
  disabled: boolean;
  creationTime: string;
  lastSignInTime: string;
};

export type AuthUsersResponse = {
  users: AuthUserSummary[];
  projectId: string;
  fetchedAt: string;
  functionsRegion?: string;
  errorCode?: string;
  errorMessage?: string;
};

export type SaveFamilyInput = Pick<FamilyRecord, "name" | "status" | "notes">;

export type SaveMemberInput = Pick<
  MemberRecord,
  "familyId" | "name" | "nameKana" | "role" | "permissions" | "status" | "loginId"
>;

export type SaveRelationInput = Pick<
  MemberRelationRecord,
  "childMemberId" | "guardianMemberId" | "relationType" | "status"
>;
