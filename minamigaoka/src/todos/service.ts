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
import type { RelatedRef, Todo, TodoKind, TodoSharedScope } from "../types";

const todosCollection = db ? collection(db, "todos") : null;

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
  value === "parent" || value === "officer" || value === "child" ? value : undefined;

const toTodo = (id: string, value: Record<string, unknown>): Todo => ({
  id,
  kind: toTodoKind(value.kind),
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
});

const toPayload = (todo: Omit<Todo, "id">) => ({
  kind: todo.kind,
  sharedScope: todo.kind === "shared" ? todo.sharedScope ?? null : null,
  title: todo.title.trim(),
  memo: todo.memo?.trim() ? todo.memo : null,
  completed: todo.completed,
  createdAt: todo.createdAt,
  createdByUid: todo.createdByUid ?? null,
  assigneeUid: todo.assigneeUid ?? null,
  dueDate: todo.dueDate ?? null,
  related: todo.related ?? null,
  updatedAt: serverTimestamp(),
});

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
