import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { db, hasFirebaseAppConfig } from "../config/firebase";
import type { RecurringTodoTemplate, RelatedRef, Todo, TodoKind, TodoSharedScope } from "../types";
import { normalizeTodoSharedScopes } from "../utils/todoUtils";

const todosCollection = db ? collection(db, "todos") : null;
const recurringTodoTemplatesCollection = db ? collection(db, "recurringTodoTemplates") : null;

const ensureDb = () => {
  if (!db || !hasFirebaseAppConfig || !todosCollection) {
    throw new Error("Firebase 設定が未設定のため、TODO を Firestore で扱えません。");
  }
};

const toRelatedRef = (value: unknown): RelatedRef | null => {
  if (!value || typeof value !== "object") return null;
  const source = value as Record<string, unknown>;
  const type = source.type;
  const id = source.id;
  if ((type === "event" || type === "session") && typeof id === "string" && id.trim()) {
    return { type, id };
  }
  return null;
};

const toTodoKind = (value: unknown): TodoKind => (value === "private" ? "private" : "shared");
const toTodoSharedScope = (value: unknown): TodoSharedScope | undefined =>
  value === "parent" || value === "officer" || value === "child" || value === "accounting"
    ? value
    : undefined;
const toTodoSharedScopes = (value: unknown): TodoSharedScope[] =>
  Array.isArray(value)
    ? value.filter(
        (item): item is TodoSharedScope =>
          item === "parent" || item === "officer" || item === "child" || item === "accounting",
      )
    : [];

const toTodo = (id: string, value: Record<string, unknown>): Todo => ({
  id,
  kind: toTodoKind(value.kind),
  sharedScopes: toTodoSharedScopes(value.sharedScopes),
  sharedScope: toTodoSharedScope(value.sharedScope),
  title: typeof value.title === "string" ? value.title : "",
  memo: typeof value.memo === "string" ? value.memo : undefined,
  completed: value.completed === true,
  createdAt:
    typeof value.createdAt === "string" && value.createdAt.trim()
      ? value.createdAt
      : new Date(0).toISOString(),
  createdByUid:
    typeof value.createdByUid === "string" && value.createdByUid.trim() ? value.createdByUid : null,
  assigneeUid: typeof value.assigneeUid === "string" && value.assigneeUid.trim() ? value.assigneeUid : null,
  dueDate: typeof value.dueDate === "string" && value.dueDate.trim() ? value.dueDate : undefined,
  related: toRelatedRef(value.related),
  sourceRecurringTodoId:
    typeof value.sourceRecurringTodoId === "string" && value.sourceRecurringTodoId.trim()
      ? value.sourceRecurringTodoId
      : null,
  occurrenceKey:
    typeof value.occurrenceKey === "string" && value.occurrenceKey.trim() ? value.occurrenceKey : null,
});

const toPayload = (todo: Omit<Todo, "id">) => {
  const sharedScopes = normalizeTodoSharedScopes(todo);
  return {
  kind: todo.kind,
  sharedScopes: todo.kind === "shared" ? sharedScopes : [],
  sharedScope: todo.kind === "shared" ? sharedScopes[0] ?? null : null,
  title: todo.title.trim(),
  memo: todo.memo?.trim() ? todo.memo : null,
  completed: todo.completed,
  createdAt: todo.createdAt,
  createdByUid: todo.createdByUid ?? null,
  assigneeUid: todo.assigneeUid ?? null,
  dueDate: todo.dueDate ?? null,
  related: todo.related ?? null,
  sourceRecurringTodoId: todo.sourceRecurringTodoId ?? null,
  occurrenceKey: todo.occurrenceKey ?? null,
  updatedAt: serverTimestamp(),
  };
};

const toRecurringTodoTemplate = (id: string, value: Record<string, unknown>): RecurringTodoTemplate => ({
  id,
  kind: toTodoKind(value.kind),
  title: typeof value.title === "string" ? value.title : "",
  memo: typeof value.memo === "string" ? value.memo : undefined,
  dayOfMonth:
    typeof value.dayOfMonth === "number" && Number.isFinite(value.dayOfMonth) ? value.dayOfMonth : 1,
  isActive: value.isActive !== false,
  createdAt:
    typeof value.createdAt === "string" && value.createdAt.trim() ? value.createdAt : new Date(0).toISOString(),
  createdByUid:
    typeof value.createdByUid === "string" && value.createdByUid.trim() ? value.createdByUid : null,
  updatedAt: typeof value.updatedAt === "string" && value.updatedAt.trim() ? value.updatedAt : undefined,
  sharedScopes: toTodoSharedScopes(value.sharedScopes),
  sharedScope: toTodoSharedScope(value.sharedScope),
});

