import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { LinkifiedText } from "../components/LinkifiedText";
import { saveEventPersonalChecklistState, subscribeEventPersonalChecklistState } from "../events/service";
import { buildFamilyMap, buildMemberIndexes, resolveFamilyNameFromIdentifier } from "../members/familyNameResolver";
import { sortMembersForDisplay } from "../members/permissions";
import { listFamilies, listMembers, subscribeFamilies, subscribeMembers } from "../members/service";
import type { FamilyRecord, MemberRecord } from "../members/types";
import { getSessionAssigneeRoleLabel, sessionTypeLabel } from "../schedule/sessionMeta";
import type {
  DemoData,
  EventCarpoolVehicle,
  EventCommonChecklistItem,
  EventKind,
  EventPersonalChecklistItem,
  EventRecord,
  EventTimelineItem,
  SessionDoc,
  Todo,
} from "../types";
import { canViewTodoByScope, getTodoTakeoverLabel, sortTodosOpenFirst } from "../utils/todoUtils";
import { todayDateKey } from "../utils/date";

type DemoMenuRole = "child" | "parent" | "admin";
type SessionType = "normal" | "self" | "event" | "other";

type LinkedSession = {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  type: SessionType;
  eventName?: string;
  location?: string;
  dutyName?: string;
};

type EventFormDraft = {
  title: string;
  kind: EventKind;
  eventSortDate: string;
  memo: string;
  state: EventRecord["state"];
  carpoolVehicles: EventCarpoolVehicle[];
};

type EventFormErrors = {
  title?: string;
  eventSortDate?: string;
};

type CarpoolVehicleOption = {
  key: string;
  label: string;
  vehicle: EventCarpoolVehicle;
};

type TimetableDraft = {
  startTime: string;
  endTime: string;
  title: string;
  details: string;
};

type ChecklistDraft = {
  label: string;
  memo: string;
};

type TimetableErrors = {
  startTime?: string;
  title?: string;
};

type ChecklistErrors = {
  label?: string;
};

type ChecklistScope = "common" | "personal";

const canManageEvents = (menuRole: DemoMenuRole): boolean => menuRole === "admin";

const toDateLabel = (dateKey: string): string => dateKey.replace(/-/g, "/");
const clubYearFromDateKey = (dateKey: string): number => {
  const year = Number(dateKey.slice(0, 4));
  const month = Number(dateKey.slice(5, 7));
  return month >= 9 ? year : year - 1;
};
const clubYearLabel = (year: number): string => `${year}年度`;

const createInitialDraft = (): EventFormDraft => ({
  title: "",
  kind: "その他",
  eventSortDate: "",
  memo: "",
  state: "active",
  carpoolVehicles: [],
});

const createInitialTimetableDraft = (): TimetableDraft => ({
  startTime: "",
  endTime: "",
  title: "",
  details: "",
});

const createInitialChecklistDraft = (): ChecklistDraft => ({
  label: "",
  memo: "",
});

