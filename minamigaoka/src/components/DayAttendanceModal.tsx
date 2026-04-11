import { useEffect, useMemo, useState } from "react";
import { saveDayAttendanceTransport, saveSessionRsvps } from "../journal/service";
import { isChildMember, sortMembersForDisplay } from "../members/permissions";
import type { MemberRecord, MemberRelationRecord } from "../members/types";
import type {
  AttendanceTransportMethod,
  AttendanceTransportRecord,
  RsvpStatus,
  SessionDoc,
  Todo,
} from "../types";
import { formatDateYmd, formatTimeNoLeadingZero, formatWeekdayJa } from "../utils/date";
import { canViewTodoByScope, getTodoTakeoverLabel, makeSessionRelatedId, sortTodosOpenFirst } from "../utils/todoUtils";
import { resolveEditableAttendanceMemberIds } from "../attendance/utils";

type AttendanceRow = {
  uid: string;
  displayName: string;
  status: RsvpStatus;
};

type AttendanceMemberModalState = {
  member: MemberRecord;
};

type AttendanceCommentModalState = {
  memberName: string;
  comment: string;
};

type DayAttendanceModalProps = {
  date: string;
  sessions: SessionDoc[];
  dayTransport: Record<string, AttendanceTransportRecord>;
  members: MemberRecord[];
  relations: MemberRelationRecord[];
  linkedMember: MemberRecord | null;
  authRole?: "parent" | "admin" | null;
  currentUid: string;
  todos: Todo[];
  saveTodo: (todo: Todo) => Promise<void>;
  onClose: () => void;
};

const typeLabel: Record<SessionDoc["type"], string> = {
  normal: "通常練習",
  self: "自主練",
  event: "イベント",
};

const statusSymbol: Record<RsvpStatus, string> = {
  yes: "◯",
  maybe: "△",
  no: "×",
  unknown: "ー",
};

const transportSymbol: Record<AttendanceTransportMethod, string> = {
  car: "🚗",
  walk: "🚶",
};

const transportLabel: Record<AttendanceTransportMethod, string> = {
  car: "🚗",
  walk: "🚶",
};

const countAttendanceRows = (rows: AttendanceRow[]) => ({
  yes: rows.filter((item) => item.status === "yes").length,
  maybe: rows.filter((item) => item.status === "maybe").length,
  no: rows.filter((item) => item.status === "no").length,
  unknown: rows.filter((item) => item.status === "unknown").length,
});

const isParticipationStatus = (status: RsvpStatus): boolean => status === "yes" || status === "maybe";

