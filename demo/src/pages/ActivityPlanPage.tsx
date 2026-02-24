import { useEffect, useMemo, useState } from "react";
import { mockData } from "../data/mockData";
import { formatDateYmd, formatWeekdayJa, shiftDateKey, todayDateKey } from "../utils/date";
import { activityPlanStatusStorageKey, getActivityPlanTargetMonthKey } from "../utils/activityPlan";

type MonthlyStatus =
  | "NOT_STARTED"
  | "SESSIONS_SET"
  | "SURVEY_OPEN"
  | "SURVEY_CLOSED"
  | "AI_DRAFTED"
  | "SHIFT_CONFIRMED"
  | "NOTIFIED";

type DemoSession = {
  id: string;
  date: string;
  start: string;
  end: string;
  kind: "regular" | "self";
  dutyRequirement: "duty" | "watch";
  dutyAssignee?: string;
};

type AvailabilityMark = "◯" | "△" | "×";
type SessionKind = DemoSession["kind"];
type SessionCreateDraft = {
  targetDate: string;
  slot: "am" | "pm" | "night";
  kind: SessionKind;
};
type NoteEditDraft = {
  field: "teacher" | "remark";
  targetDate: string;
  value: string;
};

const STATUS_FLOW: MonthlyStatus[] = [
  "NOT_STARTED",
  "SESSIONS_SET",
  "SURVEY_OPEN",
  "SURVEY_CLOSED",
  "AI_DRAFTED",
  "SHIFT_CONFIRMED",
  "NOTIFIED",
];

const statusLabelJa: Record<MonthlyStatus, string> = {
  NOT_STARTED: "未作成",
  SESSIONS_SET: "練習日決定",
  SURVEY_OPEN: "アンケート中",
  SURVEY_CLOSED: "アンケート完了",
  AI_DRAFTED: "AI仮作成済",
  SHIFT_CONFIRMED: "シフト確定",
  NOTIFIED: "通知済",
};

const sessionKindLabel: Record<SessionKind, string> = {
  regular: "通常練習",
  self: "自主練",
};

const buildMonthDayKeys = (monthKey: string): string[] => {
  const [year, month] = monthKey.split("-").map(Number);
  const daysInMonth = new Date(year, month, 0).getDate();
  return Array.from({ length: daysInMonth }, (_, index) => {
    const day = index + 1;
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  });
};

const createPresetSessions = (monthKey: string): DemoSession[] => {
  const [year, month] = monthKey.split("-").map(Number);
  const daysInMonth = new Date(year, month, 0).getDate();
  const sessions: DemoSession[] = [];
  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const weekday = new Date(year, month - 1, day).getDay();
    if (weekday === 2 || weekday === 4) {
      sessions.push({
        id: `${date}-1700-regular`,
        date,
        start: "17:00",
        end: "18:30",
        kind: "regular",
        dutyRequirement: "duty",
      });
    }
    if (weekday === 6) {
      sessions.push({
        id: `${date}-0900-self`,
        date,
        start: "09:00",
        end: "12:00",
        kind: "self",
        dutyRequirement: "watch",
      });
      sessions.push({
        id: `${date}-1200-regular`,
        date,
        start: "12:00",
        end: "15:00",
        kind: "regular",
        dutyRequirement: "duty",
      });
    }
    if (weekday === 0) {
      sessions.push({
        id: `${date}-0900-regular`,
        date,
        start: "09:00",
        end: "12:00",
        kind: "regular",
        dutyRequirement: "duty",
      });
      sessions.push({
        id: `${date}-1200-self`,
        date,
        start: "12:00",
        end: "15:00",
        kind: "self",
        dutyRequirement: "watch",
      });
    }
  }
  return sessions;
};

const shortenHouseholdLabel = (value: string): string => {
  const trimmed = value.trim();
  return trimmed.endsWith("家") ? trimmed.slice(0, -1) : trimmed;
};

const getAvailabilityForCandidate = (
  sessionKey: string,
  householdId: string,
): AvailabilityMark => {
  const source = `${sessionKey}:${householdId}`;
  let sum = 0;
  for (let index = 0; index < source.length; index += 1) {
    sum += source.charCodeAt(index);
  }
  const mod = sum % 3;
  if (mod === 0) return "◯";
  if (mod === 1) return "△";
  return "×";
};

