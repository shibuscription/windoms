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
import type {
  AuthUsersResponse,
  FamilyRecord,
  MemberRecord,
  MemberRelationRecord,
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
  status: value.status === "inactive" ? "inactive" : "active",
  notes: typeof value.notes === "string" ? value.notes : "",
  createdAt: value.createdAt ?? null,
  updatedAt: value.updatedAt ?? null,
});

const toMemberRecord = (id: string, value: Record<string, unknown>): MemberRecord => ({
  id,
  familyId: typeof value.familyId === "string" ? value.familyId : "",
  name: typeof value.name === "string" ? value.name : "",
  nameKana: typeof value.nameKana === "string" ? value.nameKana : "",
  role:
    value.role === "admin" ||
    value.role === "officer" ||
    value.role === "child" ||
    value.role === "teacher"
      ? value.role
      : "parent",
  permissions: Array.isArray(value.permissions)
    ? value.permissions.filter((item): item is string => typeof item === "string")
    : [],
  status: value.status === "inactive" ? "inactive" : "active",
  loginId: typeof value.loginId === "string" ? value.loginId : "",
  authUid: typeof value.authUid === "string" ? value.authUid : "",
  authEmail: typeof value.authEmail === "string" ? value.authEmail : "",
  createdAt: value.createdAt ?? null,
  updatedAt: value.updatedAt ?? null,
});

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
    callback(snapshot.docs.map((item) => toFamilyRecord(item.id, item.data() as Record<string, unknown>)));
  });
};

export const subscribeMembers = (callback: (rows: MemberRecord[]) => void): (() => void) => {
  ensureDb();
  return onSnapshot(query(membersCollection!, orderBy("nameKana", "asc")), (snapshot) => {
    callback(snapshot.docs.map((item) => toMemberRecord(item.id, item.data() as Record<string, unknown>)));
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
  const payload = {
    familyId: input.familyId,
    name: input.name.trim(),
    nameKana: input.nameKana.trim(),
    role: input.role,
    permissions: input.permissions,
    status: input.status,
    loginId: normalizedLoginId,
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
    throw new Error("所属 member が残っているため、この family は削除できません。");
  }

  await deleteDoc(doc(familiesCollection!, familyId));
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