export function DayAttendanceModal({
  date,
  sessions,
  dayTransport,
  members,
  relations,
  linkedMember,
  authRole,
  currentUid,
  todos,
  saveTodo,
  onClose,
}: DayAttendanceModalProps) {
  const [selectedAttendanceMember, setSelectedAttendanceMember] = useState<AttendanceMemberModalState | null>(null);
  const [selectedAttendanceComment, setSelectedAttendanceComment] = useState<AttendanceCommentModalState | null>(null);
  const [selectedTodoSession, setSelectedTodoSession] = useState<SessionDoc | null>(null);
  const [attendanceDraftBySessionOrder, setAttendanceDraftBySessionOrder] = useState<Record<number, RsvpStatus>>({});
  const [transportDraft, setTransportDraft] = useState<{
    to: AttendanceTransportMethod;
    from: AttendanceTransportMethod;
    comment: string;
  }>({ to: "car", from: "car", comment: "" });
  const [attendanceSaveError, setAttendanceSaveError] = useState("");
  const [attendanceToast, setAttendanceToast] = useState("");
  const [isSavingAttendance, setIsSavingAttendance] = useState(false);

  const visibleChildMembers = useMemo(
    () =>
      sortMembersForDisplay(
        members.filter((member) => member.memberStatus === "active" && isChildMember(member)),
        "child",
      ),
    [members],
  );

  const editableMemberIds = useMemo(
    () => resolveEditableAttendanceMemberIds(linkedMember, authRole, visibleChildMembers, relations),
    [authRole, linkedMember, relations, visibleChildMembers],
  );

  const memberById = useMemo(
    () =>
      visibleChildMembers.reduce<Record<string, MemberRecord>>((result, member) => {
        result[member.id] = member;
        return result;
      }, {}),
    [visibleChildMembers],
  );

  const attendanceRowsByOrder = useMemo(() => {
    return sessions.reduce<Record<number, AttendanceRow[]>>((result, session) => {
      const rows = visibleChildMembers.map((member) => {
        const matched =
          session.demoRsvps?.find(
            (item) =>
              item.uid === member.authUid ||
              item.uid === member.id ||
              item.uid === member.loginId,
          ) ?? null;

        return {
          uid: member.id,
          displayName: member.name,
          status: matched?.status ?? "unknown",
        };
      });
      result[session.order] = rows;
      return result;
    }, {});
  }, [sessions, visibleChildMembers]);

  const sessionTodosByOrder = useMemo(
    () =>
      sessions.reduce<Record<number, Todo[]>>((result, session) => {
        const relatedId = makeSessionRelatedId(date, session.order);
        result[session.order] = sortTodosOpenFirst(
          todos.filter(
            (todo) =>
              todo.related?.type === "session" &&
              todo.related.id === relatedId &&
              canViewTodoByScope(todo, linkedMember, currentUid, authRole),
          ),
        );
        return result;
      }, {}),
    [authRole, date, linkedMember, sessions, todos],
  );

  const selectedSessionTodos = useMemo(() => {
    if (!selectedTodoSession) return [] as Todo[];
    return sessionTodosByOrder[selectedTodoSession.order] ?? [];
  }, [selectedTodoSession, sessionTodosByOrder]);

  const getMemberStatuses = (member: MemberRecord, draft?: Record<number, RsvpStatus>): RsvpStatus[] =>
    sessions.map((session) => {
      if (draft) {
        return draft[session.order] ?? "unknown";
      }
      const matched =
        session.demoRsvps?.find(
          (item) =>
            item.uid === member.authUid ||
            item.uid === member.id ||
            item.uid === member.loginId,
        ) ?? null;
      return matched?.status ?? "unknown";
    });

  const canUseTransportForStatuses = (statuses: RsvpStatus[]): boolean =>
    statuses.some(isParticipationStatus);

  const selectedMemberCanUseTransport = useMemo(() => {
    if (!selectedAttendanceMember) return true;
    return canUseTransportForStatuses(getMemberStatuses(selectedAttendanceMember.member, attendanceDraftBySessionOrder));
  }, [attendanceDraftBySessionOrder, selectedAttendanceMember]);

  useEffect(() => {
    if (!attendanceToast) return;
    const timer = window.setTimeout(() => setAttendanceToast(""), 2200);
    return () => window.clearTimeout(timer);
  }, [attendanceToast]);

  const assigneeLabel = (uid: string | null): string => {
    if (!uid) return "未アサイン";
    const matched =
      members.find(
        (member) =>
          member.authUid === uid ||
          member.id === uid ||
          member.loginId === uid,
      ) ?? null;
    return matched?.displayName || matched?.name || uid;
  };

  const takeoverLabel = (todo: Todo): string | null => {
    return getTodoTakeoverLabel(todo, currentUid);
  };

  const openAttendanceMemberModal = (member: MemberRecord) => {
    if (!editableMemberIds.has(member.id)) return;
    setAttendanceDraftBySessionOrder(
      sessions.reduce<Record<number, RsvpStatus>>((result, session) => {
        const matched =
          session.demoRsvps?.find(
            (item) =>
              item.uid === member.authUid ||
              item.uid === member.id ||
              item.uid === member.loginId,
          ) ?? null;
        result[session.order] = matched?.status ?? "unknown";
        return result;
      }, {}),
    );
    const currentTransport = dayTransport[member.id];
    setTransportDraft({
      to: currentTransport?.to ?? "car",
      from: currentTransport?.from ?? "car",
      comment: currentTransport?.comment ?? "",
    });
    setAttendanceSaveError("");
    setSelectedAttendanceMember({ member });
  };

  const closeAttendanceMemberModal = () => {
    if (isSavingAttendance) return;
    setSelectedAttendanceMember(null);
    setAttendanceSaveError("");
  };

  const saveAttendanceMember = async () => {
    if (!selectedAttendanceMember) return;
    const member = selectedAttendanceMember.member;
    setIsSavingAttendance(true);
    setAttendanceSaveError("");
    try {
      const matchedMember = memberById[member.id];
      if (!matchedMember) {
        throw new Error("対象メンバーが見つかりません。");
      }

      await Promise.all(
        sessions.map(async (session) => {
          if (!session.id) {
            throw new Error("予定IDが見つからないため、出欠を保存できません。");
          }
          const nextStatus = attendanceDraftBySessionOrder[session.order] ?? "unknown";
          const remaining = (session.demoRsvps ?? []).filter(
            (item) =>
              item.uid !== matchedMember.id &&
              item.uid !== matchedMember.authUid &&
              item.uid !== matchedMember.loginId,
          );
          const nextRsvps =
            nextStatus === "unknown"
              ? remaining
              : [
                  ...remaining,
                  {
                    uid: matchedMember.id,
                    displayName: matchedMember.name,
                    status: nextStatus,
                  },
                ];
          await saveSessionRsvps(date, session.id, nextRsvps);
        }),
      );

      if (selectedMemberCanUseTransport) {
        await saveDayAttendanceTransport(date, member.id, transportDraft);
      }
      setAttendanceToast(`${member.name} の出欠を保存しました。`);
      setSelectedAttendanceMember(null);
    } catch (error) {
      setAttendanceSaveError(error instanceof Error ? error.message : "出欠の保存に失敗しました。");
    } finally {
      setIsSavingAttendance(false);
    }
  };

  return (
    <>
      <div className="modal-backdrop" onClick={onClose}>
        <div className="modal-panel today-attendance-day-modal" onClick={(event) => event.stopPropagation()}>
          <button
            type="button"
            className="modal-close"
            onClick={onClose}
            aria-label="閉じる"
            title="閉じる"
          >
            ×
          </button>
          <h3 className="today-attendance-day-title">
            {formatDateYmd(date)}（{formatWeekdayJa(date)}）
          </h3>
          {attendanceToast && <div className="inline-toast">{attendanceToast}</div>}
          <div className="today-attendance-session-summary-list">
            {sessions.map((session) => {
              const counts = countAttendanceRows(attendanceRowsByOrder[session.order] ?? []);
              const relatedTodos = sessionTodosByOrder[session.order] ?? [];
              return (
                <div
                  key={session.id ?? `${session.order}-${session.startTime}`}
                  className={`today-attendance-session-summary ${session.type}`}
                >
                  <span className={`session-type-badge today-attendance-session-summary-badge ${session.type}`}>
                    {typeLabel[session.type]}
                  </span>
                  <div className="today-attendance-session-summary-main">
                    <div className="today-attendance-session-summary-time">
                      {formatTimeNoLeadingZero(session.startTime)} - {formatTimeNoLeadingZero(session.endTime)}
                    </div>
                    <div className="today-attendance-session-summary-counts">
                      <span className="count-yes">◯{counts.yes}</span>
                      <span className="count-maybe">△{counts.maybe}</span>
                      <span className="count-no">×{counts.no}</span>
                      <span className="count-unknown">ー{counts.unknown}</span>
                    </div>
                  </div>
                  {relatedTodos.length > 0 && (
                    <button
                      type="button"
                      className="today-attendance-session-todo-trigger"
                      onClick={() => setSelectedTodoSession(session)}
                      aria-label={`${typeLabel[session.type]} の関連TODOを開く`}
                      title="関連TODO"
                    >
                      ✅
                    </button>
                  )}
                </div>
              );
            })}
          </div>
          <div className="today-attendance-day-table-wrap">
            <table className="today-attendance-day-table">
              <thead>
                <tr>
                  <th className="today-attendance-member-head">メンバー</th>
                  {sessions.map((session) => (
                    <th key={session.id ?? `${session.order}-${session.startTime}`} className="today-attendance-session-head">
                      <div className="today-attendance-session-time">
                        <span>{formatTimeNoLeadingZero(session.startTime)}</span>
                        <span>{formatTimeNoLeadingZero(session.endTime)}</span>
                      </div>
                    </th>
                  ))}
                  <th className="today-attendance-transport-head">行き</th>
                  <th className="today-attendance-transport-head">帰り</th>
                </tr>
              </thead>
              <tbody>
                {visibleChildMembers.map((member) => {
                  const canEdit = editableMemberIds.has(member.id);
                  const memberTransport = dayTransport[member.id];
                  const canShowTransport = canUseTransportForStatuses(getMemberStatuses(member));
                  return (
                    <tr key={member.id}>
                      <th className="today-attendance-member-cell">
                        {canEdit ? (
                          <span className="today-attendance-member-name-wrap">
                            <button
                              type="button"
                              className="today-attendance-member-button"
                              onClick={() => openAttendanceMemberModal(member)}
                            >
                              {member.name}
                            </button>
                            {memberTransport?.comment?.trim() && (
                              <button
                                type="button"
                                className="today-attendance-comment-trigger"
                                onClick={() =>
                                  setSelectedAttendanceComment({
                                    memberName: member.name,
                                    comment: memberTransport.comment?.trim() ?? "",
                                  })
                                }
                                aria-label={`${member.name} のコメントを見る`}
                                title="コメントを見る"
                              >
                                📝
                              </button>
                            )}
                          </span>
                        ) : (
                          <span className="today-attendance-member-name-wrap">
                            <span className="today-attendance-member-label">{member.name}</span>
                            {memberTransport?.comment?.trim() && (
                              <button
                                type="button"
                                className="today-attendance-comment-trigger"
                                onClick={() =>
                                  setSelectedAttendanceComment({
                                    memberName: member.name,
                                    comment: memberTransport.comment?.trim() ?? "",
                                  })
                                }
                                aria-label={`${member.name} のコメントを見る`}
                                title="コメントを見る"
                              >
                                📝
                              </button>
                            )}
                          </span>
                        )}
                      </th>
                      {sessions.map((session) => {
                        const matched =
                          session.demoRsvps?.find(
                            (item) =>
                              item.uid === member.authUid ||
                              item.uid === member.id ||
                              item.uid === member.loginId,
                          ) ?? null;
                        const status = matched?.status ?? "unknown";
                        return (
                          <td key={`${member.id}-${session.id ?? session.order}`} className={`today-attendance-status-cell ${status}`}>
                            {statusSymbol[status]}
                          </td>
                        );
                      })}
                      <td className="today-attendance-transport-cell">
                        {canShowTransport ? transportSymbol[memberTransport?.to ?? "car"] : "-"}
                      </td>
                      <td className="today-attendance-transport-cell">
                        {canShowTransport ? transportSymbol[memberTransport?.from ?? "car"] : "-"}
                      </td>
                    </tr>
                  );
                })}
                {visibleChildMembers.length === 0 && (
                  <tr>
                    <td className="today-attendance-empty-row" colSpan={sessions.length + 3}>
                      対象の部員はまだいません。
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {selectedTodoSession && (
        <div className="modal-backdrop" onClick={() => setSelectedTodoSession(null)}>
          <div className="modal-panel today-attendance-todo-modal" onClick={(event) => event.stopPropagation()}>
            <button
              type="button"
              className="modal-close"
              onClick={() => setSelectedTodoSession(null)}
              aria-label="閉じる"
              title="閉じる"
            >
              ×
            </button>
            <p className="modal-context">
              {formatDateYmd(date)}（{formatWeekdayJa(date)}）
            </p>
            <h3>
              {typeLabel[selectedTodoSession.type]}{" "}
              {formatTimeNoLeadingZero(selectedTodoSession.startTime)} - {formatTimeNoLeadingZero(selectedTodoSession.endTime)}
            </h3>
            <div className="related-todos-list">
              {selectedSessionTodos.map((todo) => {
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
                      {todo.memo?.trim() && <p className="todo-description">{todo.memo}</p>}
                      <p className="todo-meta">
                        <span>{todo.kind === "shared" ? `担当: ${assigneeLabel(todo.assigneeUid)}` : "種別: 個人TODO"}</span>
                        <span>期限: {todo.dueDate ?? "-"}</span>
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
              {selectedSessionTodos.length === 0 && <p className="muted">関連TODOはありません。</p>}
            </div>
          </div>
        </div>
      )}

      {selectedAttendanceMember && (
        <div className="modal-backdrop">
          <div className="modal-panel today-attendance-edit-modal" onClick={(event) => event.stopPropagation()}>
            <button
              type="button"
              className="modal-close"
              onClick={closeAttendanceMemberModal}
              aria-label="閉じる"
              title="閉じる"
            >
              ×
            </button>
            <p className="modal-context">
              {formatDateYmd(date)}（{formatWeekdayJa(date)}）
            </p>
            <h3>{selectedAttendanceMember.member.name}</h3>
            <div className="today-attendance-edit-list">
              {sessions.map((session) => {
                const currentStatus = attendanceDraftBySessionOrder[session.order] ?? "unknown";
                return (
                  <section key={session.id ?? `${session.order}-${session.startTime}`} className="today-attendance-edit-section">
                    <div className="today-attendance-edit-session-row">
                      <div className="today-attendance-edit-header">
                        <strong>{typeLabel[session.type]}</strong>
                        <span>
                          {formatTimeNoLeadingZero(session.startTime)} - {formatTimeNoLeadingZero(session.endTime)}
                        </span>
                      </div>
                      <div className="rsvp-toggle-group today-rsvp-toggle-group">
                        {(["yes", "maybe", "no", "unknown"] as RsvpStatus[]).map((status) => (
                          <button
                            key={status}
                            type="button"
                            className={`rsvp-toggle today-rsvp-toggle ${status} ${currentStatus === status ? "active" : ""}`}
                            onClick={() =>
                              setAttendanceDraftBySessionOrder((current) => ({
                                ...current,
                                [session.order]: status,
                              }))
                            }
                          >
                            <span>{statusSymbol[status]}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  </section>
                );
              })}
              <section className="today-attendance-edit-section today-attendance-transport-section">
                <div className="today-attendance-edit-header">
                  <strong>移動手段</strong>
                </div>
                <div className="today-attendance-transport-editor">
                  <div className="today-attendance-transport-group">
                    <span className="today-attendance-transport-label">行き</span>
                    <div className="today-attendance-transport-options">
                      {(["car", "walk"] as AttendanceTransportMethod[]).map((mode) => (
                        <button
                          key={`to-${mode}`}
                          type="button"
                          className={`today-transport-toggle ${transportDraft.to === mode ? "active" : ""}`}
                          onClick={() => setTransportDraft((current) => ({ ...current, to: mode }))}
                          disabled={!selectedMemberCanUseTransport}
                        >
                          <span>{transportLabel[mode]}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="today-attendance-transport-group">
                    <span className="today-attendance-transport-label">帰り</span>
                    <div className="today-attendance-transport-options">
                      {(["car", "walk"] as AttendanceTransportMethod[]).map((mode) => (
                        <button
                          key={`from-${mode}`}
                          type="button"
                          className={`today-transport-toggle ${transportDraft.from === mode ? "active" : ""}`}
                          onClick={() => setTransportDraft((current) => ({ ...current, from: mode }))}
                          disabled={!selectedMemberCanUseTransport}
                        >
                          <span>{transportLabel[mode]}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </section>
              <section className="today-attendance-edit-section">
                <div className="today-attendance-edit-header">
                  <strong>コメント</strong>
                  <span>その日全体について</span>
                </div>
                <textarea
                  className="today-attendance-comment-input"
                  rows={3}
                  value={transportDraft.comment}
                  onChange={(event) =>
                    setTransportDraft((current) => ({
                      ...current,
                      comment: event.target.value,
                    }))
                  }
                  placeholder="11時から参加します。 / Aさんに送迎してもらいます。"
                />
              </section>
            </div>
            {attendanceSaveError && <p className="field-error">{attendanceSaveError}</p>}
            <div className="modal-actions">
              <button type="button" className="button button-secondary" onClick={closeAttendanceMemberModal}>
                キャンセル
              </button>
              <button type="button" className="button" onClick={() => void saveAttendanceMember()} disabled={isSavingAttendance}>
                {isSavingAttendance ? "保存中..." : "保存"}
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedAttendanceComment && (
        <div className="modal-backdrop" onClick={() => setSelectedAttendanceComment(null)}>
          <div className="modal-panel today-attendance-comment-modal" onClick={(event) => event.stopPropagation()}>
            <button
              type="button"
              className="modal-close"
              onClick={() => setSelectedAttendanceComment(null)}
              aria-label="閉じる"
              title="閉じる"
            >
              ×
            </button>
            <p className="modal-context">
              {formatDateYmd(date)}（{formatWeekdayJa(date)}）
            </p>
            <h3>{selectedAttendanceComment.memberName} のコメント</h3>
            <div className="today-attendance-comment-body">{selectedAttendanceComment.comment}</div>
            <div className="modal-actions">
              <button type="button" className="button" onClick={() => setSelectedAttendanceComment(null)}>
                閉じる
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
