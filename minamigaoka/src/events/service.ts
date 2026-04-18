import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { db, hasFirebaseAppConfig } from "../config/firebase";
import type {
  EventCarpoolVehicle,
  EventCommonChecklistItem,
  EventKind,
  EventPersonalChecklistItem,
  EventRecord,
  EventState,
  EventTimelineItem,
} from "../types";

const eventsCollection = db ? collection(db, "events") : null;
const eventPersonalChecklistStatesCollection = db ? collection(db, "eventPersonalChecklistStates") : null;

const ensureDb = () => {
  if (!db || !hasFirebaseAppConfig || !eventsCollection) {
    throw new Error("Firebase 設定が未設定のため、イベントを Firestore で扱えません。");
  }
};

const toEventKind = (value: unknown): EventKind => {
  if (
    value === "コンクール" ||
    value === "演奏会" ||
    value === "合同練習" ||
    value === "その他"
  ) {
    return value;
  }
  return "その他";
};

const toEventState = (value: unknown): EventState => (value === "done" ? "done" : "active");

const toOptionalString = (value: unknown): string | undefined => {
  const normalized = typeof value === "string" ? value.trim() : "";
  return normalized ? normalized : undefined;
};

const toOptionalCapacity = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && /^\d+$/.test(value.trim())) return Number(value.trim());
  return null;
};

const toBooleanWithDefault = (value: unknown, defaultValue: boolean): boolean =>
  typeof value === "boolean" ? value : defaultValue;

const toStringIdArray = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];

const toCarpoolVehicle = (value: unknown): EventCarpoolVehicle | null => {
  if (!value || typeof value !== "object") return null;
  const source = value as Record<string, unknown>;
  const familyId = typeof source.familyId === "string" ? source.familyId : "";
  const familyNameSnapshot = typeof source.familyNameSnapshot === "string" ? source.familyNameSnapshot : "";
  const vehicleIndex =
    typeof source.vehicleIndex === "number" && Number.isFinite(source.vehicleIndex) ? source.vehicleIndex : -1;

  if (!familyId || vehicleIndex < 0) return null;

  return {
    familyId,
    familyNameSnapshot,
    vehicleIndex,
    maker: typeof source.maker === "string" ? source.maker : "",
    model: typeof source.model === "string" ? source.model : "",
    capacity: toOptionalCapacity(source.capacity),
    canOutbound: toBooleanWithDefault(source.canOutbound, true),
    canReturn: toBooleanWithDefault(source.canReturn, true),
    outboundMemberIds: toStringIdArray(source.outboundMemberIds),
    returnMemberIds: toStringIdArray(source.returnMemberIds),
    isEquipmentVehicle: toBooleanWithDefault(source.isEquipmentVehicle, false),
  };
};

const toTimelineItem = (value: unknown): EventTimelineItem | null => {
  if (!value || typeof value !== "object") return null;
  const source = value as Record<string, unknown>;
  const id = typeof source.id === "string" ? source.id.trim() : "";
  const startTime = typeof source.startTime === "string" ? source.startTime.trim() : "";
  const title = typeof source.title === "string" ? source.title.trim() : "";
  if (!id || !startTime || !title) return null;

  return {
    id,
    startTime,
    endTime: toOptionalString(source.endTime),
    title,
    details: toOptionalString(source.details),
  };
};

const toCommonChecklistItem = (value: unknown): EventCommonChecklistItem | null => {
  if (!value || typeof value !== "object") return null;
  const source = value as Record<string, unknown>;
  const id = typeof source.id === "string" ? source.id.trim() : "";
  const label = typeof source.label === "string" ? source.label.trim() : "";
  if (!id || !label) return null;

  return {
    id,
    label,
    memo: toOptionalString(source.memo),
    checked: toBooleanWithDefault(source.checked, false),
    sortOrder: typeof source.sortOrder === "number" && Number.isFinite(source.sortOrder) ? source.sortOrder : undefined,
  };
};

const toPersonalChecklistItem = (value: unknown): EventPersonalChecklistItem | null => {
  if (!value || typeof value !== "object") return null;
  const source = value as Record<string, unknown>;
  const id = typeof source.id === "string" ? source.id.trim() : "";
  const label = typeof source.label === "string" ? source.label.trim() : "";
  if (!id || !label) return null;

  return {
    id,
    label,
    memo: toOptionalString(source.memo),
    sortOrder: typeof source.sortOrder === "number" && Number.isFinite(source.sortOrder) ? source.sortOrder : undefined,
  };
};

const toEventRecord = (id: string, value: Record<string, unknown>): EventRecord => ({
  id,
  title: typeof value.title === "string" ? value.title : "",
  kind: toEventKind(value.kind),
  state: toEventState(value.state),
  eventSortDate: typeof value.eventSortDate === "string" ? value.eventSortDate : "",
  memo: toOptionalString(value.memo),
  sessionIds: Array.isArray(value.sessionIds)
    ? value.sessionIds.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [],
  timetableItems: Array.isArray(value.timetableItems)
    ? value.timetableItems.reduce<EventTimelineItem[]>((result, item) => {
        const normalized = toTimelineItem(item);
        if (normalized) result.push(normalized);
        return result;
      }, [])
    : [],
  commonChecklistItems: Array.isArray(value.commonChecklistItems)
    ? value.commonChecklistItems.reduce<EventCommonChecklistItem[]>((result, item) => {
        const normalized = toCommonChecklistItem(item);
        if (normalized) result.push(normalized);
        return result;
      }, [])
    : [],
  personalChecklistItems: Array.isArray(value.personalChecklistItems)
    ? value.personalChecklistItems.reduce<EventPersonalChecklistItem[]>((result, item) => {
        const normalized = toPersonalChecklistItem(item);
        if (normalized) result.push(normalized);
        return result;
      }, [])
    : [],
  carpoolVehicles: Array.isArray(value.carpoolVehicles)
    ? value.carpoolVehicles.reduce<EventCarpoolVehicle[]>((result, item) => {
        const normalized = toCarpoolVehicle(item);
        if (normalized) result.push(normalized);
        return result;
      }, [])
    : [],
});

