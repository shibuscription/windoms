export type FamilyStatus = "active" | "inactive";
export type MemberRole = "admin" | "officer" | "parent" | "child" | "teacher";
export type MemberType = "parent" | "child" | "teacher" | "obog";
export type AdminRole = "none" | "officer" | "admin";
export type StaffPermission = "accounting" | "shift_management";
export type MemberStatus = "active" | "inactive";
export type MemberPermission = string;
export type InstrumentCode =
  | "piccolo"
  | "flute"
  | "clarinet"
  | "oboe"
  | "bassoon"
  | "soprano_sax"
  | "alto_sax"
  | "tenor_sax"
  | "baritone_sax"
  | "trumpet"
  | "horn"
  | "trombone"
  | "euphonium"
  | "tuba"
  | "bass"
  | "percussion";
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
  enrollmentYear: number | null;
  instrumentCodes: InstrumentCode[];
  memberTypes: MemberType[];
  adminRole: AdminRole;
  staffPermissions: StaffPermission[];
  memberStatus: MemberStatus;
  role: MemberRole;
  permissions: MemberPermission[];
  status: MemberStatus;
  loginId: string;
  authUid: string;
  authEmail: string;
  notes: string;
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
  | "familyId"
  | "name"
  | "nameKana"
  | "enrollmentYear"
  | "instrumentCodes"
  | "memberTypes"
  | "adminRole"
  | "staffPermissions"
  | "memberStatus"
  | "loginId"
  | "notes"
>;

export type SaveRelationInput = Pick<
  MemberRelationRecord,
  "childMemberId" | "guardianMemberId" | "relationType" | "status"
>;

export type InstrumentMasterItem = {
  code: InstrumentCode;
  label: string;
  sortOrder: number;
  isActive: boolean;
  group?: string;
};