export function ActivityPlanPage() {
  const today = todayDateKey();
  const monthKey = getActivityPlanTargetMonthKey(today);
  const statusStorageKey = activityPlanStatusStorageKey(monthKey);
  const [monthlyStatus, setMonthlyStatus] = useState<MonthlyStatus>(() => {
    const saved = window.localStorage.getItem(statusStorageKey) as MonthlyStatus | null;
    return saved && STATUS_FLOW.includes(saved) ? saved : "NOT_STARTED";
  });
  const [demoSessions, setDemoSessions] = useState<DemoSession[]>([]);
  const [teacherNotesByDate, setTeacherNotesByDate] = useState<Record<string, string>>({});
  const [remarksByDate, setRemarksByDate] = useState<Record<string, string>>({});
  const [isSurveyModalOpen, setIsSurveyModalOpen] = useState(false);
  const [isAiDraftModalOpen, setIsAiDraftModalOpen] = useState(false);
  const [isManualDraftModalOpen, setIsManualDraftModalOpen] = useState(false);
  const [isDutyEditorModalOpen, setIsDutyEditorModalOpen] = useState(false);
  const [isShiftConfirmModalOpen, setIsShiftConfirmModalOpen] = useState(false);
  const [isNotifyConfirmModalOpen, setIsNotifyConfirmModalOpen] = useState(false);
  const [dutyEditorSessionId, setDutyEditorSessionId] = useState<string | null>(null);
  const [isDutyCountModalOpen, setIsDutyCountModalOpen] = useState(false);
  const [surveyDeadlineDate, setSurveyDeadlineDate] = useState(shiftDateKey(today, 3));
  const [answeredHouseholdIds, setAnsweredHouseholdIds] = useState<string[]>([]);
  const [sessionCreateDraft, setSessionCreateDraft] = useState<SessionCreateDraft | null>(null);
  const [noteEditDraft, setNoteEditDraft] = useState<NoteEditDraft | null>(null);

  const activityPlanDayKeys = useMemo(() => buildMonthDayKeys(monthKey), [monthKey]);
  const householdIds = useMemo(() => Object.keys(mockData.households), []);
  const householdLabels = useMemo(
    () => householdIds.map((householdId) => mockData.households[householdId]?.label ?? householdId),
    [householdIds],
  );
  const householdShortLabels = useMemo(
    () => householdLabels.map((label) => shortenHouseholdLabel(label)),
    [householdLabels],
  );
  const dutySurveySessions = useMemo(
    () =>
      demoSessions
        .filter((session) => session.dutyRequirement === "duty")
        .sort((a, b) => `${a.date}-${a.start}`.localeCompare(`${b.date}-${b.start}`)),
    [demoSessions],
  );
  const surveyAnsweredCount = answeredHouseholdIds.length;
  const surveyTotalCount = householdIds.length;
  const dutySessionCounts = useMemo(() => {
    const map = new Map<string, number>();
    householdShortLabels.forEach((label) => map.set(label, 0));
    demoSessions.forEach((session) => {
      if (session.dutyRequirement !== "duty") return;
      const assignee = session.dutyAssignee?.trim();
      if (!assignee) return;
      const key = shortenHouseholdLabel(assignee);
      map.set(key, (map.get(key) ?? 0) + 1);
    });
    return Array.from(map.entries());
  }, [demoSessions, householdShortLabels]);
  const activityPlanRows = useMemo(() => {
    const sessionsInMonth = demoSessions.filter((session) => session.date.startsWith(`${monthKey}-`));
    const grouped = sessionsInMonth.reduce<Record<string, { am: DemoSession[]; pm: DemoSession[]; night: DemoSession[] }>>(
      (acc, session) => {
        const current = acc[session.date] ?? { am: [], pm: [], night: [] };
        if (session.start === "09:00" && session.end === "12:00") {
          current.am.push(session);
        } else if (session.start === "12:00" && session.end === "15:00") {
          current.pm.push(session);
        } else if (session.start === "17:00" && session.end === "18:30") {
          current.night.push(session);
        }
        acc[session.date] = current;
        return acc;
      },
      {},
    );
    return activityPlanDayKeys.map((dayKey) => ({
      date: dayKey,
      am: grouped[dayKey]?.am ?? [],
      pm: grouped[dayKey]?.pm ?? [],
      night: grouped[dayKey]?.night ?? [],
    }));
  }, [activityPlanDayKeys, demoSessions, monthKey]);

  const currentIndex = STATUS_FLOW.indexOf(monthlyStatus);
  const aiDraftedIndex = STATUS_FLOW.indexOf("AI_DRAFTED");
  const shiftConfirmedIndex = STATUS_FLOW.indexOf("SHIFT_CONFIRMED");
  const isDutyVisible = currentIndex >= aiDraftedIndex;
  const isShiftLocked = currentIndex >= shiftConfirmedIndex;
  const isNotified = monthlyStatus === "NOTIFIED";
  const isDutyEditable = monthlyStatus === "AI_DRAFTED" && !isShiftLocked;
  const isSessionCreatePhase = monthlyStatus === "NOT_STARTED";
  const isDutyCountVisible = currentIndex >= aiDraftedIndex;
  const isPostConfirm = currentIndex >= shiftConfirmedIndex;

  useEffect(() => {
    window.localStorage.setItem(statusStorageKey, monthlyStatus);
  }, [monthlyStatus, statusStorageKey]);

  const removeSession = (sessionId: string) => {
    setDemoSessions((prev) => prev.filter((session) => session.id !== sessionId));
  };

  const addSessionToSlot = (targetDate: string, slot: "am" | "pm" | "night") => {
    if (!isSessionCreatePhase) return;
    const slotConfig = slot === "am"
      ? { start: "09:00", end: "12:00" }
      : slot === "pm"
        ? { start: "12:00", end: "15:00" }
        : { start: "17:00", end: "18:30" };
    const hasExisting = demoSessions.some(
      (session) =>
        session.date === targetDate &&
        session.start === slotConfig.start &&
        session.end === slotConfig.end,
    );
    if (hasExisting) return;
    setSessionCreateDraft({ targetDate, slot, kind: "regular" });
  };

  const confirmSessionCreate = () => {
    if (!sessionCreateDraft) return;
    const slotConfig = sessionCreateDraft.slot === "am"
      ? { start: "09:00", end: "12:00" }
      : sessionCreateDraft.slot === "pm"
        ? { start: "12:00", end: "15:00" }
        : { start: "17:00", end: "18:30" };
    setDemoSessions((prev) => [
      ...prev,
      {
        id: `${sessionCreateDraft.targetDate}-${slotConfig.start.replace(":", "")}-${Date.now()}`,
        date: sessionCreateDraft.targetDate,
        start: slotConfig.start,
        end: slotConfig.end,
        kind: sessionCreateDraft.kind,
        dutyRequirement: sessionCreateDraft.kind === "regular" ? "duty" : "watch",
        dutyAssignee: undefined,
      },
    ]);
    setSessionCreateDraft(null);
  };

  const editTeacherNote = (targetDate: string) => {
    if (isShiftLocked) return;
    const current = teacherNotesByDate[targetDate] ?? "";
    setNoteEditDraft({ field: "teacher", targetDate, value: current });
  };

  const editRemark = (targetDate: string) => {
    if (isShiftLocked) return;
    const current = remarksByDate[targetDate] ?? "";
    setNoteEditDraft({ field: "remark", targetDate, value: current });
  };

  const confirmNoteEdit = () => {
    if (!noteEditDraft) return;
    const nextValue = noteEditDraft.value.trim();
    if (noteEditDraft.field === "teacher") {
      setTeacherNotesByDate((prev) => ({ ...prev, [noteEditDraft.targetDate]: nextValue }));
    } else {
      setRemarksByDate((prev) => ({ ...prev, [noteEditDraft.targetDate]: nextValue }));
    }
    setNoteEditDraft(null);
  };

  const editDutyAssignee = (sessionId: string) => {
    if (isShiftLocked) return;
    if (!isDutyEditable) return;
    const target = demoSessions.find((session) => session.id === sessionId);
    if (!target || target.dutyRequirement !== "duty") return;
    setDutyEditorSessionId(sessionId);
    setIsDutyEditorModalOpen(true);
  };

  const assignDutyAssigneeAndClose = (householdId: string) => {
    if (!dutyEditorSessionId) return;
    const selectedIndex = householdIds.findIndex((id) => id === householdId);
    const nextName = selectedIndex >= 0 ? householdLabels[selectedIndex] : "";
    if (!nextName) return;
    setDemoSessions((prev) =>
      prev.map((session) =>
        session.id === dutyEditorSessionId && session.dutyRequirement === "duty"
          ? { ...session, dutyAssignee: nextName }
          : session,
      ),
    );
    setIsDutyEditorModalOpen(false);
  };

  const closeDutyEditorModal = () => {
    setIsDutyEditorModalOpen(false);
    setDutyEditorSessionId(null);
  };

  const renderCellSessions = (sessions: DemoSession[]) => {
    if (sessions.length === 0) return <span>-</span>;
    return (
      <ul className="activity-cell-list">
        {sessions.map((session) => (
          <li key={session.id} className="activity-cell-item">
            <div className="activity-session-lines">
              <div className="activity-session-main">
                <span>{session.kind === "regular" ? "通常練習" : "自主練"}</span>
                {isSessionCreatePhase && (
                  <button
                    type="button"
                    className="activity-cell-remove"
                    aria-label="セッションを削除"
                    onClick={() => removeSession(session.id)}
                  >
                    ×
                  </button>
                )}
              </div>
              {session.dutyRequirement === "duty" && isDutyVisible && (
                <button
                  type="button"
                  className={`activity-duty-inline ${isDutyEditable ? "editable" : "readonly"}`}
                  disabled={!isDutyEditable}
                  onClick={() => editDutyAssignee(session.id)}
                >
                  当番: {session.dutyAssignee?.trim() ? shortenHouseholdLabel(session.dutyAssignee) : "—"}
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
    );
  };

  const renderSlotCell = (targetDate: string, slot: "am" | "pm" | "night", sessions: DemoSession[]) => {
    if (sessions.length > 0) return renderCellSessions(sessions);
    if (!isSessionCreatePhase) return <span>-</span>;
    return (
      <button
        type="button"
        className="activity-slot-add"
        aria-label={`${targetDate}の${slot}枠にセッション追加`}
        onClick={() => addSessionToSlot(targetDate, slot)}
      >
        ＋
      </button>
    );
  };

  const shortRemark = (value: string) =>
    value.length > 16 ? `${value.slice(0, 16)}…` : value;

  const runAiDraft = () => {
    if (householdLabels.length === 0) {
      setMonthlyStatus("AI_DRAFTED");
      setIsAiDraftModalOpen(false);
      return;
    }
    let cursor = 0;
    setDemoSessions((prev) =>
      prev.map((session) => {
        if (session.dutyRequirement !== "duty") return session;
        const dutyAssignee = householdLabels[cursor % householdLabels.length];
        cursor += 1;
        return { ...session, dutyAssignee };
      }),
    );
    setMonthlyStatus("AI_DRAFTED");
    setIsAiDraftModalOpen(false);
  };

  const exportPlanPdf = () => {
    window.print();
  };

  const dutyEditorSession = dutyEditorSessionId
    ? demoSessions.find((session) => session.id === dutyEditorSessionId) ?? null
    : null;
  const dutyEditorCandidates = useMemo(() => {
    if (!dutyEditorSession) return [];
    const availabilityOrder: Record<AvailabilityMark, number> = {
      "◯": 0,
      "△": 1,
      "×": 2,
    };
    return householdIds.map((householdId, index) => {
      const fullLabel = householdLabels[index] ?? householdId;
      const availability = getAvailabilityForCandidate(dutyEditorSession.id, householdId);
      return {
        householdId,
        fullLabel,
        shortLabel: shortenHouseholdLabel(fullLabel),
        availability,
      };
    }).sort((a, b) => {
      const orderDiff = availabilityOrder[a.availability] - availabilityOrder[b.availability];
      if (orderDiff !== 0) return orderDiff;
      return a.shortLabel.localeCompare(b.shortLabel, "ja");
    });
  }, [dutyEditorSession, householdIds, householdLabels]);

  return (
    <section className="card">
      <h1>活動予定</h1>
      <p>対象月: {monthKey}</p>
      <p>現在の状態: {statusLabelJa[monthlyStatus]}</p>
      <div className="activity-steps" aria-label="活動予定の進行ステップ">
        {STATUS_FLOW.map((status, index) => {
          const stepState = index < currentIndex ? "done" : index === currentIndex ? "current" : "todo";
          return (
            <span
              key={status}
              className={`activity-step ${stepState}`}
            >
              {statusLabelJa[status]}
            </span>
          );
        })}
      </div>
      {isSessionCreatePhase && (
        <div>
          <button
            type="button"
            className="button"
            onClick={() => {
              const presetSessions = createPresetSessions(monthKey);
              setDemoSessions(presetSessions);
              const weekendDates = new Set(
                presetSessions
                  .map((session) => session.date)
                  .filter((dateKey) => {
                    const [year, month, day] = dateKey.split("-").map(Number);
                    const weekday = new Date(year, month - 1, day).getDay();
                    return weekday === 0 || weekday === 6;
                  }),
              );
              setTeacherNotesByDate((prev) => {
                const next = { ...prev };
                weekendDates.forEach((dateKey) => {
                  if (next[dateKey]?.trim()) return;
                  next[dateKey] = "9:00-15:00";
                });
                return next;
              });
            }}
          >
            基本プリセットを入れる
          </button>
          <button
            type="button"
            className="button save-button"
            onClick={() => setMonthlyStatus("SESSIONS_SET")}
          >
            練習日を決定する
          </button>
        </div>
      )}
      {monthlyStatus === "SESSIONS_SET" && (
        <div className="activity-survey-panel">
          <button
            type="button"
            className="button"
            onClick={() => {
              setSurveyDeadlineDate(shiftDateKey(todayDateKey(), 3));
              setIsSurveyModalOpen(true);
            }}
          >
            当番可否アンケートを作成する
          </button>
        </div>
      )}
      {monthlyStatus === "SURVEY_OPEN" && (
        <div className="activity-survey-panel">
          <p className="activity-survey-status">状態: 当番可否アンケート受付中</p>
          <p className="activity-survey-status">
            回答数
            <span className="activity-survey-badge">{surveyAnsweredCount} / {surveyTotalCount} household</span>
          </p>
          <button
            type="button"
            className="button save-button"
            onClick={() => {
              setAnsweredHouseholdIds(householdIds);
              setMonthlyStatus("SURVEY_CLOSED");
            }}
          >
            回答が集まった（DEMO）
          </button>
        </div>
      )}
      {monthlyStatus === "SURVEY_CLOSED" && (
        <div className="activity-survey-panel">
          <p className="activity-survey-status">状態: 当番可否アンケート締切</p>
          <p className="activity-survey-status">
            回答数
            <span className="activity-survey-badge">{surveyTotalCount} / {surveyTotalCount} household</span>
          </p>
          <button
            type="button"
            className="button save-button"
            onClick={() => setIsAiDraftModalOpen(true)}
          >
            AIで当番を仮割当する
          </button>
          <button
            type="button"
            className="button"
            onClick={() => setIsManualDraftModalOpen(true)}
          >
            AIを使わずに当番編集へ進む
          </button>
        </div>
      )}
      {isDutyCountVisible && (
        <div className="activity-survey-panel">
          <button
            type="button"
            className="button"
            onClick={() => setIsDutyCountModalOpen(true)}
          >
            当番回数を見る
          </button>
        </div>
      )}
      {monthlyStatus === "AI_DRAFTED" && (
        <div className="activity-survey-panel">
          <button
            type="button"
            className="button save-button"
            onClick={() => setIsShiftConfirmModalOpen(true)}
          >
            シフトを確定する
          </button>
        </div>
      )}
      {monthlyStatus === "SHIFT_CONFIRMED" && (
        <div className="activity-survey-panel">
          <span className="activity-survey-badge">✅ シフト確定済</span>
          <button
            type="button"
            className="button"
            onClick={exportPlanPdf}
          >
            PDF出力
          </button>
          <button
            type="button"
            className="button save-button"
            onClick={() => setIsNotifyConfirmModalOpen(true)}
          >
            全メンバーに通知する
          </button>
        </div>
      )}
      {isNotified && (
        <div className="activity-survey-panel">
          <span className="activity-survey-badge">✅ 通知済</span>
          <button
            type="button"
            className="button"
            onClick={exportPlanPdf}
          >
            PDF出力
          </button>
          <span className="activity-survey-status">出欠予定の入力が可能です（UI準備中）</span>
        </div>
      )}
      <p className="muted">注: 祝日は休み運用（DEMOでは祝日判定は未実装）。</p>
      <div className="activity-plan-table-wrap">
        <table className="activity-plan-table">
          <thead>
            <tr>
              <th>日付</th>
              <th>AM(09:00-12:00)</th>
              <th>PM(12:00-15:00)</th>
              <th>夜(17:00-18:30)</th>
              <th>先生予定</th>
              <th>備考</th>
            </tr>
          </thead>
          <tbody>
            {activityPlanRows.map((row) => {
              const teacherNote = teacherNotesByDate[row.date] ?? "";
              const remark = remarksByDate[row.date] ?? "";
              return (
                <tr key={row.date}>
                  <td>{row.date.slice(5)}({formatWeekdayJa(row.date)})</td>
                  <td>{renderSlotCell(row.date, "am", row.am)}</td>
                  <td>{renderSlotCell(row.date, "pm", row.pm)}</td>
                  <td>{renderSlotCell(row.date, "night", row.night)}</td>
                  <td>
                    <div className="activity-note-cell">
                      <span title={teacherNote || undefined}>{teacherNote || "—"}</span>
                      <button
                        type="button"
                        className="activity-note-edit"
                        disabled={isPostConfirm}
                        onClick={() => editTeacherNote(row.date)}
                      >
                        {teacherNote ? "編集" : "＋"}
                      </button>
                    </div>
                  </td>
                  <td>
                    <div className="activity-note-cell">
                      <span title={remark || undefined}>{remark ? shortRemark(remark) : "—"}</span>
                      <button
                        type="button"
                        className="activity-note-edit"
                        disabled={isPostConfirm}
                        onClick={() => editRemark(row.date)}
                      >
                        {remark ? "編集" : "＋"}
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {sessionCreateDraft && (
        <div className="modal-backdrop" onClick={() => setSessionCreateDraft(null)}>
          <div className="modal-panel activity-modal-panel" onClick={(event) => event.stopPropagation()}>
            <button type="button" className="modal-close" aria-label="閉じる" onClick={() => setSessionCreateDraft(null)}>
              ×
            </button>
            <p className="modal-context">セッション追加</p>
            <p className="modal-summary">
              対象: {formatDateYmd(sessionCreateDraft.targetDate)}（{formatWeekdayJa(sessionCreateDraft.targetDate)}）
            </p>
            <label className="field">
              <span>種別</span>
              <select
                value={sessionCreateDraft.kind}
                onChange={(event) =>
                  setSessionCreateDraft((prev) =>
                    prev
                      ? { ...prev, kind: event.target.value as SessionKind }
                      : prev,
                  )
                }
              >
                <option value="regular">{sessionKindLabel.regular}</option>
                <option value="self">{sessionKindLabel.self}</option>
              </select>
            </label>
            <div className="modal-actions">
              <button type="button" className="button button-secondary" onClick={() => setSessionCreateDraft(null)}>
                キャンセル
              </button>
              <button type="button" className="button save-button" onClick={confirmSessionCreate}>
                追加する
              </button>
            </div>
          </div>
        </div>
      )}
      {noteEditDraft && (
        <div className="modal-backdrop" onClick={() => setNoteEditDraft(null)}>
          <div className="modal-panel activity-modal-panel" onClick={(event) => event.stopPropagation()}>
            <button type="button" className="modal-close" aria-label="閉じる" onClick={() => setNoteEditDraft(null)}>
              ×
            </button>
            <p className="modal-context">{noteEditDraft.field === "teacher" ? "先生予定を編集" : "備考を編集"}</p>
            <label className="field">
              <span>{noteEditDraft.field === "teacher" ? "先生予定" : "備考"}</span>
              <input
                value={noteEditDraft.value}
                onChange={(event) =>
                  setNoteEditDraft((prev) =>
                    prev
                      ? { ...prev, value: event.target.value }
                      : prev,
                  )
                }
                placeholder={noteEditDraft.field === "teacher" ? "先生予定を入力" : "備考を入力"}
              />
            </label>
            <div className="modal-actions">
              <button type="button" className="button button-secondary" onClick={() => setNoteEditDraft(null)}>
                キャンセル
              </button>
              <button type="button" className="button save-button" onClick={confirmNoteEdit}>
                保存する
              </button>
            </div>
          </div>
        </div>
      )}
      {isSurveyModalOpen && (
        <div className="modal-backdrop" onClick={() => setIsSurveyModalOpen(false)}>
          <div className="modal-panel activity-modal-panel" onClick={(event) => event.stopPropagation()}>
            <button type="button" className="modal-close" aria-label="閉じる" onClick={() => setIsSurveyModalOpen(false)}>
              ×
            </button>
            <p className="modal-context">当番可否アンケート作成</p>
            <p className="modal-summary">この内容で当番可否アンケートを送信します</p>
            <p className="modal-summary">対象セッション（当番必要のみ）</p>
            {dutySurveySessions.length === 0 ? (
              <p className="activity-survey-note">対象セッションがありません。</p>
            ) : (
              <ul className="activity-survey-list">
                {dutySurveySessions.map((session) => (
                  <li key={session.id}>
                    {formatDateYmd(session.date)} {session.start}-{session.end}
                  </li>
                ))}
              </ul>
            )}
            <label className="field">
              <span>回答期限</span>
              <input
                type="date"
                value={surveyDeadlineDate}
                onChange={(event) => setSurveyDeadlineDate(event.target.value)}
              />
            </label>
            <div className="modal-actions">
              <button type="button" className="button" onClick={() => setIsSurveyModalOpen(false)}>
                キャンセル
              </button>
              <button
                type="button"
                className="button save-button"
                onClick={() => {
                  setAnsweredHouseholdIds([]);
                  setIsSurveyModalOpen(false);
                  setMonthlyStatus("SURVEY_OPEN");
                }}
              >
                送信する
              </button>
            </div>
          </div>
        </div>
      )}
      {isAiDraftModalOpen && (
        <div className="modal-backdrop" onClick={() => setIsAiDraftModalOpen(false)}>
          <div className="modal-panel activity-modal-panel" onClick={(event) => event.stopPropagation()}>
            <button type="button" className="modal-close" aria-label="閉じる" onClick={() => setIsAiDraftModalOpen(false)}>
              ×
            </button>
            <p className="modal-context">AIで当番を仮割当</p>
            <p className="modal-summary">当番可否アンケート結果をもとに当番を仮割当します。</p>
            <p className="modal-summary">AI_DRAFTED の期間のみ手修正できます。</p>
            <div className="modal-actions">
              <button type="button" className="button" onClick={() => setIsAiDraftModalOpen(false)}>
                キャンセル
              </button>
              <button type="button" className="button save-button" onClick={runAiDraft}>
                実行（仮割当を実行）
              </button>
            </div>
          </div>
        </div>
      )}
      {isManualDraftModalOpen && (
        <div className="modal-backdrop" onClick={() => setIsManualDraftModalOpen(false)}>
          <div className="modal-panel activity-modal-panel" onClick={(event) => event.stopPropagation()}>
            <button type="button" className="modal-close" aria-label="閉じる" onClick={() => setIsManualDraftModalOpen(false)}>
              ×
            </button>
            <p className="modal-context">AIを使わずに進む</p>
            <p className="modal-summary">AIを使わずに AI_DRAFTED（当番編集）へ進みます。</p>
            <p className="modal-summary">当番は未割当のままなので、手作業で割当してください。</p>
            <div className="modal-actions">
              <button type="button" className="button" onClick={() => setIsManualDraftModalOpen(false)}>
                キャンセル
              </button>
              <button
                type="button"
                className="button save-button"
                onClick={() => {
                  setIsManualDraftModalOpen(false);
                  setMonthlyStatus("AI_DRAFTED");
                }}
              >
                実行
              </button>
            </div>
          </div>
        </div>
      )}
      {isShiftConfirmModalOpen && (
        <div className="modal-backdrop" onClick={() => setIsShiftConfirmModalOpen(false)}>
          <div className="modal-panel activity-modal-panel" onClick={(event) => event.stopPropagation()}>
            <button type="button" className="modal-close" aria-label="閉じる" onClick={() => setIsShiftConfirmModalOpen(false)}>
              ×
            </button>
            <p className="modal-context">シフト確定</p>
            <p className="modal-summary">このシフトを確定します。確定後は編集できません。よろしいですか？</p>
            <div className="modal-actions">
              <button type="button" className="button" onClick={() => setIsShiftConfirmModalOpen(false)}>
                キャンセル
              </button>
              <button
                type="button"
                className="button save-button"
                onClick={() => {
                  setIsShiftConfirmModalOpen(false);
                  setMonthlyStatus("SHIFT_CONFIRMED");
                }}
              >
                確定する
              </button>
            </div>
          </div>
        </div>
      )}
      {isNotifyConfirmModalOpen && (
        <div className="modal-backdrop" onClick={() => setIsNotifyConfirmModalOpen(false)}>
          <div className="modal-panel activity-modal-panel" onClick={(event) => event.stopPropagation()}>
            <button type="button" className="modal-close" aria-label="閉じる" onClick={() => setIsNotifyConfirmModalOpen(false)}>
              ×
            </button>
            <p className="modal-context">通知確認</p>
            <p className="modal-summary">活動予定と当番シフトを通知します。通知後、メンバーは出欠予定の入力が可能になります。よろしいですか？</p>
            <div className="modal-actions">
              <button type="button" className="button" onClick={() => setIsNotifyConfirmModalOpen(false)}>
                キャンセル
              </button>
              <button
                type="button"
                className="button save-button"
                onClick={() => {
                  setIsNotifyConfirmModalOpen(false);
                  setMonthlyStatus("NOTIFIED");
                }}
              >
                通知する
              </button>
            </div>
          </div>
        </div>
      )}
      {isDutyEditorModalOpen && dutyEditorSession && (
        <div className="modal-backdrop" onClick={closeDutyEditorModal}>
          <div className="modal-panel activity-modal-panel" onClick={(event) => event.stopPropagation()}>
            <button type="button" className="modal-close" aria-label="閉じる" onClick={closeDutyEditorModal}>
              ×
            </button>
            <p className="modal-context">当番編集</p>
            <p className="modal-summary">
              対象: {formatDateYmd(dutyEditorSession.date)} {dutyEditorSession.start}-{dutyEditorSession.end}
            </p>
            <p className="modal-summary">
              現在の当番: {dutyEditorSession.dutyAssignee?.trim() ? shortenHouseholdLabel(dutyEditorSession.dutyAssignee) : "—"}
            </p>
            <p className="modal-summary">当番候補（可否）</p>
            <div style={{ border: "1px solid #d6dde8", borderRadius: "8px", overflow: "hidden" }}>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 56px",
                  gap: "8px",
                  padding: "8px 10px",
                  background: "#f8fafc",
                  fontWeight: 700,
                  fontSize: "0.82rem",
                }}
              >
                <span>名前</span>
                <span>可否</span>
              </div>
              <ul
                className="activity-survey-list"
                style={{ margin: 0, maxHeight: "320px", overflowY: "auto", listStyle: "none", padding: 0 }}
              >
                {dutyEditorCandidates.map((candidate) => {
                  const isDisabled = candidate.availability === "×";
                  const isCurrent =
                    shortenHouseholdLabel(dutyEditorSession.dutyAssignee?.trim() || "") === candidate.shortLabel;
                  return (
                    <li
                      key={candidate.householdId}
                      style={{
                        borderBottom: "1px solid #e2e8f0",
                        padding: 0,
                      }}
                    >
                      <span
                        style={{
                          display: "inline-grid",
                          gridTemplateColumns: "1fr 56px",
                          gap: "8px",
                          width: "100%",
                          alignItems: "center",
                        }}
                      >
                        {isDisabled ? (
                          <span style={{ color: "#94a3b8", cursor: "not-allowed", padding: "9px 10px" }} title="×は選べません">
                            {candidate.shortLabel}{isCurrent ? "（現在）" : ""}
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => assignDutyAssigneeAndClose(candidate.householdId)}
                            onMouseEnter={(event) => {
                              event.currentTarget.style.background = "#eff6ff";
                            }}
                            onMouseLeave={(event) => {
                              event.currentTarget.style.background = "transparent";
                            }}
                            style={{
                              border: 0,
                              background: "transparent",
                              color: "#1d4ed8",
                              textDecoration: "underline",
                              textUnderlineOffset: "2px",
                              textAlign: "left",
                              cursor: "pointer",
                              padding: "9px 10px",
                              width: "100%",
                            }}
                            title="クリックで即確定"
                          >
                            {candidate.shortLabel}{isCurrent ? "（現在）" : ""}
                          </button>
                        )}
                        <span style={{ color: isDisabled ? "#94a3b8" : "#334155", textAlign: "center" }}>
                          {candidate.availability}
                        </span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
            <div className="modal-actions">
              <button type="button" className="button" onClick={closeDutyEditorModal}>
                キャンセル
              </button>
            </div>
          </div>
        </div>
      )}
      {isDutyCountModalOpen && (
        <div className="modal-backdrop" onClick={() => setIsDutyCountModalOpen(false)}>
          <div className="modal-panel activity-modal-panel" onClick={(event) => event.stopPropagation()}>
            <button type="button" className="modal-close" aria-label="閉じる" onClick={() => setIsDutyCountModalOpen(false)}>
              ×
            </button>
            <p className="modal-context">当番回数（月内）</p>
            <ul className="activity-survey-list">
              {dutySessionCounts.map(([label, count]) => (
                <li key={label}>
                  {label}: {count}回
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </section>
  );
}
