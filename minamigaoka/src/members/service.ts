import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  writeBatch,
  where,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import {
  db,
  firebaseFunctionsRegion,
  firebaseProjectId,
  functions,
  hasFirebaseAppConfig,
} from "../config/firebase";
import { normalizeLoginId, toInternalAuthEmail } from "../auth/loginId";
import { sortFamiliesByDisplayOrder } from "./familyOrder";
import { normalizeInstrumentCodes } from "./instruments";
import {
  deriveLegacyPermissions,
  deriveLegacyRole,
  normalizeAdminRole,
  normalizeMemberStatus,
  normalizeMemberTypes,
  normalizeStaffPermissions,
} from "./permissions";
import type {
  AuthUsersResponse,
  BulkRegisterMemberRow,
  BulkRegisterMembersResponse,
  FamilyRecord,
  FamilyVehicleRecord,
  MemberRecord,
  MemberRelationRecord,
  MemberType,
  SaveFamilyInput,
  SaveMemberInput,
  SaveRelationInput,
} from "./types";

const familiesCollection = db ? collection(db, "families") : null;
const membersCollection = db ? collection(db, "members") : null;
const relationsCollection = db ? collection(db, "memberRelations") : null;

const toFamilyRecord = (id: string, value: Record<string, unknown>): FamilyRecord => ({
  id,
  name: typeof value.name === "string" ? value.name : "",
  sortOrder:
    typeof value.sortOrder === "number" && Number.isFinite(value.sortOrder) ? value.sortOrder : null,
  address: typeof value.address === "string" ? value.address : "",
  vehicles: Array.isArray(value.vehicles)
    ? value.vehicles.reduce<FamilyVehicleRecord[]>((result, item) => {
        if (!item || typeof item !== "object") return result;
        const source = item as Record<string, unknown>;
        const capacity =
          typeof source.capacity === "number" && Number.isFinite(source.capacity)
            ? source.capacity
            : typeof source.capacity === "string" && source.capacity.trim() && /^\d+$/.test(source.capacity.trim())
              ? Number(source.capacity.trim())
              : null;
        result.push({
          maker: typeof source.maker === "string" ? source.maker : "",
          model: typeof source.model === "string" ? source.model : "",
          capacity,
          notes: typeof source.notes === "string" ? source.notes : "",
        });
        return result;
      }, [])
    : [],
  status: value.status === "inactive" ? "inactive" : "active",
  notes: typeof value.notes === "string" ? value.notes : "",
  createdAt: value.createdAt ?? null,
  updatedAt: value.updatedAt ?? null,
});

const composeDisplayName = (familyName: string, givenName: string, fallback = ""): string => {
  const composed = `${familyName.trim()}${givenName.trim()}`.trim();
  return composed || fallback.trim();
};

const toMemberRecord = (id: string, value: Record<string, unknown>): MemberRecord => {
  const legacyRole =
    value.role === "admin" ||
    value.role === "officer" ||
    value.role === "child" ||
    value.role === "teacher"
      ? value.role
      : "parent";
  const memberTypes = normalizeMemberTypes(value.memberTypes, legacyRole);
  const adminRole = normalizeAdminRole(value.adminRole, legacyRole);
  const staffPermissions = normalizeStaffPermissions(value.staffPermissions, legacyRole);
  const memberStatus = normalizeMemberStatus(value.memberStatus, value.status);
  const legacyDisplayName =
    typeof value.displayName === "string"
      ? value.displayName
      : typeof value.name === "string"
        ? value.name
        : "";
  const familyName =
    typeof value.familyName === "string" && value.familyName.trim()
      ? value.familyName
      : legacyDisplayName;
  const givenName = typeof value.givenName === "string" ? value.givenName : "";
  const legacyNameKana = typeof value.nameKana === "string" ? value.nameKana : "";
  const familyNameKana =
    typeof value.familyNameKana === "string" && value.familyNameKana.trim()
      ? value.familyNameKana
      : legacyNameKana;
  const givenNameKana = typeof value.givenNameKana === "string" ? value.givenNameKana : "";
  const displayName = composeDisplayName(familyName, givenName, legacyDisplayName);
  return {
    id,
    familyId: typeof value.familyId === "string" ? value.familyId : "",
    displayName,
    familyName,
    givenName,
    familyNameKana,
    givenNameKana,
    name: displayName,
    nameKana: familyNameKana,
    birthDate: typeof value.birthDate === "string" ? value.birthDate : "",
    phoneNumber: typeof value.phoneNumber === "string" ? value.phoneNumber : "",
    enrollmentYear:
      typeof value.enrollmentYear === "number" && Number.isFinite(value.enrollmentYear)
        ? value.enrollmentYear
        : typeof value.enrollmentYear === "string" && /^\d{4}$/.test(value.enrollmentYear)
          ? Number(value.enrollmentYear)
        : null,
    instrumentCodes: normalizeInstrumentCodes(value.instrumentCodes),
    memberTypes,
    adminRole,
    staffPermissions,
    memberStatus,
    role: legacyRole,
    permissions: Array.isArray(value.permissions)
      ? value.permissions.filter((item): item is string => typeof item === "string")
      : [],
    status: memberStatus,
    loginId: typeof value.loginId === "string" ? value.loginId : "",
    authUid: typeof value.authUid === "string" ? value.authUid : "",
    authEmail: typeof value.authEmail === "string" ? value.authEmail : "",
    sortOrders:
      value.sortOrders && typeof value.sortOrders === "object"
        ? (Object.entries(value.sortOrders as Record<string, unknown>).reduce<
            Partial<Record<MemberType, number>>
          >((result, [key, item]) => {
            if (
              (key === "child" ||
                key === "parent" ||
                key === "supporter" ||
                key === "obog" ||
                key === "teacher") &&
              typeof item === "number" &&
              Number.isFinite(item)
            ) {
              result[key] = item;
            }
            return result;
          }, {}))
        : {},
    notes: typeof value.notes === "string" ? value.notes : "",
    createdAt: value.createdAt ?? null,
    updatedAt: value.updatedAt ?? null,
  };
};

