import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { saveAttendanceEntries, type SaveAttendanceEntry } from "../attendance/service";
import {
  attendanceViewModeStorageKey,
  countAttendanceStatuses,
  findRsvpForMember,
  resolveEditableAttendanceMemberIds,
  sortAttendanceSessions,
  type AttendanceSessionItem,
  type AttendanceViewMode,
} from "../attendance/utils";
import { isChildMember, sortMembersForDisplay } from "../members/permissions";
import { subscribeMemberRelations, subscribeMembers } from "../members/service";
import type { MemberRecord, MemberRelationRecord } from "../members/types";
import type { DemoData, RsvpStatus, SessionDoc } from "../types";
import {
  formatDateYmd,
  formatTimeNoLeadingZero,
  formatWeekdayJa,
  formatMonthJa,
  getMonthKeyFromDateKey,
  isValidMonthKey,
  shiftMonthKey,
  todayDateKey,
} from "../utils/date";

type AttendancePageProps = {
  data: DemoData;
  currentUid: string;
  linkedMember: MemberRecord | null;
  authRole?: "parent" | "admin" | null;
  applyAttendanceEntries: (entries: SaveAttendanceEntry[]) => void;
};

type AttendanceMemberModalState = {
  member: MemberRecord;
  editable: boolean;
};

type AttendanceSessionModalState = {
  item: AttendanceSessionItem;
};

type DraftEntry = {
  status: RsvpStatus;
  comment: string;
};

const TEXT = {
  title: "\u51fa\u6b20",
  loading: "\u51fa\u6b20\u30c7\u30fc\u30bf\u3092\u8aad\u307f\u8fbc\u307f\u4e2d\u3067\u3059\u3002",
  noSessions: "\u3053\u306e\u6708\u306b\u5bfe\u8c61\u4e88\u5b9a\u306f\u3042\u308a\u307e\u305b\u3093\u3002",
  monthCurrent: "\u4eca\u6708",
  monthPrev: "\u524d\u6708",
  monthNext: "\u7fcc\u6708",
  swapAxis: "\u884c\u3068\u5217\u3092\u5165\u308c\u66ff\u3048",
  sessionColumn: "\u4e88\u5b9a",
  memberColumn: "\u90e8\u54e1",
  statusYes: "\u25cb",
  statusMaybe: "\u25b3",
  statusNo: "\u00d7",
  statusUnknown: "\u30fc",
  statusYesLabel: "\u53c2\u52a0",
  statusMaybeLabel: "\u6761\u4ef6\u4ed8\u304d\u53c2\u52a0 / \u672a\u78ba\u5b9a",
  statusNoLabel: "\u4e0d\u53c2\u52a0",
  commentLabel: "\u30b3\u30e1\u30f3\u30c8",
  close: "\u9589\u3058\u308b",
  cancel: "\u30ad\u30e3\u30f3\u30bb\u30eb",
  save: "\u4fdd\u5b58",
  saving: "\u4fdd\u5b58\u4e2d...",
  saveSuccess: "\u51fa\u6b20\u3092\u4fdd\u5b58\u3057\u307e\u3057\u305f\u3002",
  commentPlaceholder: "\u88dc\u8db3\u304c\u3042\u308c\u3070\u5165\u529b",
  commentDisabledPlaceholder: "\u307e\u305a \u25cb / \u25b3 / \u00d7 \u3092\u9078\u3093\u3067\u304f\u3060\u3055\u3044",
  readOnlyEmptyComment: "-",
  adminHelperTitle: "\u672a\u56de\u7b54\u30c1\u30a7\u30c3\u30af",
  adminHelperEmpty: "\u672a\u56de\u7b54\u306f\u3042\u308a\u307e\u305b\u3093\u3002",
  editableLabel: "\u7de8\u96c6",
  readOnlyLabel: "\u95b2\u89a7",
  commentToggle: "\u30b3\u30e1\u30f3\u30c8",
  commentEdit: "\u5165\u529b",
  commentExpand: "\u5168\u6587\u3092\u8868\u793a",
  commentCollapse: "\u9589\u3058\u308b",
  noMembers: "\u5bfe\u8c61\u306e\u90e8\u54e1\u306f\u307e\u3060\u3044\u307e\u305b\u3093\u3002",
};

