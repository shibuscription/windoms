import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { LinkifiedText } from "../components/LinkifiedText";
import { buildFamilyMap, buildMemberIndexes, resolveFamilyNameFromIdentifier } from "../members/familyNameResolver";
import { subscribeFamilies, subscribeMembers } from "../members/service";
import type { FamilyRecord, MemberRecord } from "../members/types";
import { getSessionAssigneeRoleLabel, sessionTypeLabel } from "../schedule/sessionMeta";
import type { DemoData, EventCarpoolVehicle, EventKind, EventRecord, SessionDoc, Todo } from "../types";
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
  const [isLinkedSessionsModalOpen, setIsLinkedSessionsModalOpen] = useState(false);
  const [isSessionBindModalOpen, setIsSessionBindModalOpen] = useState(false);
  const [isCarpoolModalOpen, setIsCarpoolModalOpen] = useState(false);
  const [unlinkTargetSessionId, setUnlinkTargetSessionId] = useState<string | null>(null);
  const [editingEventId, setEditingEventId] = useState<string | "__new__" | null>(null);
  const [formDraft, setFormDraft] = useState<EventFormDraft>(createInitialDraft());
  const [formErrors, setFormErrors] = useState<EventFormErrors>({});
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [families, setFamilies] = useState<FamilyRecord[]>([]);
  const [members, setMembers] = useState<MemberRecord[]>([]);
  const [selectedVehicleKey, setSelectedVehicleKey] = useState("");
  const { eventId } = useParams<{ eventId?: string }>();
  const navigate = useNavigate();
  const today = todayDateKey();
  const defaultClubYear = clubYearFromDateKey(today);
  const [selectedDoneYear, setSelectedDoneYear] = useState<number>(defaultClubYear);

  const isManager = canManageEvents(menuRole);
  useEffect(() => subscribeFamilies(setFamilies), []);
  useEffect(() => subscribeMembers(setMembers), []);
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
  const memberIndexes = useMemo(() => buildMemberIndexes(members), [members]);
  const familiesById = useMemo(() => buildFamilyMap(families), [families]);

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

  const selectedEventCarpoolVehicles = selectedEvent?.carpoolVehicles ?? [];
  const selectedEventCarpoolCapacitySummary = summarizeCarpoolCapacities(selectedEventCarpoolVehicles);
  const formDraftCarpoolCapacitySummary = summarizeCarpoolCapacities(formDraft.carpoolVehicles);

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
    setIsCarpoolModalOpen(false);
    setIsLinkedSessionsModalOpen(false);
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
    const option = carpoolOptions.find((item) => item.key === selectedVehicleKey);
    if (!option) return;

    setFormDraft((current) => {
      const alreadyAdded = current.carpoolVehicles.some(
        (vehicle) =>
          vehicle.familyId === option.vehicle.familyId && vehicle.vehicleIndex === option.vehicle.vehicleIndex,
      );
      if (alreadyAdded) return current;
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

      {selectedEvent && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" onClick={closeDetail}>
          <section className="modal-panel events-detail-modal" onClick={(event) => event.stopPropagation()}>
            <button type="button" className="modal-close" aria-label="閉じる" title="閉じる" onClick={closeDetail}>
              ×
            </button>
            <p className="modal-context">{toDateLabel(selectedEvent.eventSortDate)}</p>
            <h3>{selectedEvent.title}</h3>
            <p className="modal-summary">
              種別: {selectedEvent.kind}
              <span className={`event-status ${selectedEvent.state}`}>{selectedEvent.state === "done" ? "完了" : "進行中"}</span>
            </p>
            {selectedEvent.memo?.trim() && (
              <p className="todo-memo-full">
                <LinkifiedText text={selectedEvent.memo} className="todo-linkified-text" />
              </p>
            )}
            <div className="events-detail-links">
              <button type="button" className="events-linked-summary" onClick={() => setIsLinkedSessionsModalOpen(true)}>
                紐付け予定: {linkedSessions.length}件
              </button>
              {selectedEventCarpoolVehicles.length > 0 && (
                <button type="button" className="events-linked-summary" onClick={() => setIsCarpoolModalOpen(true)}>
                  配車{selectedEventCarpoolVehicles.length}台
                </button>
              )}
            </div>
            <section className="related-todos-block">
              <h4>関連TODO</h4>
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
              <div className="related-todos-footer">
                <button type="button" className="button button-small button-secondary" onClick={() => navigate("/todos")}>
                  TODOページへ
                </button>
              </div>
            </section>
          </section>
        </div>
      )}

      {selectedEvent && isCarpoolModalOpen && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" onClick={() => setIsCarpoolModalOpen(false)}>
          <section className="modal-panel events-carpool-modal" onClick={(event) => event.stopPropagation()}>
            <button type="button" className="modal-close" aria-label="閉じる" title="閉じる" onClick={() => setIsCarpoolModalOpen(false)}>
              ×
            </button>
            <h3>配車</h3>
            <p className="modal-context">{selectedEvent.title}</p>
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
                  </div>
                </article>
              ))}
            </div>
            <div className="events-carpool-summary">
              <p className="events-carpool-total">行き合計人数: {selectedEventCarpoolCapacitySummary.outbound}人</p>
              <p className="events-carpool-total">帰り合計人数: {selectedEventCarpoolCapacitySummary.return}人</p>
            </div>
            <div className="modal-actions">
              <button type="button" className="button button-small" onClick={() => setIsCarpoolModalOpen(false)}>
                閉じる
              </button>
            </div>
          </section>
        </div>
      )}

      {selectedEvent && isLinkedSessionsModalOpen && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" onClick={() => setIsLinkedSessionsModalOpen(false)}>
          <section className="modal-panel events-linked-sessions-modal" onClick={(event) => event.stopPropagation()}>
            <button type="button" className="modal-close" aria-label="閉じる" title="閉じる" onClick={() => setIsLinkedSessionsModalOpen(false)}>
              ×
            </button>
            <div className="events-linked-header">
                <h3>紐付け予定</h3>
              {isManager && (
                <button
                  type="button"
                  className="button button-small"
                  aria-label="追加"
                  title="追加"
                  onClick={() => setIsSessionBindModalOpen(true)}
                >
                  ＋ 追加
                </button>
              )}
            </div>
            <p className="modal-context">{selectedEvent.title}</p>
            <div className="calendar-day-sheet-list">
              {linkedSessions.map((session) => (
                <article key={session.id} className={`session-card ${session.type}`}>
                  <span className={`session-type-badge ${session.type}`}>{sessionTypeLabel[session.type]}</span>
                  <div className="calendar-day-sheet-main session-card-body">
                    <p className="calendar-day-sheet-time session-time">
                      {toDateLabel(session.date)} {session.startTime}-{session.endTime}
                    </p>
                    {session.type === "event" && session.eventName && <p className="calendar-day-sheet-meta">{session.eventName}</p>}
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
            <div className="modal-actions">
              <button type="button" className="button button-small" onClick={() => setIsLinkedSessionsModalOpen(false)}>
                閉じる
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
                  <option value="">車両を選択</option>
                  {carpoolOptions.map((option) => (
                    <option key={option.key} value={option.key}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <button type="button" className="button button-small button-secondary" onClick={addCarpoolVehicle}>
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
