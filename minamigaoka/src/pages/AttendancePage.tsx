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

type DraftEntry = {
  status: RsvpStatus;
  comment: string;
};

const TEXT = {
  title: "\u51fa\u6b20",
  loading: "\u51fa\u6b20\u30c7\u30fc\u30bf\u3092\u8aad\u307f\u8fbc\u307f\u4e2d\u3067\u3059\u3002",
  noSessions: "\u3053\u306e\u6708\u306b\u5bfe\u8c61\u30bb\u30c3\u30b7\u30e7\u30f3\u306f\u3042\u308a\u307e\u305b\u3093\u3002",
  monthCurrent: "\u4eca\u6708",
  monthPrev: "\u524d\u6708",
  monthNext: "\u7fcc\u6708",
  modeBySession: "\u30bb\u30c3\u30b7\u30e7\u30f3\u00d7\u90e8\u54e1",
  modeByMember: "\u90e8\u54e1\u00d7\u30bb\u30c3\u30b7\u30e7\u30f3",
  sessionColumn: "\u4e88\u5b9a",
  memberColumn: "\u90e8\u54e1",
  summaryPrefix: "\u96c6\u8a08",
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
  readOnlyTitleSuffix: "\u306e\u51fa\u6b20\u95b2\u89a7",
  editTitleSuffix: "\u306e\u51fa\u6b20\u7de8\u96c6",
  unansweredHelper: "\u672a\u56de\u7b54\u306f\u672a\u9078\u629e\u306e\u307e\u307e\u3067\u69cb\u3044\u307e\u305b\u3093\u3002",
  commentPlaceholder: "\u88dc\u8db3\u304c\u3042\u308c\u3070\u5165\u529b",
  commentDisabledPlaceholder: "\u307e\u305a \u25cb / \u25b3 / \u00d7 \u3092\u9078\u3093\u3067\u304f\u3060\u3055\u3044",
  readOnlyEmptyComment: "\u30b3\u30e1\u30f3\u30c8\u306f\u3042\u308a\u307e\u305b\u3093\u3002",
  adminHelperTitle: "\u672a\u56de\u7b54\u30c1\u30a7\u30c3\u30af",
  adminHelperEmpty: "\u672a\u56de\u7b54\u306f\u3042\u308a\u307e\u305b\u3093\u3002",
  viewHint:
    "\u90e8\u54e1\u540d\u3092\u62bc\u3059\u3068\u3001\u305d\u306e\u90e8\u54e1\u306e\u51fa\u6b20\u3092\u307e\u3068\u3081\u3066\u78ba\u8a8d\u3067\u304d\u307e\u3059\u3002",
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

const getSessionTitle = (session: SessionDoc): string => {
  if (session.type === "event" && session.eventName?.trim()) {
    return session.eventName.trim();
  }
  return sessionTypeLabel[session.type];
};

const getSessionMetaLabel = (item: AttendanceSessionItem): string =>
  `${formatDateYmd(item.date)}(${formatWeekdayJa(item.date)}) ${formatTimeNoLeadingZero(item.session.startTime)}-${formatTimeNoLeadingZero(item.session.endTime)}`;

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
  const [draftBySessionKey, setDraftBySessionKey] = useState<Record<string, DraftEntry>>({});
  const [saveError, setSaveError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [toastMessage, setToastMessage] = useState("");
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
    if (!isAdmin) return [];

    return childMembers
      .map((member) => ({
        member,
        unknownCount: memberCounts[member.id]?.unknown ?? 0,
      }))
      .filter((item) => item.unknownCount > 0)
      .sort((left, right) => right.unknownCount - left.unknownCount || left.member.name.localeCompare(right.member.name, "ja"));
  }, [authRole, childMembers, linkedMember, memberCounts]);

  const modalSessions = monthSessions;

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

  const closeMemberModal = () => {
    setSelectedMemberState(null);
    setDraftBySessionKey({});
    setSaveError("");
    setIsSaving(false);
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
          <p className="muted">{TEXT.viewHint}</p>
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
          <div className="members-tabs attendance-view-toggle" role="tablist" aria-label={TEXT.title}>
            <button
              type="button"
              className={`members-tab ${viewMode === "session" ? "active" : ""}`}
              onClick={() => setViewMode("session")}
            >
              {TEXT.modeBySession}
            </button>
            <button
              type="button"
              className={`members-tab ${viewMode === "member" ? "active" : ""}`}
              onClick={() => setViewMode("member")}
            >
              {TEXT.modeByMember}
            </button>
          </div>
        </div>
      </div>

      {toastMessage && <div className="inline-toast">{toastMessage}</div>}
      {membersError && <p className="field-error">{membersError}</p>}
      {relationsError && <p className="field-error">{relationsError}</p>}

      {adminUnansweredMembers.length > 0 && (
        <section className="attendance-admin-helper">
          <h2>{TEXT.adminHelperTitle}</h2>
          <ul className="attendance-admin-helper-list">
            {adminUnansweredMembers.slice(0, 8).map((item) => (
              <li key={item.member.id}>
                <button
                  type="button"
                  className="attendance-inline-link"
                  onClick={() => openMemberModal(item.member)}
                >
                  {item.member.name}
                </button>
                <span>{`${TEXT.statusUnknown}${item.unknownCount}`}</span>
              </li>
            ))}
          </ul>
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
                        <div className="attendance-session-head-main">
                          <span className="attendance-session-date">
                            {formatDateYmd(item.date)}({formatWeekdayJa(item.date)})
                          </span>
                          <span className="attendance-session-time">
                            {formatTimeNoLeadingZero(item.session.startTime)}-{formatTimeNoLeadingZero(item.session.endTime)}
                          </span>
                          <strong className="attendance-session-title">{getSessionTitle(item.session)}</strong>
                          <span className="attendance-session-counts">
                            {`${TEXT.statusYes}${counts.yes} ${TEXT.statusMaybe}${counts.maybe} ${TEXT.statusNo}${counts.no} ${TEXT.statusUnknown}${counts.unknown}`}
                          </span>
                        </div>
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
                          ref={targetSessionKey === sessionKey ? columnTargetRef : null}
                        >
                          <span>{formatDateYmd(item.date).slice(5)}</span>
                          <span>{formatTimeNoLeadingZero(item.session.startTime)}</span>
                          <span>{getSessionTitle(item.session)}</span>
                          <span className="attendance-session-counts compact">
                            {`${TEXT.statusYes}${counts.yes} ${TEXT.statusMaybe}${counts.maybe} ${TEXT.statusNo}${counts.no} ${TEXT.statusUnknown}${counts.unknown}`}
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
                          <span className="attendance-member-counts">
                            {`${TEXT.statusYes}${counts.yes} ${TEXT.statusMaybe}${counts.maybe} ${TEXT.statusNo}${counts.no} ${TEXT.statusUnknown}${counts.unknown}`}
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
        <div className="modal-backdrop" role="dialog" aria-modal="true">
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
            <h2>
              {selectedMemberState.member.name}
              {selectedMemberState.editable ? TEXT.editTitleSuffix : TEXT.readOnlyTitleSuffix}
            </h2>
            <p className="muted">{TEXT.unansweredHelper}</p>
            {saveError && <p className="modal-error">{saveError}</p>}

            <div className="attendance-member-modal-list">
              {modalSessions.map((item) => {
                const sessionKey = makeSessionKey(item);
                const draft = draftBySessionKey[sessionKey] ?? { status: "unknown" as RsvpStatus, comment: "" };
                return (
                  <article key={sessionKey} className="attendance-member-modal-row">
                    <div className="attendance-member-modal-session">
                      <strong>{getSessionTitle(item.session)}</strong>
                      <span>{getSessionMetaLabel(item)}</span>
                    </div>
                    {selectedMemberState.editable ? (
                      <div className="attendance-member-modal-fields">
                        <div className="rsvp-toggle-group">
                          {statusButtonMeta.map((option) => (
                            <button
                              key={option.status}
                              type="button"
                              className={`rsvp-toggle ${option.status} ${draft.status === option.status ? "active" : ""}`}
                              onClick={() => updateDraftStatus(sessionKey, option.status)}
                            >
                              {option.symbol}
                            </button>
                          ))}
                        </div>
                        <label className="attendance-comment-field">
                          <span>{TEXT.commentLabel}</span>
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
                      </div>
                    ) : (
                      <div className="attendance-member-modal-readonly">
                        <span className={`rsvp-mark ${draft.status}`}>
                          {draft.status === "yes"
                            ? `${TEXT.statusYes} ${TEXT.statusYesLabel}`
                            : draft.status === "maybe"
                              ? `${TEXT.statusMaybe} ${TEXT.statusMaybeLabel}`
                              : draft.status === "no"
                                ? `${TEXT.statusNo} ${TEXT.statusNoLabel}`
                                : `${TEXT.statusUnknown} \u672a\u56de\u7b54`}
                        </span>
                        <p>{draft.comment.trim() || TEXT.readOnlyEmptyComment}</p>
                      </div>
                    )}
                  </article>
                );
              })}
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
    </section>
  );
}