const createLocalItemId = (prefix: string): string =>
  `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

const toVehicleLabel = (familyName: string, maker: string, model: string): string => {
  const familyLabel = familyName.trim() || "名称未設定";
  const vehicleLabel = [maker.trim(), model.trim()].filter(Boolean).join("/");
  return vehicleLabel ? `${familyLabel}（${vehicleLabel}）` : familyLabel;
};

const toPassengerCapacity = (capacity: number | null | undefined): number =>
  Math.max(0, typeof capacity === "number" && Number.isFinite(capacity) ? capacity - 1 : 0);

const summarizeCarpoolCapacities = (vehicles: EventCarpoolVehicle[]) =>
  vehicles.reduce(
    (summary, vehicle) => ({
      outbound: summary.outbound + (isOutboundAvailable(vehicle) ? toPassengerCapacity(vehicle.capacity) : 0),
      return: summary.return + (isReturnAvailable(vehicle) ? toPassengerCapacity(vehicle.capacity) : 0),
    }),
    { outbound: 0, return: 0 },
  );

const isOutboundAvailable = (vehicle: EventCarpoolVehicle): boolean => vehicle.canOutbound !== false;

const isReturnAvailable = (vehicle: EventCarpoolVehicle): boolean => vehicle.canReturn !== false;

const toCarpoolDirectionLabel = (vehicle: EventCarpoolVehicle): string => {
  const labels: string[] = [];
  if (isOutboundAvailable(vehicle)) labels.push("行き");
  if (isReturnAvailable(vehicle)) labels.push("帰り");
  return labels.length > 0 ? labels.join(" / ") : "対象なし";
};

const formatTimelineRange = (item: Pick<EventTimelineItem, "startTime" | "endTime">): string =>
  item.endTime?.trim() ? `${item.startTime}-${item.endTime}` : item.startTime;

const compareTimelineItems = (left: EventTimelineItem, right: EventTimelineItem): number =>
  `${left.startTime}-${left.id}`.localeCompare(`${right.startTime}-${right.id}`, "ja");

const toLinkedSession = (date: string, session: SessionDoc): LinkedSession => ({
  id: session.id ?? `session:${date}:${session.order}`,
  date,
  startTime: session.startTime,
  endTime: session.endTime,
  type: session.type,
  eventName: session.eventName,
  location: session.location,
  dutyName: session.assigneeNameSnapshot || "-",
});

const compareLinkedSessions = (left: LinkedSession, right: LinkedSession): number =>
  `${left.date}-${left.startTime}-${left.id}`.localeCompare(`${right.date}-${right.startTime}-${right.id}`);

type EventsPageProps = {
  data: DemoData;
  currentUid: string;
  linkedMember: MemberRecord | null;
  authRole?: "parent" | "admin" | null;
  saveTodo: (todo: Todo) => Promise<void>;
  createEvent: (event: Omit<EventRecord, "id">) => Promise<void>;
  saveEvent: (event: EventRecord) => Promise<void>;
  deleteEvent: (eventId: string) => Promise<void>;
  menuRole: DemoMenuRole;
};

export function EventsPage({
  data,
  currentUid,
  linkedMember,
  authRole,
  saveTodo,
  createEvent,
  saveEvent,
  deleteEvent,
  menuRole,
}: EventsPageProps) {
  const [activeTab, setActiveTab] = useState<"active" | "done">("active");
  const [isSessionBindModalOpen, setIsSessionBindModalOpen] = useState(false);
  const [unlinkTargetSessionId, setUnlinkTargetSessionId] = useState<string | null>(null);
  const [editingEventId, setEditingEventId] = useState<string | "__new__" | null>(null);
  const [formDraft, setFormDraft] = useState<EventFormDraft>(createInitialDraft());
  const [formErrors, setFormErrors] = useState<EventFormErrors>({});
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [families, setFamilies] = useState<FamilyRecord[]>([]);
  const [members, setMembers] = useState<MemberRecord[]>([]);
  const [selectedVehicleKey, setSelectedVehicleKey] = useState("");
  const [isLinkedSessionsOpen, setIsLinkedSessionsOpen] = useState(false);
  const [isCarpoolOpen, setIsCarpoolOpen] = useState(false);
  const [personalCheckedItemIds, setPersonalCheckedItemIds] = useState<string[]>([]);
  const [detailTimetableItemId, setDetailTimetableItemId] = useState<string | null>(null);
  const [editingTimetableItemId, setEditingTimetableItemId] = useState<string | "__new__" | null>(null);
  const [timetableDraft, setTimetableDraft] = useState<TimetableDraft>(createInitialTimetableDraft());
  const [timetableErrors, setTimetableErrors] = useState<TimetableErrors>({});
  const [deleteTimetableItemId, setDeleteTimetableItemId] = useState<string | null>(null);
  const [editingChecklistScope, setEditingChecklistScope] = useState<ChecklistScope | null>(null);
  const [editingChecklistItemId, setEditingChecklistItemId] = useState<string | "__new__" | null>(null);
  const [checklistDraft, setChecklistDraft] = useState<ChecklistDraft>(createInitialChecklistDraft());
  const [checklistErrors, setChecklistErrors] = useState<ChecklistErrors>({});
  const [deleteChecklistScope, setDeleteChecklistScope] = useState<ChecklistScope | null>(null);
  const [deleteChecklistItemId, setDeleteChecklistItemId] = useState<string | null>(null);
  const [editingCarpoolVehicleKey, setEditingCarpoolVehicleKey] = useState<string | null>(null);
  const [carpoolAssignmentDraft, setCarpoolAssignmentDraft] = useState<{
    outboundMemberIds: string[];
    returnMemberIds: string[];
    isEquipmentVehicle: boolean;
  }>({
    outboundMemberIds: [],
    returnMemberIds: [],
    isEquipmentVehicle: false,
  });
  const [selectedOutboundMemberId, setSelectedOutboundMemberId] = useState("");
  const [selectedReturnMemberId, setSelectedReturnMemberId] = useState("");
  const { eventId } = useParams<{ eventId?: string }>();
  const navigate = useNavigate();
  const today = todayDateKey();
  const defaultClubYear = clubYearFromDateKey(today);
  const [selectedDoneYear, setSelectedDoneYear] = useState<number>(defaultClubYear);

  const isManager = canManageEvents(menuRole);
  useEffect(() => {
    const unsubscribe = subscribeFamilies(setFamilies);
    void listFamilies().then(setFamilies).catch(() => undefined);
    return unsubscribe;
  }, []);
  useEffect(() => {
    const unsubscribe = subscribeMembers(setMembers);
    void listMembers().then(setMembers).catch(() => undefined);
    return unsubscribe;
  }, []);
  const selectedEvent = eventId ? data.events.find((item) => item.id === eventId) ?? null : null;
  const editingEvent =
    editingEventId && editingEventId !== "__new__"
      ? data.events.find((item) => item.id === editingEventId) ?? null
      : null;
  const deleteTargetEvent = deleteTargetId ? data.events.find((item) => item.id === deleteTargetId) ?? null : null;
  const isCreateMode = editingEventId === "__new__";

  const allEventSessions = useMemo(() => {
    const rows: LinkedSession[] = [];
    Object.entries(data.scheduleDays).forEach(([date, day]) => {
      day.sessions
        .filter((session) => session.type === "event" || session.type === "other")
        .forEach((session) => {
          rows.push(toLinkedSession(date, session));
        });
    });
    return rows.sort(compareLinkedSessions);
  }, [data.scheduleDays]);

  const linkedSessions = useMemo(() => {
    if (!selectedEvent) return [] as LinkedSession[];

    const explicitIds = new Set((selectedEvent.sessionIds ?? []).filter((id) => id.trim().length > 0));
    const rows = allEventSessions.filter((session) => explicitIds.has(session.id));

    return rows.sort(compareLinkedSessions);
  }, [allEventSessions, selectedEvent]);

  const linkedSessionIds = useMemo(() => new Set(linkedSessions.map((session) => session.id)), [linkedSessions]);

  const otherEventLinkedSessionIds = useMemo(() => {
    if (!selectedEvent) return new Set<string>();
    return new Set(
      data.events
        .filter((item) => item.id !== selectedEvent.id)
        .flatMap((item) => (item.sessionIds ?? []).filter((sessionId) => sessionId.trim().length > 0)),
    );
  }, [data.events, selectedEvent]);

  const unlinkTargetSession =
    unlinkTargetSessionId ? linkedSessions.find((item) => item.id === unlinkTargetSessionId) ?? null : null;

  const bindableEventSessions = useMemo(
    () =>
      allEventSessions.filter(
        (session) => !linkedSessionIds.has(session.id) && !otherEventLinkedSessionIds.has(session.id),
      ),
    [allEventSessions, linkedSessionIds, otherEventLinkedSessionIds],
  );

  const carpoolOptions = useMemo<CarpoolVehicleOption[]>(
    () =>
      families.flatMap((family) =>
        family.vehicles.map((vehicle, vehicleIndex) => ({
          key: `${family.id}:${vehicleIndex}`,
          label: toVehicleLabel(family.name, vehicle.maker, vehicle.model),
          vehicle: {
            familyId: family.id,
            familyNameSnapshot: family.name,
            vehicleIndex,
            maker: vehicle.maker,
            model: vehicle.model,
            capacity: vehicle.capacity,
            canOutbound: true,
            canReturn: true,
          },
        })),
      ),
    [families],
  );
  const selectableCarpoolOptions = useMemo(() => carpoolOptions, [carpoolOptions]);
  const memberIndexes = useMemo(() => buildMemberIndexes(members), [members]);
  const familiesById = useMemo(() => buildFamilyMap(families), [families]);
  const membersById = useMemo(() => new Map(members.map((member) => [member.id, member])), [members]);
  const currentChecklistMemberId = linkedMember?.id || currentUid;
  const sortedAssignableMembers = useMemo(() => sortMembersForDisplay(members, "all"), [members]);
  const selectableOutboundMembers = useMemo(() => sortedAssignableMembers, [sortedAssignableMembers]);
  const selectableReturnMembers = useMemo(() => sortedAssignableMembers, [sortedAssignableMembers]);
  const addedCarpoolVehicleKeys = useMemo(
    () => new Set(formDraft.carpoolVehicles.map((vehicle) => `${vehicle.familyId}:${vehicle.vehicleIndex}`)),
    [formDraft.carpoolVehicles],
  );
  const outboundAssignedIds = useMemo(
    () => new Set(carpoolAssignmentDraft.outboundMemberIds),
    [carpoolAssignmentDraft.outboundMemberIds],
  );
  const returnAssignedIds = useMemo(
    () => new Set(carpoolAssignmentDraft.returnMemberIds),
    [carpoolAssignmentDraft.returnMemberIds],
  );

  const activeEvents = useMemo(
    () =>
      [...data.events]
        .filter((item) => item.state === "active")
        .sort((a, b) =>
          `${a.eventSortDate}-${a.title}`.localeCompare(`${b.eventSortDate}-${b.title}`, "ja"),
        ),
    [data.events],
  );

  const doneEvents = useMemo(
    () =>
      [...data.events]
        .filter((item) => item.state === "done")
        .sort((a, b) =>
          `${b.eventSortDate}-${b.title}`.localeCompare(`${a.eventSortDate}-${a.title}`, "ja"),
        ),
    [data.events],
  );

  const doneYears = useMemo(
    () =>
      Array.from(new Set(doneEvents.map((item) => clubYearFromDateKey(item.eventSortDate)))).sort((a, b) => b - a),
    [doneEvents],
  );

  useEffect(() => {
    if (doneYears.length === 0) {
      if (selectedDoneYear !== defaultClubYear) {
        setSelectedDoneYear(defaultClubYear);
      }
      return;
    }
    if (!doneYears.includes(selectedDoneYear)) {
      setSelectedDoneYear(doneYears[0]);
    }
  }, [defaultClubYear, doneYears, selectedDoneYear]);

  useEffect(() => {
    setIsLinkedSessionsOpen(false);
    setIsCarpoolOpen(false);
  }, [selectedEvent?.id]);

  useEffect(() => {
    if (!editingEventId) return;
    if (selectableCarpoolOptions.length === 0) {
      if (selectedVehicleKey) setSelectedVehicleKey("");
      return;
    }
    const selectedOptionExists = selectableCarpoolOptions.some((option) => option.key === selectedVehicleKey);
    const shouldResetSelection =
      !selectedVehicleKey || !selectedOptionExists || addedCarpoolVehicleKeys.has(selectedVehicleKey);
    if (shouldResetSelection) {
      const nextSelectedKey =
        selectableCarpoolOptions.find((option) => !addedCarpoolVehicleKeys.has(option.key))?.key ??
        selectableCarpoolOptions[0].key;
      if (nextSelectedKey === selectedVehicleKey) return;
      setSelectedVehicleKey(nextSelectedKey);
    }
  }, [addedCarpoolVehicleKeys, editingEventId, selectableCarpoolOptions, selectedVehicleKey]);

  useEffect(() => {
    if (!editingCarpoolVehicleKey) return;
    if (selectableOutboundMembers.length === 0) {
      if (selectedOutboundMemberId) setSelectedOutboundMemberId("");
      return;
    }
    const selectedMemberExists = selectableOutboundMembers.some((member) => member.id === selectedOutboundMemberId);
    const shouldResetSelection = Boolean(selectedOutboundMemberId) &&
      (!selectedMemberExists || outboundAssignedIds.has(selectedOutboundMemberId));
    if (shouldResetSelection) {
      setSelectedOutboundMemberId("");
    }
  }, [editingCarpoolVehicleKey, outboundAssignedIds, selectableOutboundMembers, selectedOutboundMemberId]);

  useEffect(() => {
    if (!editingCarpoolVehicleKey) return;
    if (selectableReturnMembers.length === 0) {
      if (selectedReturnMemberId) setSelectedReturnMemberId("");
      return;
    }
    const selectedMemberExists = selectableReturnMembers.some((member) => member.id === selectedReturnMemberId);
    const shouldResetSelection = Boolean(selectedReturnMemberId) &&
      (!selectedMemberExists || returnAssignedIds.has(selectedReturnMemberId));
    if (shouldResetSelection) {
      setSelectedReturnMemberId("");
    }
  }, [editingCarpoolVehicleKey, returnAssignedIds, selectableReturnMembers, selectedReturnMemberId]);

  useEffect(() => {
    if (!selectedEvent) {
      setPersonalCheckedItemIds([]);
      return;
    }
    return subscribeEventPersonalChecklistState(
      selectedEvent.id,
      currentChecklistMemberId,
      setPersonalCheckedItemIds,
      () => setPersonalCheckedItemIds([]),
    );
  }, [currentChecklistMemberId, selectedEvent?.id]);

  const filteredDoneEvents = useMemo(
    () => doneEvents.filter((item) => clubYearFromDateKey(item.eventSortDate) === selectedDoneYear),
    [doneEvents, selectedDoneYear],
  );

  const visibleEvents = activeTab === "active" ? activeEvents : filteredDoneEvents;

  const eventRelatedTodos = useMemo(() => {
    if (!selectedEvent) return [] as Todo[];
    return sortTodosOpenFirst(
      data.todos.filter(
        (todo) =>
          todo.related?.type === "event" &&
          todo.related.id === selectedEvent.id &&
          canViewTodoByScope(todo, linkedMember, currentUid, authRole),
      ),
    );
  }, [authRole, data.todos, linkedMember, selectedEvent]);

  const selectedEventTimetableItems = useMemo(
    () => [...(selectedEvent?.timetableItems ?? [])].sort(compareTimelineItems),
    [selectedEvent?.timetableItems],
  );
  const detailTimetableItem =
    detailTimetableItemId && selectedEvent
      ? selectedEventTimetableItems.find((item) => item.id === detailTimetableItemId) ?? null
      : null;
  const deleteTimetableItem =
    deleteTimetableItemId && selectedEvent
      ? (selectedEvent.timetableItems ?? []).find((item) => item.id === deleteTimetableItemId) ?? null
      : null;
  const selectedEventCommonChecklistItems = selectedEvent?.commonChecklistItems ?? [];
  const selectedEventPersonalChecklistItems = selectedEvent?.personalChecklistItems ?? [];
  const deleteChecklistItem =
    deleteChecklistItemId && deleteChecklistScope && selectedEvent
      ? (
          deleteChecklistScope === "common"
            ? selectedEvent.commonChecklistItems ?? []
            : selectedEvent.personalChecklistItems ?? []
        ).find((item) => item.id === deleteChecklistItemId) ?? null
      : null;
  const selectedEventCarpoolVehicles = selectedEvent?.carpoolVehicles ?? [];
  const selectedEventCarpoolCapacitySummary = summarizeCarpoolCapacities(selectedEventCarpoolVehicles);
  const formDraftCarpoolCapacitySummary = summarizeCarpoolCapacities(formDraft.carpoolVehicles);
  const editingCarpoolVehicle =
    editingCarpoolVehicleKey && selectedEvent
      ? selectedEventCarpoolVehicles.find(
          (vehicle) => `${vehicle.familyId}:${vehicle.vehicleIndex}` === editingCarpoolVehicleKey,
        ) ?? null
      : null;

  const showFeedback = (message: string) => {
    setFeedback(message);
    window.setTimeout(() => {
      setFeedback((current) => (current === message ? null : current));
    }, 1800);
  };

  const showFailure = (message: string) => {
    setFeedback(message);
  };

  const closeDetail = () => {
    setIsSessionBindModalOpen(false);
    navigate("/events");
  };

  const assigneeLabel = (uid: string | null): string => {
    if (!uid) return "未アサイン";
    return (
      resolveFamilyNameFromIdentifier({
        identifier: uid,
        memberIndexes,
        familiesById,
        fallback: uid,
      }) || uid
    );
  };

  const takeoverLabel = (todo: Todo): string | null => {
    return getTodoTakeoverLabel(todo, currentUid);
  };

  const memberDisplayName = (memberId: string): string => {
    const member = membersById.get(memberId) ?? null;
    return member?.displayName || member?.name || memberId;
  };

  const sortAssignedMemberIds = (memberIds: string[] | undefined): string[] => {
    const ids = memberIds ?? [];
    const knownMembers = ids
      .map((memberId) => membersById.get(memberId) ?? null)
      .filter((member): member is MemberRecord => member !== null);
    const knownIds = new Set(knownMembers.map((member) => member.id));
    const sortedKnownIds = sortMembersForDisplay(knownMembers, "all").map((member) => member.id);
    const unknownIds = ids.filter((memberId) => !knownIds.has(memberId));
    return [...sortedKnownIds, ...unknownIds];
  };

  const memberListLabel = (memberIds: string[] | undefined): string => {
    const ids = sortAssignedMemberIds(memberIds);
    if (ids.length === 0) return "未設定";
    return ids.map((memberId) => memberDisplayName(memberId)).join(" / ");
  };

  const validateTimetableDraft = (): TimetableErrors => {
    const errors: TimetableErrors = {};
    if (!timetableDraft.startTime.trim()) errors.startTime = "開始時刻を入力してください";
    if (!timetableDraft.title.trim()) errors.title = "タイトルを入力してください";
    return errors;
  };

  const validateChecklistDraft = (): ChecklistErrors => {
    const errors: ChecklistErrors = {};
    if (!checklistDraft.label.trim()) errors.label = "項目名を入力してください";
    return errors;
  };

  const closeTimetableEditor = () => {
    setEditingTimetableItemId(null);
    setTimetableDraft(createInitialTimetableDraft());
    setTimetableErrors({});
  };

  const openTimetableEditor = (item?: EventTimelineItem) => {
    if (!isManager) return;
    setEditingTimetableItemId(item?.id ?? "__new__");
    setTimetableDraft({
      startTime: item?.startTime ?? "",
      endTime: item?.endTime ?? "",
      title: item?.title ?? "",
      details: item?.details ?? "",
    });
    setTimetableErrors({});
  };

  const saveTimetableDraft = async () => {
    if (!isManager || !selectedEvent) return;
    const errors = validateTimetableDraft();
    setTimetableErrors(errors);
    if (errors.startTime || errors.title) return;

    const nextItem: EventTimelineItem = {
      id: editingTimetableItemId && editingTimetableItemId !== "__new__" ? editingTimetableItemId : createLocalItemId("timeline"),
      startTime: timetableDraft.startTime,
      endTime: timetableDraft.endTime.trim() || undefined,
      title: timetableDraft.title.trim(),
      details: timetableDraft.details.trim() || undefined,
    };

    const nextItems = [...(selectedEvent.timetableItems ?? [])];
    const currentIndex = nextItems.findIndex((item) => item.id === nextItem.id);
    if (currentIndex >= 0) {
      nextItems[currentIndex] = nextItem;
    } else {
      nextItems.push(nextItem);
    }

    try {
      await saveEvent({ ...selectedEvent, timetableItems: nextItems.sort(compareTimelineItems) });
      closeTimetableEditor();
      showFeedback("タイムテーブルを保存しました");
    } catch {
      showFailure("タイムテーブルの保存に失敗しました");
    }
  };

  const confirmDeleteTimetableItem = async () => {
    if (!isManager || !selectedEvent || !deleteTimetableItemId) return;
    try {
      await saveEvent({
        ...selectedEvent,
        timetableItems: (selectedEvent.timetableItems ?? []).filter((item) => item.id !== deleteTimetableItemId),
      });
      setDeleteTimetableItemId(null);
      showFeedback("タイムテーブルを削除しました");
    } catch {
      showFailure("タイムテーブルの削除に失敗しました");
    }
  };

  const closeChecklistEditor = () => {
    setEditingChecklistScope(null);
    setEditingChecklistItemId(null);
    setChecklistDraft(createInitialChecklistDraft());
    setChecklistErrors({});
  };

  const openChecklistEditor = (scope: ChecklistScope, item?: EventCommonChecklistItem | EventPersonalChecklistItem) => {
    if (!isManager) return;
    setEditingChecklistScope(scope);
    setEditingChecklistItemId(item?.id ?? "__new__");
    setChecklistDraft({
      label: item?.label ?? "",
      memo: item?.memo ?? "",
    });
    setChecklistErrors({});
  };

  const saveChecklistDraft = async () => {
    if (!isManager || !selectedEvent || !editingChecklistScope) return;
    const errors = validateChecklistDraft();
    setChecklistErrors(errors);
    if (errors.label) return;

    const itemId =
      editingChecklistItemId && editingChecklistItemId !== "__new__"
        ? editingChecklistItemId
        : createLocalItemId(editingChecklistScope === "common" ? "common" : "personal");

    try {
      if (editingChecklistScope === "common") {
        const nextItem: EventCommonChecklistItem = {
          id: itemId,
          label: checklistDraft.label.trim(),
          memo: checklistDraft.memo.trim() || undefined,
          checked:
            (selectedEvent.commonChecklistItems ?? []).find((item) => item.id === itemId)?.checked ?? false,
        };
        const nextItems = [...(selectedEvent.commonChecklistItems ?? [])];
        const currentIndex = nextItems.findIndex((item) => item.id === itemId);
        if (currentIndex >= 0) nextItems[currentIndex] = nextItem;
        else nextItems.push(nextItem);
        await saveEvent({ ...selectedEvent, commonChecklistItems: nextItems });
      } else {
        const nextItem: EventPersonalChecklistItem = {
          id: itemId,
          label: checklistDraft.label.trim(),
          memo: checklistDraft.memo.trim() || undefined,
        };
        const nextItems = [...(selectedEvent.personalChecklistItems ?? [])];
        const currentIndex = nextItems.findIndex((item) => item.id === itemId);
        if (currentIndex >= 0) nextItems[currentIndex] = nextItem;
        else nextItems.push(nextItem);
        await saveEvent({ ...selectedEvent, personalChecklistItems: nextItems });
      }
      closeChecklistEditor();
      showFeedback("持ち物項目を保存しました");
    } catch {
      showFailure("持ち物項目の保存に失敗しました");
    }
  };

  const confirmDeleteChecklistItem = async () => {
    if (!isManager || !selectedEvent || !deleteChecklistScope || !deleteChecklistItemId) return;
    try {
      if (deleteChecklistScope === "common") {
        await saveEvent({
          ...selectedEvent,
          commonChecklistItems: (selectedEvent.commonChecklistItems ?? []).filter(
            (item) => item.id !== deleteChecklistItemId,
          ),
        });
      } else {
        await saveEvent({
          ...selectedEvent,
          personalChecklistItems: (selectedEvent.personalChecklistItems ?? []).filter(
            (item) => item.id !== deleteChecklistItemId,
          ),
        });
        if (personalCheckedItemIds.includes(deleteChecklistItemId)) {
          const nextCheckedItemIds = personalCheckedItemIds.filter((itemId) => itemId !== deleteChecklistItemId);
          await saveEventPersonalChecklistState(selectedEvent.id, currentChecklistMemberId, nextCheckedItemIds);
        }
      }
      setDeleteChecklistScope(null);
      setDeleteChecklistItemId(null);
      showFeedback("持ち物項目を削除しました");
    } catch {
      showFailure("持ち物項目の削除に失敗しました");
    }
  };

  const toggleCommonChecklistItem = async (itemId: string) => {
    if (!selectedEvent) return;
    try {
      await saveEvent({
        ...selectedEvent,
        commonChecklistItems: (selectedEvent.commonChecklistItems ?? []).map((item) =>
          item.id === itemId ? { ...item, checked: !item.checked } : item,
        ),
      });
    } catch {
      showFailure("共通持ち物の更新に失敗しました");
    }
  };

  const togglePersonalChecklistItem = async (itemId: string) => {
    if (!selectedEvent) return;
    const previousCheckedItemIds = personalCheckedItemIds;
    const nextCheckedItemIds = previousCheckedItemIds.includes(itemId)
      ? previousCheckedItemIds.filter((currentItemId) => currentItemId !== itemId)
      : [...previousCheckedItemIds, itemId];
    setPersonalCheckedItemIds(nextCheckedItemIds);
    try {
      await saveEventPersonalChecklistState(selectedEvent.id, currentChecklistMemberId, nextCheckedItemIds);
    } catch {
      setPersonalCheckedItemIds(previousCheckedItemIds);
      showFailure("個人持ち物の更新に失敗しました");
    }
  };

  const openCarpoolAssignmentEditor = (vehicle: EventCarpoolVehicle) => {
    if (!isManager) return;
    setEditingCarpoolVehicleKey(`${vehicle.familyId}:${vehicle.vehicleIndex}`);
    setCarpoolAssignmentDraft({
      outboundMemberIds: vehicle.outboundMemberIds ?? [],
      returnMemberIds: vehicle.returnMemberIds ?? [],
      isEquipmentVehicle: vehicle.isEquipmentVehicle === true,
    });
    setSelectedOutboundMemberId("");
    setSelectedReturnMemberId("");
  };

  const closeCarpoolAssignmentEditor = () => {
    setEditingCarpoolVehicleKey(null);
    setCarpoolAssignmentDraft({
      outboundMemberIds: [],
      returnMemberIds: [],
      isEquipmentVehicle: false,
    });
    setSelectedOutboundMemberId("");
    setSelectedReturnMemberId("");
  };

  const addCarpoolAssignmentMember = (direction: "outboundMemberIds" | "returnMemberIds", memberId: string) => {
    if (!memberId) return;
    if (carpoolAssignmentDraft[direction].includes(memberId)) {
      showFeedback("同じ方向には二重追加できません");
      return;
    }
    setCarpoolAssignmentDraft((current) => ({
      ...current,
      [direction]: [...current[direction], memberId],
    }));
    if (direction === "outboundMemberIds") {
      setSelectedOutboundMemberId("");
      return;
    }
    setSelectedReturnMemberId("");
  };

  const removeCarpoolAssignmentMember = (
    direction: "outboundMemberIds" | "returnMemberIds",
    memberId: string,
  ) => {
    setCarpoolAssignmentDraft((current) => ({
      ...current,
      [direction]: current[direction].filter((currentMemberId) => currentMemberId !== memberId),
    }));
  };

  const saveCarpoolAssignments = async () => {
    if (!isManager || !selectedEvent || !editingCarpoolVehicle) return;
    const vehicleKey = `${editingCarpoolVehicle.familyId}:${editingCarpoolVehicle.vehicleIndex}`;
    try {
      await saveEvent({
        ...selectedEvent,
        carpoolVehicles: (selectedEvent.carpoolVehicles ?? []).map((vehicle) =>
          `${vehicle.familyId}:${vehicle.vehicleIndex}` === vehicleKey
            ? {
                ...vehicle,
                outboundMemberIds: carpoolAssignmentDraft.outboundMemberIds,
                returnMemberIds: carpoolAssignmentDraft.returnMemberIds,
                isEquipmentVehicle: carpoolAssignmentDraft.isEquipmentVehicle,
              }
            : vehicle,
        ),
      });
      closeCarpoolAssignmentEditor();
      showFeedback("配車割り振りを保存しました");
    } catch {
      showFailure("配車割り振りの保存に失敗しました");
    }
  };

  const openCreateModal = () => {
    if (!isManager) return;
    setEditingEventId("__new__");
    setFormDraft(createInitialDraft());
    setFormErrors({});
    setSelectedVehicleKey("");
  };

  const openEditModal = (event: EventRecord) => {
    if (!isManager) return;
    setEditingEventId(event.id);
    setFormDraft({
      title: event.title,
      kind: event.kind,
      eventSortDate: event.eventSortDate,
      memo: event.memo ?? "",
      state: event.state,
      carpoolVehicles: (event.carpoolVehicles ?? []).map((vehicle) => ({
        ...vehicle,
        canOutbound: isOutboundAvailable(vehicle),
        canReturn: isReturnAvailable(vehicle),
      })),
    });
    setFormErrors({});
    setSelectedVehicleKey("");
  };

  const closeEditModal = () => {
    setEditingEventId(null);
    setFormErrors({});
    setSelectedVehicleKey("");
  };

  const validateForm = (): EventFormErrors => {
    const errors: EventFormErrors = {};
    if (!formDraft.title.trim()) errors.title = "タイトルは必須です";
    if (!formDraft.eventSortDate.trim()) errors.eventSortDate = "代表日は必須です";
    return errors;
  };

  const addCarpoolVehicle = () => {
    if (!selectedVehicleKey) return;
    const option = selectableCarpoolOptions.find((item) => item.key === selectedVehicleKey);
    if (!option) return;

    setFormDraft((current) => {
      const alreadyAdded = current.carpoolVehicles.some(
        (vehicle) =>
          vehicle.familyId === option.vehicle.familyId && vehicle.vehicleIndex === option.vehicle.vehicleIndex,
      );
      if (alreadyAdded) {
        showFeedback("その車両はすでに追加されています");
        return current;
      }
      return {
        ...current,
        carpoolVehicles: [...current.carpoolVehicles, option.vehicle],
        };
      });
    setSelectedVehicleKey("");
  };

  const removeCarpoolVehicle = (vehicleKey: string) => {
    setFormDraft((current) => ({
      ...current,
      carpoolVehicles: current.carpoolVehicles.filter(
        (vehicle) => `${vehicle.familyId}:${vehicle.vehicleIndex}` !== vehicleKey,
      ),
    }));
  };

  const updateCarpoolVehicleDirection = (
    vehicleKey: string,
    key: "canOutbound" | "canReturn",
    value: boolean,
  ) => {
    setFormDraft((current) => ({
      ...current,
      carpoolVehicles: current.carpoolVehicles.map((vehicle) =>
        `${vehicle.familyId}:${vehicle.vehicleIndex}` === vehicleKey ? { ...vehicle, [key]: value } : vehicle,
      ),
    }));
  };

  const saveEventDraft = async () => {
    if (!isManager) return;
    const errors = validateForm();
    setFormErrors(errors);
    if (errors.title || errors.eventSortDate) return;

    try {
      if (isCreateMode) {
        await createEvent({
          title: formDraft.title.trim(),
          kind: formDraft.kind,
          state: formDraft.state,
          eventSortDate: formDraft.eventSortDate,
          memo: formDraft.memo.trim() || undefined,
          sessionIds: [],
          carpoolVehicles: formDraft.carpoolVehicles,
        });
      } else if (editingEvent) {
        await saveEvent({
          ...editingEvent,
          title: formDraft.title.trim(),
          kind: formDraft.kind,
          state: formDraft.state,
          eventSortDate: formDraft.eventSortDate,
          memo: formDraft.memo.trim() || undefined,
          carpoolVehicles: formDraft.carpoolVehicles,
        });
      }

      closeEditModal();
      showFeedback("保存しました");
    } catch {
      showFailure("保存に失敗しました");
    }
  };

  const confirmDelete = async () => {
    if (!isManager || !deleteTargetEvent) return;
    try {
      await deleteEvent(deleteTargetEvent.id);
      if (selectedEvent?.id === deleteTargetEvent.id) {
        closeDetail();
      }
      setDeleteTargetId(null);
      showFeedback("削除しました");
    } catch {
      showFailure("削除に失敗しました");
    }
  };

  const bindSessionToEvent = async (sessionId: string) => {
    if (!isManager || !selectedEvent) return;
    const mergedSessionIds = Array.from(new Set([...linkedSessions.map((session) => session.id), sessionId]));
    try {
      await saveEvent({
        ...selectedEvent,
        sessionIds: mergedSessionIds,
      });
        showFeedback("紐付けました");
        setIsSessionBindModalOpen(false);
      } catch {
        showFailure("紐付けに失敗しました");
      }
    };

  const confirmUnlinkSession = async () => {
    if (!isManager || !selectedEvent || !unlinkTargetSession) return;
    const nextSessionIds = linkedSessions
      .filter((session) => session.id !== unlinkTargetSession.id)
      .map((session) => session.id);
    try {
      await saveEvent({
        ...selectedEvent,
        sessionIds: nextSessionIds,
      });
      setUnlinkTargetSessionId(null);
      showFeedback("解除しました");
    } catch {
      showFailure("解除に失敗しました");
    }
  };

  return (
    <section className="card events-page">
      <header className="events-header">
        <h1>イベント</h1>
        {isManager && (
          <button type="button" className="button button-small" aria-label="追加" title="追加" onClick={openCreateModal}>
            ＋ 追加
          </button>
        )}
      </header>

      {feedback && <p className="links-feedback">{feedback}</p>}

      {!selectedEvent && (
        <>
          <div className="events-tabs" role="tablist" aria-label="イベント種別">
            <button type="button" className={`members-tab ${activeTab === "active" ? "active" : ""}`} onClick={() => setActiveTab("active")}>
              進行中
            </button>
            <button type="button" className={`members-tab ${activeTab === "done" ? "active" : ""}`} onClick={() => setActiveTab("done")}>
              完了
            </button>
          </div>

          {activeTab === "done" && (
            <label className="events-year-filter">
              <span>年度</span>
              <select value={selectedDoneYear} onChange={(event) => setSelectedDoneYear(Number(event.target.value))}>
                {(doneYears.length > 0 ? doneYears : [defaultClubYear]).map((year) => (
                  <option key={year} value={year}>
                    {clubYearLabel(year)}
                  </option>
                ))}
              </select>
            </label>
          )}

          <div className="events-list">
            {visibleEvents.map((item) => (
              <article
                key={item.id}
                className="event-card"
                role="button"
                tabIndex={0}
                onClick={() => navigate(`/events/${item.id}`)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    navigate(`/events/${item.id}`);
                  }
                }}
              >
                <div className="event-card-main">
                  <div className="event-card-top">
                    <span className="event-date">{toDateLabel(item.eventSortDate)}</span>
                    <span className="event-card-badges">
                      <span className={`event-status ${item.state}`}>{item.state === "done" ? "完了" : "進行中"}</span>
                      <span className="event-kind">{item.kind}</span>
                    </span>
                  </div>
                  <strong>{item.title}</strong>
                </div>
                {isManager && (
                  <div className="event-card-actions">
                    <button
                      type="button"
                      className="link-icon-button"
                      aria-label="編集"
                      onClick={(event) => {
                        event.stopPropagation();
                        openEditModal(item);
                      }}
                      onKeyDown={(event) => event.stopPropagation()}
                    >
                      ✏️
                    </button>
                    <button
                      type="button"
                      className="link-icon-button"
                      aria-label="削除"
                      onClick={(event) => {
                        event.stopPropagation();
                        setDeleteTargetId(item.id);
                      }}
                      onKeyDown={(event) => event.stopPropagation()}
                    >
                      🗑️
                    </button>
                  </div>
                )}
              </article>
            ))}
            {visibleEvents.length === 0 && <p className="muted">該当するイベントはありません。</p>}
          </div>
        </>
      )}

      {selectedEvent && (
        <div className="events-detail-standalone">
          <article className="events-detail-page" aria-label="イベント詳細">
            <div className="events-detail-page-header">
              <div className="events-detail-page-heading">
                <button type="button" className="button button-small button-secondary" onClick={closeDetail}>
                  一覧へ戻る
                </button>
                <p className="modal-context">{toDateLabel(selectedEvent.eventSortDate)}</p>
                <h2>{selectedEvent.title}</h2>
                <p className="modal-summary">
                  種別: {selectedEvent.kind}
                  <span className={`event-status ${selectedEvent.state}`}>{selectedEvent.state === "done" ? "完了" : "進行中"}</span>
                </p>
              </div>
              {isManager && (
                <div className="events-detail-page-actions">
                  <button type="button" className="button button-small button-secondary" onClick={() => openEditModal(selectedEvent)}>
                    編集
                  </button>
                  <button
                    type="button"
                    className="button button-small events-danger-button"
                    onClick={() => setDeleteTargetId(selectedEvent.id)}
                  >
                    削除
                  </button>
                </div>
              )}
            </div>

            <section className="events-detail-section">
              <h3>メモ / 説明</h3>
              {selectedEvent.memo?.trim() ? (
                <p className="todo-memo-full">
                  <LinkifiedText text={selectedEvent.memo} className="todo-linkified-text" />
                </p>
              ) : (
                <p className="muted">メモはありません。</p>
              )}
            </section>

            <section className="events-detail-section">
              <div className="events-section-header">
                <h3>タイムテーブル</h3>
                {isManager && (
                  <button type="button" className="button button-small button-secondary" onClick={() => openTimetableEditor()}>
                    ＋ 追加
                  </button>
                )}
              </div>
              <div className="events-simple-list">
                {selectedEventTimetableItems.map((item) => (
                  <article key={item.id} className="events-simple-list-row events-timetable-row">
                    <div className="events-simple-list-main">
                      <div className="events-timetable-line">
                        <span className="events-timetable-start">{item.startTime}</span>
                        <span className="events-timetable-separator">{item.endTime?.trim() ? "-" : ""}</span>
                        <span className="events-timetable-end">{item.endTime?.trim() ?? ""}</span>
                        <span className="events-timetable-title">{item.title}</span>
                        {item.details?.trim() ? (
                          <button
                            type="button"
                            className="events-inline-link events-timetable-detail-trigger"
                            onClick={() => setDetailTimetableItemId(item.id)}
                            aria-label={`${item.title} の詳細を表示`}
                            title="詳細を表示"
                          >
                            📝
                          </button>
                        ) : null}
                      </div>
                    </div>
                    {isManager && (
                      <div className="events-inline-actions">
                        <button type="button" className="button button-small button-secondary" onClick={() => openTimetableEditor(item)}>
                          編集
                        </button>
                        <button
                          type="button"
                          className="button button-small events-danger-button"
                          onClick={() => setDeleteTimetableItemId(item.id)}
                        >
                          削除
                        </button>
                      </div>
                    )}
                  </article>
                ))}
                {selectedEventTimetableItems.length === 0 && <p className="muted">タイムテーブルはありません。</p>}
              </div>
            </section>

            <section className="events-detail-section">
              <h3>持ち物</h3>

              <div className="events-checklist-block">
                <div className="events-section-header">
                  <h4>共通チェックリスト</h4>
                  {isManager && (
                    <button
                      type="button"
                      className="button button-small button-secondary"
                      onClick={() => openChecklistEditor("common")}
                    >
                      ＋ 追加
                    </button>
                  )}
                </div>
                <div className="events-checklist-list">
                  {selectedEventCommonChecklistItems.map((item) => (
                    <article key={item.id} className="events-checklist-row">
                      <label className="events-checklist-toggle">
                        <input type="checkbox" checked={item.checked} onChange={() => void toggleCommonChecklistItem(item.id)} />
                        <span>
                          <strong>{item.label}</strong>
                          {item.memo?.trim() && <span className="events-checklist-memo">{item.memo}</span>}
                        </span>
                      </label>
                      {isManager && (
                        <div className="events-inline-actions">
                          <button
                            type="button"
                            className="button button-small button-secondary"
                            onClick={() => openChecklistEditor("common", item)}
                          >
                            編集
                          </button>
                          <button
                            type="button"
                            className="button button-small events-danger-button"
                            onClick={() => {
                              setDeleteChecklistScope("common");
                              setDeleteChecklistItemId(item.id);
                            }}
                          >
                            削除
                          </button>
                        </div>
                      )}
                    </article>
                  ))}
                  {selectedEventCommonChecklistItems.length === 0 && <p className="muted">共通持ち物はありません。</p>}
                </div>
              </div>

              <div className="events-checklist-block">
                <div className="events-section-header">
                  <h4>個人チェックリスト</h4>
                  {isManager && (
                    <button
                      type="button"
                      className="button button-small button-secondary"
                      onClick={() => openChecklistEditor("personal")}
                    >
                      ＋ 追加
                    </button>
                  )}
                </div>
                <p className="muted">自分の持ち物確認だけを切り替えます。</p>
                <div className="events-checklist-list">
                  {selectedEventPersonalChecklistItems.map((item) => (
                    <article key={item.id} className="events-checklist-row">
                      <label className="events-checklist-toggle">
                        <input
                          type="checkbox"
                          checked={personalCheckedItemIds.includes(item.id)}
                          onChange={() => void togglePersonalChecklistItem(item.id)}
                        />
                        <span>
                          <strong>{item.label}</strong>
                          {item.memo?.trim() && <span className="events-checklist-memo">{item.memo}</span>}
                        </span>
                      </label>
                      {isManager && (
                        <div className="events-inline-actions">
                          <button
                            type="button"
                            className="button button-small button-secondary"
                            onClick={() => openChecklistEditor("personal", item)}
                          >
                            編集
                          </button>
                          <button
                            type="button"
                            className="button button-small events-danger-button"
                            onClick={() => {
                              setDeleteChecklistScope("personal");
                              setDeleteChecklistItemId(item.id);
                            }}
                          >
                            削除
                          </button>
                        </div>
                      )}
                    </article>
                  ))}
                  {selectedEventPersonalChecklistItems.length === 0 && <p className="muted">個人持ち物はありません。</p>}
                </div>
              </div>
            </section>

            <section className="related-todos-block events-detail-section">
              <div className="events-section-header">
                <h3>関連TODO</h3>
                <div className="related-todos-footer">
                  <button type="button" className="button button-small button-secondary" onClick={() => navigate("/todos")}>
                    TODOページへ
                  </button>
                </div>
              </div>
              <div className="related-todos-list">
                {eventRelatedTodos.map((todo) => {
                  const takeover = takeoverLabel(todo);
                  return (
                    <article key={todo.id} className={`todo-row compact ${todo.completed ? "completed" : ""}`}>
                      <label className="todo-check">
                        <input
                          type="checkbox"
                          checked={todo.completed}
                          onChange={() => void saveTodo({ ...todo, completed: !todo.completed })}
                        />
                      </label>
                      <div className="todo-main">
                        <p className="todo-title">{todo.title}</p>
                        {todo.memo?.trim() && (
                          <p className="todo-memo-preview compact">
                            <LinkifiedText text={todo.memo} className="todo-linkified-text" />
                          </p>
                        )}
                        <p className="todo-meta">
                          <span>{todo.kind === "shared" ? `担当: ${assigneeLabel(todo.assigneeUid)}` : "種別: 個人TODO"}</span>
                          <span>期限: {todo.dueDate ?? "—"}</span>
                        </p>
                      </div>
                      <div className="todo-actions">
                        {takeover && (
                          <button
                            type="button"
                            className="button button-small"
                            onClick={() => void saveTodo({ ...todo, assigneeUid: currentUid })}
                          >
                            {takeover}
                          </button>
                        )}
                      </div>
                    </article>
                  );
                })}
                {eventRelatedTodos.length === 0 && <p className="muted">関連TODOはありません。</p>}
              </div>
            </section>

            {false && (
            <section className="events-detail-section">
              <button
                type="button"
                className="events-collapsible-toggle"
                aria-expanded={isLinkedSessionsOpen}
                onClick={() => setIsLinkedSessionsOpen((current) => !current)}
              >
                <span className="events-collapsible-heading">紐付け予定</span>
                <span className="events-collapsible-meta">{linkedSessions.length}件</span>
                <span className={`events-collapsible-icon ${isLinkedSessionsOpen ? "open" : ""}`} aria-hidden="true">
                  ▾
                </span>
              </button>
              {isLinkedSessionsOpen && (
                <>
                  {isManager && (
                    <div className="events-section-header">
                      <span className="muted">紐付け予定を追加・解除できます。</span>
                      <button
                        type="button"
                        className="button button-small"
                        aria-label="追加"
                        title="追加"
                        onClick={() => setIsSessionBindModalOpen(true)}
                      >
                        ＋ 追加
                      </button>
                    </div>
                  )}
                  <div className="calendar-day-sheet-list">
                    {linkedSessions.map((session) => (
                      <article key={session.id} className={`session-card ${session.type}`}>
                        <span className={`session-type-badge ${session.type}`}>{sessionTypeLabel[session.type]}</span>
                        <div className="calendar-day-sheet-main session-card-body">
                          <p className="calendar-day-sheet-time session-time">
                            {toDateLabel(session.date)} {session.startTime}-{session.endTime}
                          </p>
                          {(session.type === "event" || session.type === "other") && session.eventName && (
                            <p className="calendar-day-sheet-meta">{session.eventName}</p>
                          )}
                          {getSessionAssigneeRoleLabel(session) && (
                            <p className="calendar-day-sheet-label kv-row">
                              <span className="kv-key">{getSessionAssigneeRoleLabel(session)}：</span>
                              <span className="kv-val shift-role">{session.dutyName ?? "-"}</span>
                            </p>
                          )}
                          {session.location && (
                            <p className="calendar-day-sheet-meta kv-row">
                              <span className="kv-key">場所：</span>
                              <span className="kv-val">{session.location}</span>
                            </p>
                          )}
                          {isManager && (
                            <div className="events-linked-session-actions">
                              <button
                                type="button"
                                className="events-unlink-button"
                                onClick={() => setUnlinkTargetSessionId(session.id)}
                              >
                                解除
                              </button>
                            </div>
                          )}
                        </div>
                      </article>
                    ))}
                    {linkedSessions.length === 0 && <p className="muted">紐付け予定はありません。</p>}
                  </div>
                </>
              )}
            </section>
            )}

            <section className="events-detail-section">
              <button
                type="button"
                className="events-collapsible-toggle"
                aria-expanded={isCarpoolOpen}
                onClick={() => setIsCarpoolOpen((current) => !current)}
              >
                <span className="events-collapsible-heading">配車</span>
                <span className="events-collapsible-meta">{selectedEventCarpoolVehicles.length}台</span>
                <span className={`events-collapsible-icon ${isCarpoolOpen ? "open" : ""}`} aria-hidden="true">
                  ▾
                </span>
              </button>
              {isCarpoolOpen &&
                (selectedEventCarpoolVehicles.length > 0 ? (
                  <>
                    <div className="events-carpool-list">
                      {selectedEventCarpoolVehicles.map((vehicle) => (
                        <article key={`${vehicle.familyId}:${vehicle.vehicleIndex}`} className="events-carpool-row">
                          <div>
                            <p className="events-carpool-name">
                              {toVehicleLabel(
                                resolveFamilyNameFromIdentifier({
                                  identifier: vehicle.familyId,
                                  memberIndexes,
                                  familiesById,
                                  fallback: vehicle.familyNameSnapshot || "名称未設定",
                                }) || vehicle.familyNameSnapshot || "名称未設定",
                                vehicle.maker,
                                vehicle.model,
                              )}
                            </p>
                            <p className="events-carpool-capacity">
                              乗車定員（運転手除く）: {toPassengerCapacity(vehicle.capacity)}人
                            </p>
                            <p className="events-carpool-direction">対応: {toCarpoolDirectionLabel(vehicle)}</p>
                            {vehicle.isEquipmentVehicle === true && <p className="events-carpool-flag">機材車</p>}
                            <p className="events-carpool-passengers">行き: {memberListLabel(vehicle.outboundMemberIds)}</p>
                            <p className="events-carpool-passengers">帰り: {memberListLabel(vehicle.returnMemberIds)}</p>
                          </div>
                          {isManager && (
                            <div className="events-inline-actions">
                              <button
                                type="button"
                                className="button button-small button-secondary"
                                onClick={() => openCarpoolAssignmentEditor(vehicle)}
                              >
                                割り振り
                              </button>
                            </div>
                          )}
                        </article>
                      ))}
                    </div>
                    <div className="events-carpool-summary">
                      <p className="events-carpool-total">行き合計人数: {selectedEventCarpoolCapacitySummary.outbound}人</p>
                      <p className="events-carpool-total">帰り合計人数: {selectedEventCarpoolCapacitySummary.return}人</p>
                    </div>
                  </>
                ) : (
                  <p className="muted">配車はありません。</p>
                ))}
            </section>

            <section className="events-detail-section">
              <button
                type="button"
                className="events-collapsible-toggle"
                aria-expanded={isLinkedSessionsOpen}
                onClick={() => setIsLinkedSessionsOpen((current) => !current)}
              >
                <span className="events-collapsible-heading">紐付け予定</span>
                <span className="events-collapsible-meta">{linkedSessions.length}件</span>
                <span className={`events-collapsible-icon ${isLinkedSessionsOpen ? "open" : ""}`} aria-hidden="true">
                  ▾
                </span>
              </button>
              {isLinkedSessionsOpen && (
                <>
                  {isManager && (
                    <div className="events-section-header">
                      <span className="muted">紐付け予定を追加・解除できます。</span>
                      <button
                        type="button"
                        className="button button-small"
                        aria-label="追加"
                        title="追加"
                        onClick={() => setIsSessionBindModalOpen(true)}
                      >
                        ＋追加
                      </button>
                    </div>
                  )}
                  <div className="calendar-day-sheet-list">
                    {linkedSessions.map((session) => (
                      <article key={session.id} className={`session-card ${session.type}`}>
                        <span className={`session-type-badge ${session.type}`}>{sessionTypeLabel[session.type]}</span>
                        <div className="calendar-day-sheet-main session-card-body">
                          <p className="calendar-day-sheet-time session-time">
                            {toDateLabel(session.date)} {session.startTime}-{session.endTime}
                          </p>
                          {(session.type === "event" || session.type === "other") && session.eventName && (
                            <p className="calendar-day-sheet-meta">{session.eventName}</p>
                          )}
                          {getSessionAssigneeRoleLabel(session) && (
                            <p className="calendar-day-sheet-label kv-row">
                              <span className="kv-key">{getSessionAssigneeRoleLabel(session)}：</span>
                              <span className="kv-val shift-role">{session.dutyName ?? "-"}</span>
                            </p>
                          )}
                          {session.location && (
                            <p className="calendar-day-sheet-meta kv-row">
                              <span className="kv-key">場所：</span>
                              <span className="kv-val">{session.location}</span>
                            </p>
                          )}
                          {isManager && (
                            <div className="events-linked-session-actions">
                              <button
                                type="button"
                                className="events-unlink-button"
                                onClick={() => setUnlinkTargetSessionId(session.id)}
                              >
                                解除
                              </button>
                            </div>
                          )}
                        </div>
                      </article>
                    ))}
                    {linkedSessions.length === 0 && <p className="muted">紐付け予定はありません。</p>}
                  </div>
                </>
              )}
            </section>
          </article>
        </div>
      )}

      {detailTimetableItem && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <section className="modal-panel events-delete-modal" onClick={(event) => event.stopPropagation()}>
            <button
              type="button"
              className="modal-close"
              aria-label="閉じる"
              title="閉じる"
              onClick={() => setDetailTimetableItemId(null)}
            >
              ×
            </button>
            <h3>{detailTimetableItem.title}</h3>
            <p className="modal-summary">{formatTimelineRange(detailTimetableItem)}</p>
            <p className="todo-memo-full">
              <LinkifiedText text={detailTimetableItem.details ?? ""} className="todo-linkified-text" />
            </p>
            <div className="modal-actions">
              <button type="button" className="button button-secondary" onClick={() => setDetailTimetableItemId(null)}>
                閉じる
              </button>
            </div>
          </section>
        </div>
      )}

      {selectedEvent && editingTimetableItemId && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <section className="modal-panel events-editor-modal" onClick={(event) => event.stopPropagation()}>
            <button type="button" className="modal-close" aria-label="閉じる" title="閉じる" onClick={closeTimetableEditor}>
              ×
            </button>
            <div className="events-editor-modal-body">
              <h3>{editingTimetableItemId === "__new__" ? "タイムテーブル追加" : "タイムテーブル編集"}</h3>
              <label>
                開始時刻
                <input
                  type="time"
                  value={timetableDraft.startTime}
                  onChange={(event) =>
                    setTimetableDraft((current) => ({ ...current, startTime: event.target.value }))
                  }
                />
                {timetableErrors.startTime && <span className="field-error">{timetableErrors.startTime}</span>}
              </label>
              <label>
                終了時刻
                <input
                  type="time"
                  value={timetableDraft.endTime}
                  onChange={(event) =>
                    setTimetableDraft((current) => ({ ...current, endTime: event.target.value }))
                  }
                />
              </label>
              <label>
                タイトル
                <input
                  value={timetableDraft.title}
                  onChange={(event) =>
                    setTimetableDraft((current) => ({ ...current, title: event.target.value }))
                  }
                />
                {timetableErrors.title && <span className="field-error">{timetableErrors.title}</span>}
              </label>
              <label>
                詳細
                <textarea
                  value={timetableDraft.details}
                  onChange={(event) =>
                    setTimetableDraft((current) => ({ ...current, details: event.target.value }))
                  }
                />
              </label>
            </div>
            <div className="modal-actions">
              <button type="button" className="button button-secondary" onClick={closeTimetableEditor}>
                キャンセル
              </button>
              <button type="button" className="button" onClick={() => void saveTimetableDraft()}>
                保存
              </button>
            </div>
          </section>
        </div>
      )}

      {deleteTimetableItem && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <section className="modal-panel events-delete-modal" onClick={(event) => event.stopPropagation()}>
            <button
              type="button"
              className="modal-close"
              aria-label="閉じる"
              title="閉じる"
              onClick={() => setDeleteTimetableItemId(null)}
            >
              ×
            </button>
            <h3>タイムテーブルを削除しますか？</h3>
            <p className="modal-summary">
              {formatTimelineRange(deleteTimetableItem)} {deleteTimetableItem.title}
            </p>
            <div className="modal-actions">
              <button type="button" className="button button-secondary" onClick={() => setDeleteTimetableItemId(null)}>
                キャンセル
              </button>
              <button type="button" className="button events-danger-button" onClick={() => void confirmDeleteTimetableItem()}>
                削除
              </button>
            </div>
          </section>
        </div>
      )}

      {selectedEvent && editingChecklistScope && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <section className="modal-panel events-editor-modal" onClick={(event) => event.stopPropagation()}>
            <button type="button" className="modal-close" aria-label="閉じる" title="閉じる" onClick={closeChecklistEditor}>
              ×
            </button>
            <div className="events-editor-modal-body">
              <h3>
                {editingChecklistScope === "common" ? "共通持ち物" : "個人持ち物"}
                {editingChecklistItemId === "__new__" ? "追加" : "編集"}
              </h3>
              <label>
                項目名
                <input
                  value={checklistDraft.label}
                  onChange={(event) =>
                    setChecklistDraft((current) => ({ ...current, label: event.target.value }))
                  }
                />
                {checklistErrors.label && <span className="field-error">{checklistErrors.label}</span>}
              </label>
              <label>
                メモ
                <textarea
                  value={checklistDraft.memo}
                  onChange={(event) =>
                    setChecklistDraft((current) => ({ ...current, memo: event.target.value }))
                  }
                />
              </label>
            </div>
            <div className="modal-actions">
              <button type="button" className="button button-secondary" onClick={closeChecklistEditor}>
                キャンセル
              </button>
              <button type="button" className="button" onClick={() => void saveChecklistDraft()}>
                保存
              </button>
            </div>
          </section>
        </div>
      )}

      {deleteChecklistItem && deleteChecklistScope && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <section className="modal-panel events-delete-modal" onClick={(event) => event.stopPropagation()}>
            <button
              type="button"
              className="modal-close"
              aria-label="閉じる"
              title="閉じる"
              onClick={() => {
                setDeleteChecklistScope(null);
                setDeleteChecklistItemId(null);
              }}
            >
              ×
            </button>
            <h3>持ち物項目を削除しますか？</h3>
            <p className="modal-summary">{deleteChecklistItem.label}</p>
            <p className="muted">{deleteChecklistScope === "common" ? "共通チェックリスト" : "個人チェックリスト"} から削除します。</p>
            <div className="modal-actions">
              <button
                type="button"
                className="button button-secondary"
                onClick={() => {
                  setDeleteChecklistScope(null);
                  setDeleteChecklistItemId(null);
                }}
              >
                キャンセル
              </button>
              <button type="button" className="button events-danger-button" onClick={() => void confirmDeleteChecklistItem()}>
                削除
              </button>
            </div>
          </section>
        </div>
      )}

      {editingCarpoolVehicle && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <section className="modal-panel events-editor-modal" onClick={(event) => event.stopPropagation()}>
            <button
              type="button"
              className="modal-close"
              aria-label="閉じる"
              title="閉じる"
              onClick={closeCarpoolAssignmentEditor}
            >
              ×
            </button>
            <div className="events-editor-modal-body">
              <h3>配車割り振り</h3>
              <p className="modal-context">
                {toVehicleLabel(
                  resolveFamilyNameFromIdentifier({
                    identifier: editingCarpoolVehicle.familyId,
                    memberIndexes,
                    familiesById,
                    fallback: editingCarpoolVehicle.familyNameSnapshot || "車両",
                  }) || editingCarpoolVehicle.familyNameSnapshot || "車両",
                  editingCarpoolVehicle.maker,
                  editingCarpoolVehicle.model,
                )}
              </p>
              <label className="events-carpool-toggle">
                <input
                  type="checkbox"
                  checked={carpoolAssignmentDraft.isEquipmentVehicle}
                  onChange={(event) =>
                    setCarpoolAssignmentDraft((current) => ({
                      ...current,
                      isEquipmentVehicle: event.target.checked,
                    }))
                  }
                />
                <span>機材車として表示する</span>
              </label>
              <section className="events-checklist-block">
                <div className="events-section-header">
                  <h4>行き</h4>
                </div>
                <div className="events-carpool-assignment-picker">
                  <select
                    value={selectedOutboundMemberId}
                    onChange={(event) => setSelectedOutboundMemberId(event.target.value)}
                  >
                    <option value="">選択してください</option>
                    {selectableOutboundMembers.length === 0 ? (
                      <option value="" disabled>
                        候補メンバーがありません
                      </option>
                    ) : (
                      selectableOutboundMembers.map((member) => (
                        <option
                          key={`outbound-option-${member.id}`}
                          value={member.id}
                          disabled={outboundAssignedIds.has(member.id)}
                        >
                          {memberDisplayName(member.id)}
                          {outboundAssignedIds.has(member.id) ? "（追加済み）" : ""}
                        </option>
                      ))
                    )}
                  </select>
                  <button
                    type="button"
                    className="button button-small button-secondary"
                    onClick={() => addCarpoolAssignmentMember("outboundMemberIds", selectedOutboundMemberId)}
                    disabled={!selectedOutboundMemberId || outboundAssignedIds.has(selectedOutboundMemberId)}
                  >
                    追加
                  </button>
                </div>
                <div className="events-checklist-list">
                  {sortAssignedMemberIds(carpoolAssignmentDraft.outboundMemberIds).map((memberId) => (
                    <div key={`outbound-${memberId}`} className="events-checklist-row">
                      <div className="events-simple-list-main">
                        <p className="events-simple-list-title">{memberDisplayName(memberId)}</p>
                      </div>
                      <div className="events-inline-actions">
                        <button
                          type="button"
                          className="button button-small button-secondary"
                          onClick={() => removeCarpoolAssignmentMember("outboundMemberIds", memberId)}
                        >
                          削除
                        </button>
                      </div>
                    </div>
                  ))}
                  {carpoolAssignmentDraft.outboundMemberIds.length === 0 && (
                    <p className="muted">行きの乗車メンバーは未設定です。</p>
                  )}
                </div>
              </section>
              <section className="events-checklist-block">
                <div className="events-section-header">
                  <h4>帰り</h4>
                  <button
                    type="button"
                    className="button button-small button-secondary"
                    onClick={() =>
                      setCarpoolAssignmentDraft((current) => ({
                        ...current,
                        returnMemberIds: [...current.outboundMemberIds],
                      }))
                    }
                  >
                    行きの割り振りをコピー
                  </button>
                </div>
                <div className="events-carpool-assignment-picker">
                  <select
                    value={selectedReturnMemberId}
                    onChange={(event) => setSelectedReturnMemberId(event.target.value)}
                  >
                    <option value="">選択してください</option>
                    {selectableReturnMembers.length === 0 ? (
                      <option value="" disabled>
                        候補メンバーがありません
                      </option>
                    ) : (
                      selectableReturnMembers.map((member) => (
                        <option
                          key={`return-option-${member.id}`}
                          value={member.id}
                          disabled={returnAssignedIds.has(member.id)}
                        >
                          {memberDisplayName(member.id)}
                          {returnAssignedIds.has(member.id) ? "（追加済み）" : ""}
                        </option>
                      ))
                    )}
                  </select>
                  <button
                    type="button"
                    className="button button-small button-secondary"
                    onClick={() => addCarpoolAssignmentMember("returnMemberIds", selectedReturnMemberId)}
                    disabled={!selectedReturnMemberId || returnAssignedIds.has(selectedReturnMemberId)}
                  >
                    追加
                  </button>
                </div>
                <div className="events-checklist-list">
                  {sortAssignedMemberIds(carpoolAssignmentDraft.returnMemberIds).map((memberId) => (
                    <div key={`return-${memberId}`} className="events-checklist-row">
                      <div className="events-simple-list-main">
                        <p className="events-simple-list-title">{memberDisplayName(memberId)}</p>
                      </div>
                      <div className="events-inline-actions">
                        <button
                          type="button"
                          className="button button-small button-secondary"
                          onClick={() => removeCarpoolAssignmentMember("returnMemberIds", memberId)}
                        >
                          削除
                        </button>
                      </div>
                    </div>
                  ))}
                  {carpoolAssignmentDraft.returnMemberIds.length === 0 && (
                    <p className="muted">帰りの乗車メンバーは未設定です。</p>
                  )}
                </div>
              </section>
            </div>
            <div className="modal-actions">
              <button type="button" className="button button-secondary" onClick={closeCarpoolAssignmentEditor}>
                キャンセル
              </button>
              <button type="button" className="button" onClick={() => void saveCarpoolAssignments()}>
                保存
              </button>
            </div>
          </section>
        </div>
      )}

      {selectedEvent && isSessionBindModalOpen && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <section className="modal-panel events-bind-sessions-modal" onClick={(event) => event.stopPropagation()}>
            <button type="button" className="modal-close" aria-label="閉じる" title="閉じる" onClick={() => setIsSessionBindModalOpen(false)}>
              ×
            </button>
              <h3>関連予定を選択</h3>
              <p className="modal-context">{selectedEvent.title}</p>
              <div className="calendar-day-sheet-list">
              {bindableEventSessions.map((session) => (
                <article key={`bind-${session.id}`} className={`session-card ${session.type}`}>
                  <span className={`session-type-badge ${session.type}`}>{sessionTypeLabel[session.type]}</span>
                  <div className="calendar-day-sheet-main session-card-body">
                    <p className="calendar-day-sheet-time session-time">
                      {toDateLabel(session.date)} {session.startTime}-{session.endTime}
                    </p>
                    {session.eventName && <p className="calendar-day-sheet-meta">{session.eventName}</p>}
                    {session.location && (
                      <p className="calendar-day-sheet-meta kv-row">
                        <span className="kv-key">場所：</span>
                        <span className="kv-val">{session.location}</span>
                      </p>
                    )}
                    <div className="modal-actions">
                      <button
                        type="button"
                        className="button button-small button-secondary"
                        onClick={() => void bindSessionToEvent(session.id)}
                      >
                        紐づける
                      </button>
                    </div>
                  </div>
                </article>
              ))}
              {bindableEventSessions.length === 0 && <p className="muted">紐付け可能な予定はありません。</p>}
            </div>
            <div className="modal-actions">
              <button type="button" className="button button-small" onClick={() => setIsSessionBindModalOpen(false)}>
                閉じる
              </button>
            </div>
          </section>
        </div>
      )}

      {unlinkTargetSession && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <section className="modal-panel events-delete-modal" onClick={(event) => event.stopPropagation()}>
            <button type="button" className="modal-close" aria-label="閉じる" title="閉じる" onClick={() => setUnlinkTargetSessionId(null)}>
              ×
            </button>
            <h3>イベントから解除しますか？</h3>
            <p className="modal-summary">
              {toDateLabel(unlinkTargetSession.date)} {unlinkTargetSession.startTime}-{unlinkTargetSession.endTime}
            </p>
            <div className="modal-actions">
              <button type="button" className="button button-secondary" onClick={() => setUnlinkTargetSessionId(null)}>
                キャンセル
              </button>
              <button type="button" className="button events-danger-button" onClick={() => void confirmUnlinkSession()}>
                解除
              </button>
            </div>
          </section>
        </div>
      )}

      {editingEventId && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <section className="modal-panel events-editor-modal" onClick={(event) => event.stopPropagation()}>
            <button type="button" className="modal-close" aria-label="閉じる" title="閉じる" onClick={closeEditModal}>
              ×
            </button>
            <div className="events-editor-modal-body">
              <h3>{isCreateMode ? "追加" : "イベント編集"}</h3>
              <label>
                タイトル
                <input value={formDraft.title} onChange={(event) => setFormDraft((current) => ({ ...current, title: event.target.value }))} />
                {formErrors.title && <span className="field-error">{formErrors.title}</span>}
              </label>
              <label>
                種別
                <select value={formDraft.kind} onChange={(event) => setFormDraft((current) => ({ ...current, kind: event.target.value as EventKind }))}>
                  <option value="コンクール">コンクール</option>
                  <option value="演奏会">演奏会</option>
                  <option value="合同練習">合同練習</option>
                  <option value="その他">その他</option>
                </select>
              </label>
              <label>
                代表日
                <input
                  type="date"
                  value={formDraft.eventSortDate}
                  onChange={(event) => setFormDraft((current) => ({ ...current, eventSortDate: event.target.value }))}
                />
                {formErrors.eventSortDate && <span className="field-error">{formErrors.eventSortDate}</span>}
              </label>
              <label>
                メモ
                <textarea value={formDraft.memo} onChange={(event) => setFormDraft((current) => ({ ...current, memo: event.target.value }))} />
              </label>
              <label>
                状態
                <select value={formDraft.state} onChange={(event) => setFormDraft((current) => ({ ...current, state: event.target.value as EventRecord["state"] }))}>
                  <option value="active">進行中</option>
                  <option value="done">完了</option>
                </select>
              </label>
              <section className="events-carpool-editor">
              <div className="events-carpool-editor-header">
                <h4>配車</h4>
                <p className="muted">乗車定員（運転手除く）と、行き / 帰りの可否を設定します。</p>
              </div>
              <div className="events-carpool-picker">
                <select value={selectedVehicleKey} onChange={(event) => setSelectedVehicleKey(event.target.value)}>
                  {selectableCarpoolOptions.length === 0 ? (
                    <option value="">追加できる車両はありません</option>
                  ) : (
                    selectableCarpoolOptions.map((option) => (
                      <option key={option.key} value={option.key} disabled={addedCarpoolVehicleKeys.has(option.key)}>
                        {option.label}
                        {addedCarpoolVehicleKeys.has(option.key) ? "（追加済み）" : ""}
                      </option>
                    ))
                  )}
                </select>
                <button
                  type="button"
                  className="button button-small button-secondary"
                  onClick={addCarpoolVehicle}
                  disabled={!selectedVehicleKey || addedCarpoolVehicleKeys.has(selectedVehicleKey)}
                >
                  追加
                </button>
              </div>
              <div className="events-carpool-list">
                {formDraft.carpoolVehicles.map((vehicle) => {
                  const vehicleKey = `${vehicle.familyId}:${vehicle.vehicleIndex}`;
                  return (
                    <article key={vehicleKey} className="events-carpool-row">
                      <div>
                        <p className="events-carpool-name">
                          {toVehicleLabel(
                            resolveFamilyNameFromIdentifier({
                              identifier: vehicle.familyId,
                              memberIndexes,
                              familiesById,
                              fallback: vehicle.familyNameSnapshot || "名称未設定",
                            }) || vehicle.familyNameSnapshot || "名称未設定",
                            vehicle.maker,
                            vehicle.model,
                          )}
                        </p>
                        <p className="events-carpool-capacity">
                          乗車定員（運転手除く）: {toPassengerCapacity(vehicle.capacity)}人
                        </p>
                      </div>
                      <div className="events-carpool-actions">
                        <label className="events-carpool-toggle">
                          <input
                            type="checkbox"
                            checked={isOutboundAvailable(vehicle)}
                            onChange={(event) =>
                              updateCarpoolVehicleDirection(vehicleKey, "canOutbound", event.target.checked)
                            }
                          />
                          <span>行き</span>
                        </label>
                        <label className="events-carpool-toggle">
                          <input
                            type="checkbox"
                            checked={isReturnAvailable(vehicle)}
                            onChange={(event) =>
                              updateCarpoolVehicleDirection(vehicleKey, "canReturn", event.target.checked)
                            }
                          />
                          <span>帰り</span>
                        </label>
                        <button
                          type="button"
                          className="link-icon-button"
                          aria-label="削除"
                          onClick={() => removeCarpoolVehicle(vehicleKey)}
                        >
                          ×
                        </button>
                      </div>
                    </article>
                  );
                })}
                {formDraft.carpoolVehicles.length === 0 && <p className="muted">配車はまだ登録されていません。</p>}
              </div>
              <div className="events-carpool-summary">
                <p className="events-carpool-total">行き合計人数: {formDraftCarpoolCapacitySummary.outbound}人</p>
                <p className="events-carpool-total">帰り合計人数: {formDraftCarpoolCapacitySummary.return}人</p>
              </div>
            </section>
            </div>
            <div className="modal-actions">
              <button type="button" className="button button-secondary" onClick={closeEditModal}>
                キャンセル
              </button>
              <button type="button" className="button" onClick={() => void saveEventDraft()}>
                保存
              </button>
            </div>
          </section>
        </div>
      )}

      {deleteTargetEvent && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <section className="modal-panel events-delete-modal" onClick={(event) => event.stopPropagation()}>
            <button type="button" className="modal-close" aria-label="閉じる" title="閉じる" onClick={() => setDeleteTargetId(null)}>
              ×
            </button>
            <h3>イベントを削除しますか？</h3>
            <p className="modal-summary">{deleteTargetEvent.title}</p>
            <p className="muted">削除したイベントは元に戻せません。</p>
            <div className="modal-actions">
              <button type="button" className="button button-secondary" onClick={() => setDeleteTargetId(null)}>
                キャンセル
              </button>
              <button type="button" className="button events-danger-button" onClick={() => void confirmDelete()}>
                削除
              </button>
            </div>
          </section>
        </div>
      )}
    </section>
  );
}