const needsNameBackfill = (member: MemberRecord): boolean => {
  const fallbackDisplayName = member.displayName || member.name;
  return (
    !member.familyName ||
    member.givenName === undefined ||
    !fallbackDisplayName ||
    member.familyNameKana === undefined ||
    member.givenNameKana === undefined
  );
};

const backfillLegacyMemberNameFields = async (rows: MemberRecord[]): Promise<void> => {
  if (!rows.some(needsNameBackfill)) return;
  ensureDb();
  const batch = writeBatch(db!);

  rows.filter(needsNameBackfill).forEach((member) => {
    const displayName = member.displayName || member.name;
    const familyNameKana = member.familyNameKana || member.nameKana || "";
    batch.set(
      doc(membersCollection!, member.id),
      {
        displayName,
        familyName: member.familyName || displayName,
        givenName: member.givenName ?? "",
        familyNameKana,
        givenNameKana: member.givenNameKana ?? "",
        name: displayName,
        nameKana: familyNameKana,
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
  });

  await batch.commit();
};

const toRelationRecord = (id: string, value: Record<string, unknown>): MemberRelationRecord => ({
  id,
  childMemberId:
    typeof value.childMemberId === "string"
      ? value.childMemberId
      : typeof value.fromMemberId === "string"
        ? value.fromMemberId
        : "",
  guardianMemberId:
    typeof value.guardianMemberId === "string"
      ? value.guardianMemberId
      : typeof value.toMemberId === "string"
        ? value.toMemberId
        : "",
  relationType:
    value.relationType === "father" ||
    value.relationType === "mother" ||
    value.relationType === "grandfather" ||
    value.relationType === "grandmother" ||
    value.relationType === "uncle" ||
    value.relationType === "aunt" ||
    value.relationType === "guardian_other"
      ? value.relationType
      : value.relationship === "father" ||
          value.relationship === "mother" ||
          value.relationship === "grandfather" ||
          value.relationship === "grandmother" ||
          value.relationship === "uncle" ||
          value.relationship === "aunt"
        ? value.relationship
        : "guardian_other",
  status: value.status === "inactive" ? "inactive" : "active",
  createdAt: value.createdAt ?? null,
  updatedAt: value.updatedAt ?? null,
});

const ensureDb = () => {
  if (!db || !hasFirebaseAppConfig) {
    throw new Error("Firebase 設定が不足しているため Firestore を利用できません。");
  }
};

const ensureFunctions = () => {
  if (!functions) {
    throw new Error(
      `Cloud Functions 設定が不足しています。projectId=${firebaseProjectId || "(empty)"} region=${firebaseFunctionsRegion}`,
    );
  }
};

export const subscribeFamilies = (callback: (rows: FamilyRecord[]) => void): (() => void) => {
  ensureDb();
  return onSnapshot(query(familiesCollection!, orderBy("name", "asc")), (snapshot) => {
    callback(sortFamiliesByDisplayOrder(snapshot.docs.map((item) => toFamilyRecord(item.id, item.data() as Record<string, unknown>))));
  });
};

export const subscribeMembers = (callback: (rows: MemberRecord[]) => void): (() => void) => {
  ensureDb();
  return onSnapshot(query(membersCollection!, orderBy("nameKana", "asc")), (snapshot) => {
    const rows = snapshot.docs.map((item) => toMemberRecord(item.id, item.data() as Record<string, unknown>));
    callback(rows);
    void backfillLegacyMemberNameFields(rows);
  });
};

export const subscribeMemberRelations = (
  callback: (rows: MemberRelationRecord[]) => void,
): (() => void) => {
  ensureDb();
  return onSnapshot(query(relationsCollection!, orderBy("updatedAt", "desc")), (snapshot) => {
    callback(snapshot.docs.map((item) => toRelationRecord(item.id, item.data() as Record<string, unknown>)));
  });
};

export const saveFamily = async (familyId: string | null, input: SaveFamilyInput): Promise<void> => {
  ensureDb();
  const payload = {
    name: input.name.trim(),
    sortOrder: typeof input.sortOrder === "number" && Number.isFinite(input.sortOrder) ? input.sortOrder : null,
    address: input.address.trim(),
    vehicles: input.vehicles.map((vehicle) => ({
      maker: vehicle.maker.trim(),
      model: vehicle.model.trim(),
      capacity:
        typeof vehicle.capacity === "number" && Number.isFinite(vehicle.capacity)
          ? vehicle.capacity
          : null,
      notes: vehicle.notes.trim(),
    })),
    status: input.status,
    notes: input.notes.trim(),
    updatedAt: serverTimestamp(),
  };

  if (familyId) {
    await setDoc(doc(familiesCollection!, familyId), payload, { merge: true });
    return;
  }

  await addDoc(familiesCollection!, {
    ...payload,
    createdAt: serverTimestamp(),
  });
};

export const saveMember = async (memberId: string | null, input: SaveMemberInput): Promise<void> => {
  ensureDb();
  const normalizedLoginId = input.loginId ? normalizeLoginId(input.loginId) : "";
  const legacyRole = deriveLegacyRole(input.memberTypes, input.adminRole);
  const legacyPermissions = deriveLegacyPermissions(input.staffPermissions);
  const normalizedEnrollmentYear =
    typeof input.enrollmentYear === "number" && Number.isFinite(input.enrollmentYear)
      ? input.enrollmentYear
      : null;
  const displayName = composeDisplayName(input.familyName, input.givenName, input.displayName || input.name);
  const payload = {
    familyId: input.familyId,
    displayName,
    familyName: input.familyName.trim(),
    givenName: input.givenName.trim(),
    familyNameKana: input.familyNameKana.trim(),
    givenNameKana: input.givenNameKana.trim(),
    name: displayName,
    nameKana: input.familyNameKana.trim(),
    birthDate: input.birthDate?.trim() ?? "",
    phoneNumber: input.phoneNumber.trim(),
    enrollmentYear: normalizedEnrollmentYear,
    instrumentCodes: normalizeInstrumentCodes(input.instrumentCodes),
    memberTypes: input.memberTypes,
    adminRole: input.adminRole,
    staffPermissions: input.staffPermissions,
    memberStatus: input.memberStatus,
    role: legacyRole,
    permissions: legacyPermissions,
    status: input.memberStatus,
    loginId: normalizedLoginId,
    sortOrders: input.sortOrders ?? {},
    notes: input.notes.trim(),
    updatedAt: serverTimestamp(),
  };

  if (memberId) {
    const memberRef = doc(membersCollection!, memberId);
    const currentSnapshot = await getDoc(memberRef);
    const currentValue = currentSnapshot.data() as Record<string, unknown> | undefined;
    const currentAuthUid = typeof currentValue?.authUid === "string" ? currentValue.authUid : "";
    const currentAuthEmail = typeof currentValue?.authEmail === "string" ? currentValue.authEmail : "";

    await setDoc(
      memberRef,
      {
        ...payload,
        authEmail: currentAuthUid
          ? currentAuthEmail
          : normalizedLoginId
            ? toInternalAuthEmail(normalizedLoginId)
            : "",
      },
      { merge: true },
    );
    return;
  }

  await addDoc(membersCollection!, {
    ...payload,
    authUid: "",
    authEmail: normalizedLoginId ? toInternalAuthEmail(normalizedLoginId) : "",
    createdAt: serverTimestamp(),
  });
};

export const saveMemberRelation = async (
  relationId: string | null,
  input: SaveRelationInput,
): Promise<void> => {
  ensureDb();
  const payload = {
    childMemberId: input.childMemberId,
    guardianMemberId: input.guardianMemberId,
    relationType: input.relationType,
    status: input.status,
    updatedAt: serverTimestamp(),
  };

  if (relationId) {
    await setDoc(doc(relationsCollection!, relationId), payload, { merge: true });
    return;
  }

  await addDoc(relationsCollection!, {
    ...payload,
    createdAt: serverTimestamp(),
  });
};

export const deactivateMemberRelation = async (relationId: string): Promise<void> => {
  ensureDb();
  await setDoc(
    doc(relationsCollection!, relationId),
    {
      status: "inactive",
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
};

export const deleteMemberRelation = async (relationId: string): Promise<void> => {
  ensureDb();
  await deleteDoc(doc(relationsCollection!, relationId));
};

export const deleteMember = async (memberId: string): Promise<void> => {
  ensureDb();

  const batch = writeBatch(db!);
  batch.delete(doc(membersCollection!, memberId));

  const relatedRelations = await getDocs(query(relationsCollection!, where("childMemberId", "==", memberId)));
  relatedRelations.docs.forEach((item) => batch.delete(item.ref));

  const inverseRelations = await getDocs(
    query(relationsCollection!, where("guardianMemberId", "==", memberId)),
  );
  inverseRelations.docs.forEach((item) => batch.delete(item.ref));

  await batch.commit();
};

export const deleteFamily = async (familyId: string): Promise<void> => {
  ensureDb();

  const linkedMembers = await getDocs(query(membersCollection!, where("familyId", "==", familyId), limit(1)));
  if (!linkedMembers.empty) {
    throw new Error("所属 member があるため、この family は削除できません。");
  }

  await deleteDoc(doc(familiesCollection!, familyId));
};

export const updateMemberTypeOrder = async (
  memberType: MemberType,
  orderedMemberIds: string[],
): Promise<void> => {
  ensureDb();
  const batch = writeBatch(db!);

  orderedMemberIds.forEach((memberId, index) => {
    batch.set(
      doc(membersCollection!, memberId),
      {
        sortOrders: {
          [memberType]: index,
        },
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
  });

  await batch.commit();
};

export const updateFamilyOrder = async (orderedFamilyIds: string[]): Promise<void> => {
  ensureDb();
  const batch = writeBatch(db!);

  orderedFamilyIds.forEach((familyId, index) => {
    batch.set(
      doc(familiesCollection!, familyId),
      {
        sortOrder: index,
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
  });

  await batch.commit();
};

export const getMemberByAuthUid = async (authUid: string): Promise<MemberRecord | null> => {
  ensureDb();
  const snapshot = await getDocs(query(membersCollection!, where("authUid", "==", authUid), limit(1)));
  const match = snapshot.docs[0];
  return match ? toMemberRecord(match.id, match.data() as Record<string, unknown>) : null;
};

export const listAuthUsers = async (): Promise<AuthUsersResponse> => {
  ensureFunctions();
  const callable = httpsCallable<undefined, AuthUsersResponse>(functions!, "listAuthUsers");
  const result = await callable();
  return {
    users: Array.isArray(result.data.users) ? result.data.users : [],
    projectId: typeof result.data.projectId === "string" ? result.data.projectId : "",
    fetchedAt: typeof result.data.fetchedAt === "string" ? result.data.fetchedAt : "",
    functionsRegion:
      typeof result.data.functionsRegion === "string" ? result.data.functionsRegion : firebaseFunctionsRegion,
    errorCode: typeof result.data.errorCode === "string" ? result.data.errorCode : "",
    errorMessage: typeof result.data.errorMessage === "string" ? result.data.errorMessage : "",
  };
};

export const linkMemberToAuthUser = async (
  memberId: string,
  authUid: string,
): Promise<{ authUid: string; authEmail: string }> => {
  ensureFunctions();
  const callable = httpsCallable<
    { memberId: string; authUid: string },
    { authUid: string; authEmail: string }
  >(functions!, "linkMemberAuth");
  const result = await callable({ memberId, authUid });
  return result.data;
};

export const resetMemberTemporaryPassword = async (
  memberId: string,
  newPassword: string,
): Promise<{ authUid: string }> => {
  ensureFunctions();
  const callable = httpsCallable<
    { memberId: string; newPassword: string },
    { authUid: string }
  >(functions!, "resetMemberTemporaryPassword");
  const result = await callable({ memberId, newPassword });
  return result.data;
};

export const bulkRegisterMembers = async (
  rows: BulkRegisterMemberRow[],
): Promise<BulkRegisterMembersResponse> => {
  ensureFunctions();
  const callable = httpsCallable<{ rows: BulkRegisterMemberRow[] }, BulkRegisterMembersResponse>(
    functions!,
    "bulkRegisterMembers",
  );
  const result = await callable({ rows });
  return result.data;
};