const toPayload = (event: Omit<EventRecord, "id">) => ({
  title: event.title.trim(),
  kind: event.kind,
  state: event.state,
  eventSortDate: event.eventSortDate,
  memo: event.memo?.trim() || "",
  sessionIds: Array.isArray(event.sessionIds) ? event.sessionIds : [],
  timetableItems: Array.isArray(event.timetableItems)
    ? event.timetableItems.map((item) => ({
        id: item.id,
        startTime: item.startTime,
        endTime: item.endTime?.trim() || "",
        title: item.title.trim(),
        details: item.details?.trim() || "",
      }))
    : [],
  commonChecklistItems: Array.isArray(event.commonChecklistItems)
    ? event.commonChecklistItems.map((item) => ({
        id: item.id,
        label: item.label.trim(),
        memo: item.memo?.trim() || "",
        checked: item.checked === true,
        sortOrder: typeof item.sortOrder === "number" && Number.isFinite(item.sortOrder) ? item.sortOrder : null,
      }))
    : [],
  personalChecklistItems: Array.isArray(event.personalChecklistItems)
    ? event.personalChecklistItems.map((item) => ({
        id: item.id,
        label: item.label.trim(),
        memo: item.memo?.trim() || "",
        sortOrder: typeof item.sortOrder === "number" && Number.isFinite(item.sortOrder) ? item.sortOrder : null,
      }))
    : [],
  carpoolVehicles: Array.isArray(event.carpoolVehicles)
    ? event.carpoolVehicles.map((vehicle) => ({
        familyId: vehicle.familyId,
        familyNameSnapshot: vehicle.familyNameSnapshot.trim(),
        vehicleIndex: vehicle.vehicleIndex,
        maker: vehicle.maker.trim(),
        model: vehicle.model.trim(),
        capacity: toOptionalCapacity(vehicle.capacity),
        canOutbound: vehicle.canOutbound !== false,
        canReturn: vehicle.canReturn !== false,
        outboundMemberIds: Array.isArray(vehicle.outboundMemberIds) ? vehicle.outboundMemberIds : [],
        returnMemberIds: Array.isArray(vehicle.returnMemberIds) ? vehicle.returnMemberIds : [],
        isEquipmentVehicle: vehicle.isEquipmentVehicle === true,
      }))
    : [],
  updatedAt: serverTimestamp(),
});

export const subscribeEvents = (
  callback: (events: EventRecord[]) => void,
  onError?: (error: Error) => void,
): (() => void) => {
  ensureDb();

  return onSnapshot(
    eventsCollection!,
    (snapshot) => {
      callback(
        snapshot.docs
          .map((item) => toEventRecord(item.id, item.data() as Record<string, unknown>))
          .sort((left, right) =>
            `${left.eventSortDate}-${left.title}`.localeCompare(`${right.eventSortDate}-${right.title}`, "ja"),
          ),
      );
    },
    (error) => {
      onError?.(error instanceof Error ? error : new Error("events subscription failed"));
    },
  );
};

export const createEvent = async (event: Omit<EventRecord, "id">): Promise<void> => {
  ensureDb();
  await addDoc(eventsCollection!, {
    ...toPayload(event),
    createdAt: serverTimestamp(),
  });
};

export const saveEvent = async (event: EventRecord): Promise<void> => {
  ensureDb();
  await setDoc(doc(eventsCollection!, event.id), toPayload(event), { merge: true });
};

export const deleteEvent = async (eventId: string): Promise<void> => {
  ensureDb();
  await deleteDoc(doc(eventsCollection!, eventId));
};

const buildEventPersonalChecklistStateId = (eventId: string, memberId: string): string => `${eventId}__${memberId}`;

export const subscribeEventPersonalChecklistState = (
  eventId: string,
  memberId: string,
  callback: (checkedItemIds: string[]) => void,
  onError?: (error: Error) => void,
): (() => void) => {
  ensureDb();

  return onSnapshot(
    doc(eventPersonalChecklistStatesCollection!, buildEventPersonalChecklistStateId(eventId, memberId)),
    (snapshot) => {
      const value = snapshot.data() as Record<string, unknown> | undefined;
      callback(toStringIdArray(value?.checkedItemIds));
    },
    (error) => {
      onError?.(error instanceof Error ? error : new Error("event personal checklist subscription failed"));
    },
  );
};

export const saveEventPersonalChecklistState = async (
  eventId: string,
  memberId: string,
  checkedItemIds: string[],
): Promise<void> => {
  ensureDb();
  await setDoc(
    doc(eventPersonalChecklistStatesCollection!, buildEventPersonalChecklistStateId(eventId, memberId)),
    {
      eventId,
      memberId,
      checkedItemIds,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
};