const statusButtonMeta: Array<{ status: RsvpStatus; symbol: string; label: string }> = [
  { status: "yes", symbol: TEXT.statusYes, label: TEXT.statusYesLabel },
  { status: "maybe", symbol: TEXT.statusMaybe, label: TEXT.statusMaybeLabel },
  { status: "no", symbol: TEXT.statusNo, label: TEXT.statusNoLabel },
];

const sessionTypeLabel: Record<SessionDoc["type"], string> = {
  normal: "\u901a\u5e38\u7df4\u7fd2",
  self: "\u81ea\u4e3b\u7df4",
  event: "\u30a4\u30d9\u30f3\u30c8",
};

const makeSessionKey = (item: AttendanceSessionItem): string =>
  item.session.id ? `${item.date}:${item.session.id}` : `${item.date}:${item.session.order}`;

const getSessionMetaLabel = (item: AttendanceSessionItem): string =>
  `${formatDateYmd(item.date)}(${formatWeekdayJa(item.date)}) ${formatTimeNoLeadingZero(item.session.startTime)}-${formatTimeNoLeadingZero(item.session.endTime)}`;

const getSessionHeading = (session: SessionDoc): string =>
  session.type === "event" && session.eventName?.trim() ? session.eventName.trim() : "\u4e88\u5b9a";