const toRecurringTemplatePayload = (template: Omit<RecurringTodoTemplate, "id">) => {
  const sharedScopes = normalizeTodoSharedScopes(template);
  return {
    kind: template.kind,
    title: template.title.trim(),
    memo: template.memo?.trim() ? template.memo : null,
    dayOfMonth: template.dayOfMonth,
    isActive: template.isActive,
    createdAt: template.createdAt,
    createdByUid: template.createdByUid ?? null,
    updatedAt: serverTimestamp(),
    sharedScopes: template.kind === "shared" ? sharedScopes : [],
    sharedScope: template.kind === "shared" ? sharedScopes[0] ?? null : null,
  };
};

export const subscribeTodos = (
  callback: (todos: Todo[]) => void,
  onError?: (error: Error) => void,
): (() => void) => {
  ensureDb();

  return onSnapshot(
    query(todosCollection!, orderBy("createdAt", "asc")),
    (snapshot) => {
      callback(snapshot.docs.map((item) => toTodo(item.id, item.data() as Record<string, unknown>)));
    },
    (error) => {
      onError?.(error instanceof Error ? error : new Error("todos subscription failed"));
    },
  );
};

export const createTodo = async (todo: Omit<Todo, "id">): Promise<void> => {
  ensureDb();
  await addDoc(todosCollection!, toPayload(todo));
};

export const saveTodo = async (todo: Todo): Promise<void> => {
  ensureDb();
  await setDoc(doc(todosCollection!, todo.id), toPayload(todo));
};

export const deleteTodo = async (todoId: string): Promise<void> => {
  ensureDb();
  await deleteDoc(doc(todosCollection!, todoId));
};

export const subscribeRecurringTodoTemplates = (
  callback: (templates: RecurringTodoTemplate[]) => void,
  onError?: (error: Error) => void,
): (() => void) => {
  if (!db || !hasFirebaseAppConfig || !recurringTodoTemplatesCollection) {
    callback([]);
    return () => undefined;
  }
  return onSnapshot(
    query(recurringTodoTemplatesCollection, orderBy("createdAt", "asc")),
    (snapshot) => {
      callback(
        snapshot.docs
          .map((item) => toRecurringTodoTemplate(item.id, item.data() as Record<string, unknown>))
          .sort((left, right) => {
            if (left.dayOfMonth !== right.dayOfMonth) return left.dayOfMonth - right.dayOfMonth;
            return left.title.localeCompare(right.title, "ja");
          }),
      );
    },
    (error) => onError?.(error instanceof Error ? error : new Error("recurring todo templates subscription failed")),
  );
};

export const createRecurringTodoTemplate = async (
  template: Omit<RecurringTodoTemplate, "id">,
): Promise<void> => {
  if (!db || !hasFirebaseAppConfig || !recurringTodoTemplatesCollection) {
    throw new Error("Firebase が設定されていないため、定例TODOテンプレートを保存できません。");
  }
  await addDoc(recurringTodoTemplatesCollection, toRecurringTemplatePayload(template));
};

export const saveRecurringTodoTemplate = async (template: RecurringTodoTemplate): Promise<void> => {
  if (!db || !hasFirebaseAppConfig || !recurringTodoTemplatesCollection) {
    throw new Error("Firebase が設定されていないため、定例TODOテンプレートを保存できません。");
  }
  await setDoc(doc(recurringTodoTemplatesCollection, template.id), toRecurringTemplatePayload(template));
};

export const deleteRecurringTodoTemplate = async (templateId: string): Promise<void> => {
  if (!db || !hasFirebaseAppConfig || !recurringTodoTemplatesCollection) {
    throw new Error("Firebase が設定されていないため、定例TODOテンプレートを削除できません。");
  }
  await deleteDoc(doc(recurringTodoTemplatesCollection, templateId));
};