const summarizeComment = (value: string, maxLength = 18): string => {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) return TEXT.readOnlyEmptyComment;
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength)}...` : normalized;
};

const buildMonthSessions = (data: DemoData, monthKey: string): AttendanceSessionItem[] => {
  const items = Object.entries(data.scheduleDays).flatMap(([date, day]) => {
    if (getMonthKeyFromDateKey(date) !== monthKey) return [];
    return day.sessions.map((session) => ({
      key: session.id ? `${date}:${session.id}` : `${date}:${session.order}`,
      date,
      session,
    }));
  });
  return sortAttendanceSessions(items);
};

const resolveMonthKey = (rawMonthKey: string | null): string => {
  if (rawMonthKey && isValidMonthKey(rawMonthKey)) return rawMonthKey;
  return getMonthKeyFromDateKey(todayDateKey());
};

const getDefaultViewMode = (): AttendanceViewMode => {
  if (typeof window === "undefined") return "session";
  const saved = window.localStorage.getItem(attendanceViewModeStorageKey);
  return saved === "member" ? "member" : "session";
};

const getTargetSessionKey = (items: AttendanceSessionItem[], today: string): string | null => {
  if (items.length === 0) return null;
  const firstFuture = items.find((item) => item.date >= today);
  return makeSessionKey(firstFuture ?? items[items.length - 1]);
};

export function AttendancePage({
  data,
  currentUid,
  linkedMember,
  authRole,
  applyAttendanceEntries,
}: AttendancePageProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [members, setMembers] = useState<MemberRecord[]>([]);
  const [relations, setRelations] = useState<MemberRelationRecord[]>([]);
  const [membersError, setMembersError] = useState("");
  const [relationsError, setRelationsError] = useState("");
  const [viewMode, setViewMode] = useState<AttendanceViewMode>(getDefaultViewMode);
  const [selectedMemberState, setSelectedMemberState] = useState<AttendanceMemberModalState | null>(
    null,
  );
  const [selectedSessionState, setSelectedSessionState] = useState<AttendanceSessionModalState | null>(
    null,
  );
  const [draftBySessionKey, setDraftBySessionKey] = useState<Record<string, DraftEntry>>({});
  const [saveError, setSaveError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [toastMessage, setToastMessage] = useState("");
  const [expandedCommentSessionKeys, setExpandedCommentSessionKeys] = useState<string[]>([]);
  const rowTargetRef = useRef<HTMLTableRowElement | null>(null);
  const columnTargetRef = useRef<HTMLButtonElement | null>(null);
  const today = todayDateKey();
  const monthKey = resolveMonthKey(searchParams.get("ym"));

  useEffect(() => {
    try {
      return subscribeMembers((rows) => {
        setMembers(rows);
        setMembersError("");
      });
    } catch (error) {
      setMembersError(
        error instanceof Error ? error.message : "\u30e1\u30f3\u30d0\u30fc\u306e\u8aad\u307f\u8fbc\u307f\u306b\u5931\u6557\u3057\u307e\u3057\u305f\u3002",
      );
      return undefined;
    }
  }, []);

  useEffect(() => {
    try {
      return subscribeMemberRelations((rows) => {
        setRelations(rows);
        setRelationsError("");
      });
    } catch (error) {
      setRelationsError(
        error instanceof Error ? error.message : "\u7d10\u3065\u304d\u95a2\u4fc2\u306e\u8aad\u307f\u8fbc\u307f\u306b\u5931\u6557\u3057\u307e\u3057\u305f\u3002",
      );
      return undefined;
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(attendanceViewModeStorageKey, viewMode);
  }, [viewMode]);

  useEffect(() => {
    if (!selectedMemberState) return;
    setSaveError("");
    setIsSaving(false);
    setExpandedCommentSessionKeys([]);

    const nextDraft = buildMonthSessions(data, monthKey).reduce<Record<string, DraftEntry>>(
      (result, item) => {
        const rsvp = findRsvpForMember(item.session, selectedMemberState.member);
        result[makeSessionKey(item)] = {
          status: rsvp?.status ?? "unknown",
          comment: rsvp?.comment ?? "",
        };
        return result;
      },
      {},
    );
    setDraftBySessionKey(nextDraft);
  }, [data, monthKey, selectedMemberState]);

  useEffect(() => {
    if (!toastMessage) return;
    const timer = window.setTimeout(() => setToastMessage(""), 2200);
    return () => window.clearTimeout(timer);
  }, [toastMessage]);

  useEffect(() => {
    if (viewMode === "session") {
      rowTargetRef.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
      return;
    }
    columnTargetRef.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [monthKey, viewMode, data.scheduleDays]);

  const childMembers = useMemo(
    () =>
      sortMembersForDisplay(
        members.filter((member) => member.memberStatus === "active" && isChildMember(member)),
        "child",
      ),
    [members],
  );

  const monthSessions = useMemo(() => buildMonthSessions(data, monthKey), [data, monthKey]);

  const editableMemberIds = useMemo(
    () => resolveEditableAttendanceMemberIds(linkedMember, authRole, childMembers, relations),
    [authRole, childMembers, linkedMember, relations],
  );

  const targetSessionKey = useMemo(() => getTargetSessionKey(monthSessions, today), [monthSessions, today]);

  const memberCounts = useMemo(
    () =>
      childMembers.reduce<Record<string, { yes: number; maybe: number; no: number; unknown: number }>>(
        (result, member) => {
          result[member.id] = monthSessions.reduce(
            (counts, item) => {
              const status = findRsvpForMember(item.session, member)?.status ?? "unknown";
              counts[status] += 1;
              return counts;
            },
            { yes: 0, maybe: 0, no: 0, unknown: 0 },
          );
          return result;
        },
        {},
      ),
    [childMembers, monthSessions],
  );

  const adminUnansweredMembers = useMemo(() => {
    const isAdmin =
      authRole === "admin" || linkedMember?.role === "admin" || linkedMember?.adminRole === "admin";
    if (!isAdmin) return null;

    return childMembers
      .map((member) => ({
        member,
        unknownCount: memberCounts[member.id]?.unknown ?? 0,
      }))
      .filter((item) => item.unknownCount > 0);
  }, [authRole, childMembers, linkedMember, memberCounts]);

  const modalSessions = monthSessions;
  const selectedSessionCounts = useMemo(() => {
    if (!selectedSessionState) return null;
    return countAttendanceStatuses(selectedSessionState.item.session, childMembers);
  }, [childMembers, selectedSessionState]);
  const selectedSessionRows = useMemo(() => {
    if (!selectedSessionState) return [];
    return childMembers.map((member) => ({
      member,
      status: findRsvpForMember(selectedSessionState.item.session, member)?.status ?? "unknown",
    }));
  }, [childMembers, selectedSessionState]);

  const moveMonth = (diff: number) => {
    const nextMonthKey = shiftMonthKey(monthKey, diff);
    const nextParams = new URLSearchParams(searchParams);
    if (nextMonthKey === getMonthKeyFromDateKey(today)) {
      nextParams.delete("ym");
    } else {
      nextParams.set("ym", nextMonthKey);
    }
    setSearchParams(nextParams, { replace: true });
  };

  const setCurrentMonth = () => {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete("ym");
    setSearchParams(nextParams, { replace: true });
  };

  const openMemberModal = (member: MemberRecord) => {
    setSelectedMemberState({
      member,
      editable: editableMemberIds.has(member.id),
    });
  };

  const openSessionModal = (item: AttendanceSessionItem) => {
    setSelectedSessionState({ item });
  };

  const closeMemberModal = () => {
    setSelectedMemberState(null);
    setDraftBySessionKey({});
    setSaveError("");
    setIsSaving(false);
    setExpandedCommentSessionKeys([]);
  };

  const closeSessionModal = () => {
    setSelectedSessionState(null);
  };

  const updateDraftStatus = (sessionKey: string, status: RsvpStatus) => {
    setDraftBySessionKey((prev) => ({
      ...prev,
      [sessionKey]: {
        status,
        comment: prev[sessionKey]?.comment ?? "",
      },
    }));
  };

  const updateDraftComment = (sessionKey: string, comment: string) => {
    setDraftBySessionKey((prev) => ({
      ...prev,
      [sessionKey]: {
        status: prev[sessionKey]?.status ?? "unknown",
        comment,
      },
    }));
  };

  const toggleCommentExpansion = (sessionKey: string) => {
    setExpandedCommentSessionKeys((prev) =>
      prev.includes(sessionKey) ? prev.filter((key) => key !== sessionKey) : [...prev, sessionKey],
    );
  };

  const handleSave = async () => {
    if (!selectedMemberState?.editable) return;
    setIsSaving(true);
    setSaveError("");

    const entries: SaveAttendanceEntry[] = modalSessions.map((item) => {
      const sessionKey = makeSessionKey(item);
      const draft = draftBySessionKey[sessionKey] ?? { status: "unknown", comment: "" };
      return {
        date: item.date,
        sessionId: item.session.id ?? "",
        memberId: selectedMemberState.member.id,
        displayName: selectedMemberState.member.name,
        status: draft.status,
        comment: draft.comment,
        updatedBy: currentUid || linkedMember?.id || selectedMemberState.member.id,
      };
    });

    try {
      await saveAttendanceEntries(entries.filter((entry) => entry.sessionId));
      applyAttendanceEntries(entries.filter((entry) => entry.sessionId));
      setToastMessage(TEXT.saveSuccess);
      closeMemberModal();
    } catch (error) {
      setSaveError(
        error instanceof Error ? error.message : "\u51fa\u6b20\u306e\u4fdd\u5b58\u306b\u5931\u6557\u3057\u307e\u3057\u305f\u3002",
      );
      setIsSaving(false);
    }
  };

  return (
    <section className="card attendance-page">
      <div className="attendance-page-header">
        <div>
          <h1>{TEXT.title}</h1>
        </div>
        <div className="attendance-page-controls">
          <div className="attendance-month-nav">
            <button type="button" className="button button-small button-secondary" onClick={() => moveMonth(-1)}>
              {TEXT.monthPrev}
            </button>
            <strong className="attendance-month-label">{formatMonthJa(monthKey)}</strong>
            <button type="button" className="button button-small button-secondary" onClick={() => setCurrentMonth()}>
              {TEXT.monthCurrent}
            </button>
            <button type="button" className="button button-small button-secondary" onClick={() => moveMonth(1)}>
              {TEXT.monthNext}
            </button>
          </div>
          <div className="attendance-view-toggle">
            <button
              type="button"
              className={`button button-small button-secondary attendance-swap-button ${viewMode === "member" ? "is-swapped" : ""}`}
              onClick={() => setViewMode((current) => (current === "session" ? "member" : "session"))}
              aria-pressed={viewMode === "member"}
            >
              {TEXT.swapAxis}
            </button>
          </div>
        </div>
      </div>

      {toastMessage && <div className="inline-toast">{toastMessage}</div>}
      {membersError && <p className="field-error">{membersError}</p>}
      {relationsError && <p className="field-error">{relationsError}</p>}

      {adminUnansweredMembers && (
        <section className="attendance-admin-helper">
          <details>
            <summary className="attendance-admin-helper-summary">
              <span>{TEXT.adminHelperTitle}</span>
              <span className={`attendance-admin-helper-badge ${adminUnansweredMembers.length > 0 ? "has-items" : ""}`}>
                {adminUnansweredMembers.length > 0
                  ? `\u8981\u78ba\u8a8d ${adminUnansweredMembers.length}\u4eba`
                  : "\u672a\u56de\u7b54 0"}
              </span>
            </summary>
            <ul className="attendance-admin-helper-list">
              {adminUnansweredMembers.length === 0 ? (
                <li className="attendance-admin-helper-empty">{TEXT.adminHelperEmpty}</li>
              ) : (
                adminUnansweredMembers.map((item) => (
                  <li key={item.member.id}>
                    <button
                      type="button"
                      className="attendance-inline-link"
                      onClick={() => openMemberModal(item.member)}
                    >
                      {item.member.name}
                    </button>
                    <span className="attendance-admin-helper-count">{`${TEXT.statusUnknown}${item.unknownCount}`}</span>
                  </li>
                ))
              )}
            </ul>
          </details>
        </section>
      )}

      {monthSessions.length === 0 ? (
        <p className="muted">{TEXT.noSessions}</p>
      ) : (
        <div className="attendance-table-wrap">
          {viewMode === "session" ? (
            <table className="attendance-matrix attendance-matrix-by-session">
              <thead>
                <tr>
                  <th className="attendance-sticky-col attendance-corner-cell">{TEXT.sessionColumn}</th>
                  {childMembers.map((member) => (
                    <th key={member.id} className="attendance-member-head">
                      <button
                        type="button"
                        className="attendance-member-button"
                        onClick={() => openMemberModal(member)}
                      >
                        <span>{member.name}</span>
                        <span className={`attendance-member-access ${editableMemberIds.has(member.id) ? "editable" : "readonly"}`}>
                          {editableMemberIds.has(member.id) ? TEXT.editableLabel : TEXT.readOnlyLabel}
                        </span>
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {monthSessions.map((item) => {
                  const sessionKey = makeSessionKey(item);
                  const counts = countAttendanceStatuses(item.session, childMembers);
                  return (
                    <tr
                      key={sessionKey}
                      ref={targetSessionKey === sessionKey ? rowTargetRef : null}
                    >
                      <th className="attendance-sticky-col attendance-session-head">
                        <button
                          type="button"
                          className="attendance-session-button"
                          onClick={() => openSessionModal(item)}
                        >
                          <div className="attendance-session-head-main">
                            <div className="attendance-session-head-top">
                              <div className="attendance-session-heading">
                                <span className="attendance-session-date attendance-session-date-full">
                                  {formatDateYmd(item.date)}({formatWeekdayJa(item.date)})
                                </span>
                                <span className="attendance-session-date attendance-session-date-compact">
                                  {formatDateYmd(item.date).slice(5)}({formatWeekdayJa(item.date)})
                                </span>
                                <span className="attendance-session-time">
                                  {formatTimeNoLeadingZero(item.session.startTime)}-{formatTimeNoLeadingZero(item.session.endTime)}
                                </span>
                                <strong className="attendance-session-title">{getSessionHeading(item.session)}</strong>
                              </div>
                              <span className={`session-type-badge ${item.session.type}`}>{sessionTypeLabel[item.session.type]}</span>
                            </div>
                            <span className="attendance-session-counts">
                              <span className="attendance-count-pill count-yes">{`${TEXT.statusYes}${counts.yes}`}</span>
                              <span className="attendance-count-pill count-maybe">{`${TEXT.statusMaybe}${counts.maybe}`}</span>
                              <span className="attendance-count-pill count-no">{`${TEXT.statusNo}${counts.no}`}</span>
                              <span className="attendance-count-pill count-unknown">{`${TEXT.statusUnknown}${counts.unknown}`}</span>
                            </span>
                          </div>
                        </button>
                      </th>
                      {childMembers.map((member) => {
                        const status = findRsvpForMember(item.session, member)?.status ?? "unknown";
                        return (
                          <td key={member.id} className={`attendance-cell ${status}`}>
                            <span className={`rsvp-mark ${status}`}>{status === "yes" ? TEXT.statusYes : status === "maybe" ? TEXT.statusMaybe : status === "no" ? TEXT.statusNo : TEXT.statusUnknown}</span>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <table className="attendance-matrix attendance-matrix-by-member">
              <thead>
                <tr>
                  <th className="attendance-sticky-col attendance-corner-cell">{TEXT.memberColumn}</th>
                  {monthSessions.map((item) => {
                    const sessionKey = makeSessionKey(item);
                    const counts = countAttendanceStatuses(item.session, childMembers);
                    return (
                      <th key={sessionKey} className="attendance-session-column-head">
                        <button
                          type="button"
                          className="attendance-session-column-button"
                          onClick={() => openSessionModal(item)}
                          ref={targetSessionKey === sessionKey ? columnTargetRef : null}
                        >
                          <span>{formatDateYmd(item.date).slice(5)}</span>
                          <span>{formatTimeNoLeadingZero(item.session.startTime)}</span>
                          <span className="attendance-session-column-title">{getSessionHeading(item.session)}</span>
                          <span className={`session-type-badge ${item.session.type}`}>{sessionTypeLabel[item.session.type]}</span>
                          <span className="attendance-session-counts compact">
                            <span className="attendance-count-pill count-yes">{`${TEXT.statusYes}${counts.yes}`}</span>
                            <span className="attendance-count-pill count-maybe">{`${TEXT.statusMaybe}${counts.maybe}`}</span>
                            <span className="attendance-count-pill count-no">{`${TEXT.statusNo}${counts.no}`}</span>
                            <span className="attendance-count-pill count-unknown">{`${TEXT.statusUnknown}${counts.unknown}`}</span>
                          </span>
                        </button>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {childMembers.map((member) => {
                  const counts = memberCounts[member.id] ?? { yes: 0, maybe: 0, no: 0, unknown: 0 };
                  return (
                    <tr key={member.id}>
                      <th className="attendance-sticky-col attendance-member-row-head">
                        <button
                          type="button"
                          className="attendance-member-button row"
                          onClick={() => openMemberModal(member)}
                        >
                          <span>{member.name}</span>
                          <span className={`attendance-member-access ${editableMemberIds.has(member.id) ? "editable" : "readonly"}`}>
                            {editableMemberIds.has(member.id) ? TEXT.editableLabel : TEXT.readOnlyLabel}
                          </span>
                          <span className="attendance-member-counts">
                            <span className="attendance-count-pill count-yes">{`${TEXT.statusYes}${counts.yes}`}</span>
                            <span className="attendance-count-pill count-maybe">{`${TEXT.statusMaybe}${counts.maybe}`}</span>
                            <span className="attendance-count-pill count-no">{`${TEXT.statusNo}${counts.no}`}</span>
                            <span className="attendance-count-pill count-unknown">{`${TEXT.statusUnknown}${counts.unknown}`}</span>
                          </span>
                        </button>
                      </th>
                      {monthSessions.map((item) => {
                        const status = findRsvpForMember(item.session, member)?.status ?? "unknown";
                        return (
                          <td key={makeSessionKey(item)} className={`attendance-cell ${status}`}>
                            <span className={`rsvp-mark ${status}`}>{status === "yes" ? TEXT.statusYes : status === "maybe" ? TEXT.statusMaybe : status === "no" ? TEXT.statusNo : TEXT.statusUnknown}</span>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {selectedMemberState && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" onClick={closeMemberModal}>
          <section className="modal-panel attendance-member-modal" onClick={(event) => event.stopPropagation()}>
            <button
              type="button"
              className="modal-close"
              onClick={closeMemberModal}
              aria-label={TEXT.close}
              title={TEXT.close}
            >
              ×
            </button>
            <h2>{selectedMemberState.member.name}</h2>
            {saveError && <p className="modal-error">{saveError}</p>}

            <div className="attendance-member-modal-list">
              <div className="attendance-member-modal-table" role="table" aria-label={`${selectedMemberState.member.name}\u306e\u51fa\u6b20`}>
                <div className="attendance-member-modal-table-head" role="row">
                  <span role="columnheader">\u4e88\u5b9a</span>
                  <span role="columnheader">\u72b6\u614b</span>
                  <span role="columnheader">{TEXT.commentLabel}</span>
                </div>
              {modalSessions.map((item) => {
                const sessionKey = makeSessionKey(item);
                const draft = draftBySessionKey[sessionKey] ?? { status: "unknown" as RsvpStatus, comment: "" };
                const commentExpanded = expandedCommentSessionKeys.includes(sessionKey);
                return (
                  <div key={sessionKey} className="attendance-member-modal-row" role="row">
                    <div className="attendance-member-modal-session" role="cell">
                      <div className="attendance-member-modal-session-main">
                        <strong>{getSessionHeading(item.session)}</strong>
                        <span>{getSessionMetaLabel(item)}</span>
                      </div>
                      <span className={`session-type-badge ${item.session.type}`}>{sessionTypeLabel[item.session.type]}</span>
                    </div>
                    {selectedMemberState.editable ? (
                      <>
                        <div className="attendance-member-modal-fields" role="cell">
                          <div className="rsvp-toggle-group">
                            {statusButtonMeta.map((option) => (
                              <button
                                key={option.status}
                                type="button"
                                className={`rsvp-toggle ${option.status} ${draft.status === option.status ? "active" : ""}`}
                                onClick={() => updateDraftStatus(sessionKey, option.status)}
                                title={option.label}
                                aria-label={option.label}
                              >
                                {option.symbol}
                              </button>
                            ))}
                          </div>
                        </div>
                        <div className="attendance-comment-cell" role="cell">
                          <button
                            type="button"
                            className="attendance-comment-toggle"
                            onClick={() => toggleCommentExpansion(sessionKey)}
                          >
                            <span>{draft.comment.trim() ? summarizeComment(draft.comment) : TEXT.commentToggle}</span>
                            <span>{commentExpanded ? TEXT.commentCollapse : TEXT.commentEdit}</span>
                          </button>
                          {commentExpanded && (
                            <label className="attendance-comment-field">
                              <textarea
                                value={draft.comment}
                                onChange={(event) => updateDraftComment(sessionKey, event.target.value)}
                                placeholder={
                                  draft.status === "unknown"
                                    ? TEXT.commentDisabledPlaceholder
                                    : TEXT.commentPlaceholder
                                }
                                disabled={draft.status === "unknown"}
                              />
                            </label>
                          )}
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="attendance-member-modal-readonly" role="cell">
                        <span className={`rsvp-mark ${draft.status}`}>
                          {draft.status === "yes"
                            ? `${TEXT.statusYes} ${TEXT.statusYesLabel}`
                            : draft.status === "maybe"
                              ? `${TEXT.statusMaybe} ${TEXT.statusMaybeLabel}`
                              : draft.status === "no"
                                ? `${TEXT.statusNo} ${TEXT.statusNoLabel}`
                                : `${TEXT.statusUnknown} \u672a\u56de\u7b54`}
                        </span>
                        </div>
                        <div className="attendance-comment-cell" role="cell">
                          {draft.comment.trim() ? (
                            <>
                              <button
                                type="button"
                                className="attendance-comment-toggle"
                                onClick={() => toggleCommentExpansion(sessionKey)}
                              >
                                <span>{summarizeComment(draft.comment)}</span>
                                <span>{commentExpanded ? TEXT.commentCollapse : TEXT.commentExpand}</span>
                              </button>
                              {commentExpanded && <p className="attendance-comment-readonly">{draft.comment.trim()}</p>}
                            </>
                          ) : (
                            <p className="attendance-comment-readonly empty">{TEXT.readOnlyEmptyComment}</p>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
              </div>
            </div>

            <div className="modal-actions">
              <button
                type="button"
                className="button button-secondary"
                onClick={closeMemberModal}
                disabled={isSaving}
              >
                {TEXT.cancel}
              </button>
              {selectedMemberState.editable && (
                <button type="button" className="button" onClick={() => void handleSave()} disabled={isSaving}>
                  {isSaving ? TEXT.saving : TEXT.save}
                </button>
              )}
            </div>
          </section>
        </div>
      )}

      {selectedSessionState && selectedSessionCounts && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" onClick={closeSessionModal}>
          <section className="modal-panel attendance-session-modal" onClick={(event) => event.stopPropagation()}>
            <button
              type="button"
              className="modal-close"
              onClick={closeSessionModal}
              aria-label={TEXT.close}
              title={TEXT.close}
            >
              ×
            </button>
            <p className="modal-context">
              {formatDateYmd(selectedSessionState.item.date)}（{formatWeekdayJa(selectedSessionState.item.date)}） /{" "}
              {formatTimeNoLeadingZero(selectedSessionState.item.session.startTime)}-
              {formatTimeNoLeadingZero(selectedSessionState.item.session.endTime)}
            </p>
            <h2>{getSessionHeading(selectedSessionState.item.session)}</h2>
            <p className="modal-summary">
              <span className={`session-type-badge ${selectedSessionState.item.session.type}`}>
                {sessionTypeLabel[selectedSessionState.item.session.type]}
              </span>
            </p>
            <p className="modal-summary">
              <span className="attendance-count-pill count-yes">{`${TEXT.statusYes}${selectedSessionCounts.yes}`}</span>{" "}
              <span className="attendance-count-pill count-maybe">{`${TEXT.statusMaybe}${selectedSessionCounts.maybe}`}</span>{" "}
              <span className="attendance-count-pill count-no">{`${TEXT.statusNo}${selectedSessionCounts.no}`}</span>{" "}
              <span className="attendance-count-pill count-unknown">{`${TEXT.statusUnknown}${selectedSessionCounts.unknown}`}</span>
            </p>
            <div className="rsvp-table">
              {selectedSessionRows.length === 0 ? (
                <div className="rsvp-row">
                  <span>{TEXT.noMembers}</span>
                  <span className="rsvp-mark unknown">{TEXT.statusUnknown}</span>
                </div>
              ) : (
                selectedSessionRows.map((row) => (
                  <div key={row.member.id} className="rsvp-row">
                    <span>{row.member.name}</span>
                    <span className={`rsvp-mark ${row.status}`}>
                      {row.status === "yes"
                        ? TEXT.statusYes
                        : row.status === "maybe"
                          ? TEXT.statusMaybe
                          : row.status === "no"
                            ? TEXT.statusNo
                            : TEXT.statusUnknown}
                    </span>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>
      )}
    </section>
  );
}
