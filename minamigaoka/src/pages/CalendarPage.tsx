import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  createCalendarSession,
  deleteCalendarSession,
  updateCalendarSession,
  type SaveCalendarSessionInput,
} from "../schedule/service";
import { subscribeFamilies } from "../members/service";
import type { FamilyRecord } from "../members/types";
import type { DemoRsvp, DemoData, RsvpStatus, SessionDoc } from "../types";
import {
  formatDateYmd,
  formatTimeNoLeadingZero,
  formatWeekdayJa,
  isValidDateKey,
  todayDateKey,
} from "../utils/date";
import { toDemoFamilyName } from "../utils/demoName";

type CalendarPageProps = {
  data: DemoData;
  isAdmin: boolean;
};

type EditableSessionType = "normal" | "self" | "event";

type DaySelection = {
  date: string;
  sessions: SessionDoc[];
};

type CalendarDialog = {
  title: string;
  message: string;
  confirmLabel?: string;
  onConfirm?: () => void | Promise<void>;
};

type SessionFormState = {
  date: string;
  sessionId: string | null;
  startTime: string;
  endTime: string;
  type: EditableSessionType;
  eventName: string;
  location: string;
  assigneeFamilyId: string;
  note: string;
};

type FieldErrors = Partial<Record<keyof SessionFormState, string>>;

const weekdayLabels = ["日", "月", "火", "水", "木", "金", "土"] as const;

const typeLabel: Record<SessionDoc["type"], string> = {
  normal: "通常練習",
  self: "自主練",
  event: "イベント",
};

const editableTypeOptions: Array<{ value: EditableSessionType; label: string }> = [
  { value: "normal", label: "通常練習" },
  { value: "self", label: "自主練" },
  { value: "event", label: "イベント" },
];

const assigneeRoleLabel = (session: SessionDoc): string =>
  session.type === "self" ? "見守り" : "当番";

const statusSymbol: Record<RsvpStatus, string> = {
  yes: "○",
  maybe: "△",
  no: "×",
  unknown: "-",
};

const toFamilyName = (name?: string): string => {
  const value = (name ?? "").trim();
  if (!value || value === "-") return "-";
  if (value.includes(" ")) return value.split(" ")[0] || "-";
  if (value.includes("　")) return value.split("　")[0] || "-";
  return value;
};

const resolveFamilyIdFromSnapshot = (families: FamilyRecord[], snapshot?: string): string => {
  const familyName = toFamilyName(snapshot);
  if (!familyName || familyName === "-") return "";
  return families.find((family) => toFamilyName(family.name) === familyName)?.id ?? "";
};

const toMonthKey = (dateKey: string): string => dateKey.slice(0, 7);

const monthLabel = (monthKey: string): string => {
  const [year, month] = monthKey.split("-").map(Number);
  return `${year}/${String(month).padStart(2, "0")}`;
};

const shiftMonthKey = (monthKey: string, months: number): string => {
  const [year, month] = monthKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1 + months, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
};

const isValidMonthKey = (value: string): boolean => {
  if (!/^\d{4}-\d{2}$/.test(value)) return false;
  const month = Number(value.slice(5, 7));
  return month >= 1 && month <= 12;
};

const buildMonthCells = (monthKey: string): Array<string | null> => {
  const [year, month] = monthKey.split("-").map(Number);
  const firstDay = new Date(year, month - 1, 1).getDay();
  const daysInMonth = new Date(year, month, 0).getDate();
  const cells: Array<string | null> = [];
  for (let i = 0; i < firstDay; i += 1) cells.push(null);
  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push(`${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`);
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
};

const sortSessions = (sessions: SessionDoc[]): SessionDoc[] =>
  [...sessions].sort((left, right) => {
    if (left.order !== right.order) return left.order - right.order;
    const startCompare = left.startTime.localeCompare(right.startTime);
    if (startCompare !== 0) return startCompare;
    const endCompare = left.endTime.localeCompare(right.endTime);
    if (endCompare !== 0) return endCompare;
    return (left.id ?? "").localeCompare(right.id ?? "");
  });

const countRsvps = (session: SessionDoc) => {
  const list = session.demoRsvps ?? [];
  return {
    yes: list.filter((item) => item.status === "yes").length,
    maybe: list.filter((item) => item.status === "maybe").length,
    no: list.filter((item) => item.status === "no").length,
  };
};

const sortRsvps = (items: DemoRsvp[]): DemoRsvp[] =>
  [...items].sort((a, b) =>
    toDemoFamilyName(a.displayName).localeCompare(toDemoFamilyName(b.displayName), "ja"),
  );

const emptySessionForm = (date: string): SessionFormState => ({
  date,
  sessionId: null,
  startTime: "09:00",
  endTime: "12:00",
  type: "normal",
  eventName: "",
  location: "",
  assigneeFamilyId: "",
  note: "",
});

const isEditableSession = (session: SessionDoc): session is SessionDoc & { type: EditableSessionType } =>
  session.type === "normal" || session.type === "self" || session.type === "event";

const toSessionForm = (date: string, session: SessionDoc, families: FamilyRecord[]): SessionFormState => ({
  date,
  sessionId: session.id ?? null,
  startTime: session.startTime,
  endTime: session.endTime,
  type: isEditableSession(session) ? session.type : "normal",
  eventName: session.eventName ?? "",
  location: session.location ?? "",
  assigneeFamilyId:
    session.assigneeFamilyId ?? resolveFamilyIdFromSnapshot(families, session.assigneeNameSnapshot),
  note: session.note ?? "",
});

const validateSessionForm = (form: SessionFormState): FieldErrors => {
  const errors: FieldErrors = {};

  if (!isValidDateKey(form.date)) {
    errors.date = "日付を正しく入力してください。";
  }
  if (!/^\d{2}:\d{2}$/.test(form.startTime)) {
    errors.startTime = "開始時刻を入力してください。";
  }
  if (!/^\d{2}:\d{2}$/.test(form.endTime)) {
    errors.endTime = "終了時刻を入力してください。";
  }
  if (!errors.startTime && !errors.endTime && form.startTime >= form.endTime) {
    errors.endTime = "終了時刻は開始時刻より後にしてください。";
  }
  if (form.type === "event" && !form.eventName.trim()) {
    errors.eventName = "イベント名を入力してください。";
  }

  return errors;
};

export function CalendarPage({ data, isAdmin }: CalendarPageProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedDay, setSelectedDay] = useState<DaySelection | null>(null);
  const [dialog, setDialog] = useState<CalendarDialog | null>(null);
  const [attendanceSession, setAttendanceSession] = useState<SessionDoc | null>(null);
  const [isSessionModalOpen, setIsSessionModalOpen] = useState(false);
  const [sessionForm, setSessionForm] = useState<SessionFormState>(emptySessionForm(todayDateKey()));
  const [sessionErrors, setSessionErrors] = useState<FieldErrors>({});
  const [sessionSubmitError, setSessionSubmitError] = useState("");
  const [isSubmittingSession, setIsSubmittingSession] = useState(false);
  const [families, setFamilies] = useState<FamilyRecord[]>([]);
  const navigate = useNavigate();
  const today = todayDateKey();
  const queryDate = searchParams.get("date") ?? "";
  const queryYm = searchParams.get("ym") ?? "";

  const validDate = queryDate && isValidDateKey(queryDate) ? queryDate : "";
  const derivedYm = validDate ? toMonthKey(validDate) : "";
  const monthKey = derivedYm || (isValidMonthKey(queryYm) ? queryYm : toMonthKey(today));
  const selectedDate = validDate && toMonthKey(validDate) === monthKey ? validDate : "";
  const calendarCells = useMemo(() => buildMonthCells(monthKey), [monthKey]);
  const familyOptions = useMemo(
    () =>
      families
        .filter((family) => family.status === "active")
        .map((family) => ({
          id: family.id,
          label: toFamilyName(family.name),
        }))
        .sort((left, right) => left.label.localeCompare(right.label, "ja")),
    [families],
  );
  const locationOptions = useMemo(() => {
    const values = new Set<string>();
    Object.values(data.scheduleDays).forEach((day) => {
      if (day.defaultLocation?.trim()) {
        values.add(day.defaultLocation.trim());
      }
      (day.sessions ?? []).forEach((session) => {
        if (session.location?.trim()) {
          values.add(session.location.trim());
        }
      });
    });
    return [...values].sort((left, right) => left.localeCompare(right, "ja"));
  }, [data.scheduleDays]);

  useEffect(() => subscribeFamilies(setFamilies), []);

  useEffect(() => {
    const next = new URLSearchParams();
    next.set("ym", monthKey);
    if (selectedDate) next.set("date", selectedDate);
    const current = searchParams.toString();
    const normalized = next.toString();
    if (current !== normalized) {
      setSearchParams(next, { replace: true });
    }
  }, [monthKey, searchParams, selectedDate, setSearchParams]);

  useEffect(() => {
    if (!selectedDay) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [selectedDay]);

  useEffect(() => {
    if (!selectedDay) return;
    const latestSessions = sortSessions(data.scheduleDays[selectedDay.date]?.sessions ?? []);
    setSelectedDay((current) =>
      current
        ? {
            ...current,
            sessions: latestSessions,
          }
        : current,
    );
  }, [data.scheduleDays, selectedDay]);

  const syncSearchParams = (nextYm: string, nextDate?: string) => {
    const next = new URLSearchParams();
    next.set("ym", nextYm);
    if (nextDate) next.set("date", nextDate);
    setSearchParams(next, { replace: false });
  };

  const goPrevMonth = () => {
    syncSearchParams(shiftMonthKey(monthKey, -1));
  };

  const goNextMonth = () => {
    syncSearchParams(shiftMonthKey(monthKey, 1));
  };

  const goToday = () => {
    syncSearchParams(toMonthKey(today), today);
  };

  const openDay = (date: string, sessions: SessionDoc[]) => {
    syncSearchParams(monthKey, date);
    setSelectedDay({ date, sessions: sortSessions(sessions) });
  };

  const goToTodayFromSheet = () => {
    if (!selectedDay) return;
    if (selectedDay.date === today) {
      navigate("/today");
      return;
    }
    navigate(`/today?date=${selectedDay.date}`);
  };

  const closeSheet = () => {
    setSelectedDay(null);
  };

  const closeDialog = () => {
    setDialog(null);
  };

  const closeAttendanceModal = () => {
    setAttendanceSession(null);
  };

  const openCreateSession = () => {
    if (!selectedDay) return;
    setSessionForm(emptySessionForm(selectedDay.date));
    setSessionErrors({});
    setSessionSubmitError("");
    setIsSessionModalOpen(true);
  };

  const openEditSession = (session: SessionDoc) => {
    if (!selectedDay || !isEditableSession(session)) return;
    setSessionForm(toSessionForm(selectedDay.date, session, families));
    setSessionErrors({});
    setSessionSubmitError("");
    setIsSessionModalOpen(true);
  };

  const closeSessionModal = () => {
    if (isSubmittingSession) return;
    setIsSessionModalOpen(false);
  };

  const handleSessionFieldChange = <K extends keyof SessionFormState>(
    key: K,
    value: SessionFormState[K],
  ) => {
    setSessionForm((current) => ({
      ...current,
      [key]: value,
      ...(key === "type" && value !== "event" ? { eventName: "" } : {}),
    }));
    setSessionErrors((current) => ({
      ...current,
      [key]: undefined,
      ...(key === "type" && value !== "event" ? { eventName: undefined } : {}),
    }));
  };

  const submitSession = async () => {
    const errors = validateSessionForm(sessionForm);
    setSessionErrors(errors);
    setSessionSubmitError("");
    if (Object.values(errors).some(Boolean)) {
      return;
    }

    setIsSubmittingSession(true);
    try {
      const payload: SaveCalendarSessionInput = {
        originalDate: selectedDay?.date,
        date: sessionForm.date,
        sessionId: sessionForm.sessionId ?? undefined,
        startTime: sessionForm.startTime,
        endTime: sessionForm.endTime,
        type: sessionForm.type,
        eventName: sessionForm.eventName,
        location: sessionForm.location,
        assigneeFamilyId: sessionForm.assigneeFamilyId,
        note: sessionForm.note,
      };

      if (sessionForm.sessionId) {
        await updateCalendarSession(payload);
      } else {
        await createCalendarSession(payload);
      }

      setIsSessionModalOpen(false);
    } catch (error) {
      setSessionSubmitError(
        error instanceof Error ? error.message : "セッションの保存に失敗しました。",
      );
    } finally {
      setIsSubmittingSession(false);
    }
  };

  const openDeleteConfirm = (session: SessionDoc) => {
    if (!selectedDay || !session.id) return;
    setDialog({
      title: "セッション削除",
      message: `${formatTimeNoLeadingZero(session.startTime)}-${formatTimeNoLeadingZero(
        session.endTime,
      )} を削除しますか？`,
      confirmLabel: "削除",
      onConfirm: async () => {
        await deleteCalendarSession(selectedDay.date, session.id!);
      },
    });
  };

  const selectedAttendanceCounts = attendanceSession ? countRsvps(attendanceSession) : null;
  const selectedAttendanceRsvps = useMemo(
    () => (attendanceSession ? sortRsvps(attendanceSession.demoRsvps ?? []) : []),
    [attendanceSession],
  );

  return (
    <section className="card">
      <div className="month-calendar-header">
        <div className="month-calendar-header-left">
          <button type="button" className="button button-small" onClick={() => navigate("/today")}>
            Todayへ
          </button>
        </div>
        <div className="month-calendar-header-center">
          <h1>カレンダー</h1>
        </div>
        <div className="month-calendar-header-right month-calendar-nav">
          <button type="button" className="button button-small button-secondary" onClick={goPrevMonth}>
            ← 前月
          </button>
          <strong>{monthLabel(monthKey)}</strong>
          <button type="button" className="button button-small button-secondary" onClick={goNextMonth}>
            翌月 →
          </button>
          <button type="button" className="button button-small button-secondary" onClick={goToday}>
            今日
          </button>
        </div>
      </div>
      <div className="calendar-mobile-bleed">
        <div className="month-calendar-weekdays">
          {weekdayLabels.map((label) => (
            <span key={`calendar-weekday-${label}`}>{label}</span>
          ))}
        </div>
        <div className="month-calendar-grid">
          {calendarCells.map((cell, index) => {
            if (!cell) return <div key={`calendar-empty-${index}`} className="month-calendar-day empty" />;
            const daySessions = sortSessions(data.scheduleDays[cell]?.sessions ?? []);
            const isToday = cell === today;
            const isSelected = Boolean(selectedDate && selectedDate === cell);
            return (
              <article
                key={cell}
                className={`month-calendar-day ${isToday ? "today" : ""} ${isSelected ? "selected" : ""}`}
                role="button"
                tabIndex={0}
                onClick={() => openDay(cell, daySessions)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    openDay(cell, daySessions);
                  }
                }}
                aria-label={`${formatDateYmd(cell)} の詳細を開く`}
              >
                <span className="month-calendar-day-link">{Number(cell.slice(-2))}</span>
                <div className="month-calendar-events">
                  {daySessions.map((session) => (
                    <div key={`${cell}-${session.id ?? session.order}`} className={`calendar-event ${session.type}`}>
                      <span className="calendar-event-main">
                        <span className="calendar-event-time">{formatTimeNoLeadingZero(session.startTime)}</span>
                        <span
                          className={`calendar-event-label ${
                            session.type === "event" ? "event-name" : "session-type"
                          }`}
                        >
                          {session.type === "event"
                            ? session.eventName?.trim() || "イベント"
                            : typeLabel[session.type]}
                        </span>
                      </span>
                      <span className="calendar-event-duty">
                        <span className="calendar-event-duty-label">{assigneeRoleLabel(session)}:</span>{" "}
                        <span className="calendar-event-duty-name">{toFamilyName(session.assigneeNameSnapshot)}</span>
                      </span>
                    </div>
                  ))}
                </div>
              </article>
            );
          })}
        </div>
      </div>

      {selectedDay && (
        <div className="calendar-sheet-backdrop" onClick={closeSheet}>
          <section className="calendar-day-sheet" onClick={(event) => event.stopPropagation()}>
            <button
              type="button"
              className="calendar-session-sheet-close"
              onClick={closeSheet}
              aria-label="閉じる"
              title="閉じる"
            >
              ×
            </button>
            <header className="calendar-day-sheet-header">
              <p className="modal-context">
                {formatDateYmd(selectedDay.date)}（{formatWeekdayJa(selectedDay.date)}）
              </p>
              <div className="calendar-day-sheet-actions">
                <button type="button" className="button button-small" onClick={goToTodayFromSheet}>
                  Todayへ
                </button>
                <button
                  type="button"
                  className="button button-small button-secondary"
                  onClick={() => navigate(`/logs/${selectedDay.date}`)}
                >
                  日誌へ
                </button>
                {isAdmin && (
                  <button
                    type="button"
                    className="button button-small button-secondary"
                    onClick={openCreateSession}
                  >
                    ＋
                  </button>
                )}
              </div>
            </header>
            <div className="calendar-day-sheet-list">
              {selectedDay.sessions.length === 0 && (
                <p className="muted">この日のセッションはまだありません。</p>
              )}
              {selectedDay.sessions.map((session) => {
                const counts = countRsvps(session);
                const editable = isAdmin && isEditableSession(session) && Boolean(session.id);
                return (
                  <article
                    key={`sheet-${selectedDay.date}-${session.id ?? session.order}`}
                    className={`session-card ${session.type}`}
                  >
                    <span className={`session-type-badge ${session.type}`}>
                      {session.type === "event"
                        ? session.eventName?.trim() || "イベント"
                        : typeLabel[session.type]}
                    </span>
                    {editable && (
                      <div className="session-card-actions-top">
                        <button
                          type="button"
                          className="calendar-day-sheet-icon"
                          aria-label="編集"
                          title="編集"
                          onClick={() => openEditSession(session)}
                        >
                          ✎
                        </button>
                        <button
                          type="button"
                          className="calendar-day-sheet-icon"
                          aria-label="削除"
                          title="削除"
                          onClick={() => openDeleteConfirm(session)}
                        >
                          🗑
                        </button>
                      </div>
                    )}
                    <div className="calendar-day-sheet-main session-card-body">
                      <p className="calendar-day-sheet-time session-time">
                        {formatTimeNoLeadingZero(session.startTime)}-{formatTimeNoLeadingZero(session.endTime)}
                      </p>
                      {session.type === "event" && session.eventName?.trim() && (
                        <p className="calendar-day-sheet-meta">{session.eventName}</p>
                      )}
                      <p className="calendar-day-sheet-label kv-row">
                        <span className="kv-key">{assigneeRoleLabel(session)}：</span>
                        <span className="kv-val shift-role">{toFamilyName(session.assigneeNameSnapshot)}</span>
                      </p>
                      {session.location && (
                        <p className="calendar-day-sheet-meta kv-row">
                          <span className="kv-key">場所：</span>
                          <span className="kv-val">{session.location}</span>
                        </p>
                      )}
                      {session.note && (
                        <p className="calendar-day-sheet-meta kv-row">
                          <span className="kv-key">メモ：</span>
                          <span className="kv-val">{session.note}</span>
                        </p>
                      )}
                      <p className="calendar-day-sheet-meta kv-row">
                        <span className="kv-key">出欠：</span>
                        <span className="kv-val">
                          <button
                            type="button"
                            className="attendance-trigger"
                            onClick={() => setAttendanceSession(session)}
                          >
                            <span className="count-yes">○{counts.yes}</span>
                            <span className="count-maybe">△{counts.maybe}</span>
                            <span className="count-no">×{counts.no}</span>
                          </button>
                        </span>
                      </p>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>

          {dialog && (
            <div className="calendar-mini-dialog-backdrop" onClick={closeDialog}>
              <div className="calendar-mini-dialog" onClick={(event) => event.stopPropagation()}>
                <p className="calendar-mini-dialog-title">{dialog.title}</p>
                <p className="calendar-mini-dialog-message">{dialog.message}</p>
                <div className="calendar-mini-dialog-actions">
                  {dialog.confirmLabel ? (
                    <>
                      <button type="button" className="button button-small button-secondary" onClick={closeDialog}>
                        キャンセル
                      </button>
                      <button
                        type="button"
                        className="button button-small"
                        onClick={async () => {
                          await dialog.onConfirm?.();
                          closeDialog();
                        }}
                      >
                        {dialog.confirmLabel}
                      </button>
                    </>
                  ) : (
                    <button type="button" className="button button-small" onClick={closeDialog}>
                      閉じる
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {isSessionModalOpen && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <section className="modal-panel calendar-session-editor-panel">
            <button
              type="button"
              className="modal-close"
              aria-label="閉じる"
              title="閉じる"
              onClick={closeSessionModal}
            >
              ×
            </button>
            <h3>{sessionForm.sessionId ? "セッション編集" : "セッション追加"}</h3>
            <p className="muted">カレンダーでは単発追加と個別調整のみを行います。</p>

            <label>
              日付
              <input
                type="date"
                value={sessionForm.date}
                onChange={(event) => handleSessionFieldChange("date", event.target.value)}
              />
              {sessionErrors.date && <span className="field-error">{sessionErrors.date}</span>}
            </label>

            <div className="calendar-session-editor-times">
              <label>
                開始時刻
                <input
                  type="time"
                  value={sessionForm.startTime}
                  onChange={(event) => handleSessionFieldChange("startTime", event.target.value)}
                />
                {sessionErrors.startTime && <span className="field-error">{sessionErrors.startTime}</span>}
              </label>
              <label>
                終了時刻
                <input
                  type="time"
                  value={sessionForm.endTime}
                  onChange={(event) => handleSessionFieldChange("endTime", event.target.value)}
                />
                {sessionErrors.endTime && <span className="field-error">{sessionErrors.endTime}</span>}
              </label>
            </div>

            <label>
              種別
              <select
                value={sessionForm.type}
                onChange={(event) =>
                  handleSessionFieldChange("type", event.target.value as EditableSessionType)
                }
              >
                {editableTypeOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            {sessionForm.type === "event" && (
              <label>
                イベント名
                <input
                  value={sessionForm.eventName}
                  onChange={(event) => handleSessionFieldChange("eventName", event.target.value)}
                />
                {sessionErrors.eventName && <span className="field-error">{sessionErrors.eventName}</span>}
              </label>
            )}

            <label>
              場所
              <input
                list="calendar-location-suggestions"
                value={sessionForm.location}
                onChange={(event) => handleSessionFieldChange("location", event.target.value)}
              />
              {locationOptions.length > 0 && (
                <datalist id="calendar-location-suggestions">
                  {locationOptions.map((option) => (
                    <option key={option} value={option} />
                  ))}
                </datalist>
              )}
            </label>

            <label>
              {sessionForm.type === "self" ? "見守り担当" : "当番担当"}
              <select
                value={sessionForm.assigneeFamilyId}
                onChange={(event) =>
                  handleSessionFieldChange("assigneeFamilyId", event.target.value)
                }
              >
                <option value="">未割当</option>
                {familyOptions.map((family) => (
                  <option key={family.id} value={family.id}>
                    {family.label}
                  </option>
                ))}
              </select>
            </label>

            <label>
              メモ
              <textarea
                value={sessionForm.note}
                onChange={(event) => handleSessionFieldChange("note", event.target.value)}
              />
            </label>

            {sessionSubmitError && <p className="field-error">{sessionSubmitError}</p>}

            <div className="modal-actions">
              <button
                type="button"
                className="button button-secondary"
                onClick={closeSessionModal}
                disabled={isSubmittingSession}
              >
                キャンセル
              </button>
              <button
                type="button"
                className="button"
                onClick={() => void submitSession()}
                disabled={isSubmittingSession}
              >
                {isSubmittingSession ? "保存中..." : "保存"}
              </button>
            </div>
          </section>
        </div>
      )}

      {attendanceSession && (
        <div className="modal-backdrop calendar-attendance-backdrop" onClick={closeAttendanceModal}>
          <div className="modal-panel" onClick={(event) => event.stopPropagation()}>
            <button
              type="button"
              className="modal-close"
              onClick={closeAttendanceModal}
              aria-label="閉じる"
              title="閉じる"
            >
              ×
            </button>
            <p className="modal-context">
              {selectedDay ? `${formatDateYmd(selectedDay.date)}（${formatWeekdayJa(selectedDay.date)}）` : ""}
              {" "}
              {formatTimeNoLeadingZero(attendanceSession.startTime)}-
              {formatTimeNoLeadingZero(attendanceSession.endTime)} /{" "}
              {attendanceSession.type === "event"
                ? attendanceSession.eventName?.trim() || "イベント"
                : typeLabel[attendanceSession.type]}
            </p>
            {selectedAttendanceCounts && (
              <p className="modal-summary">
                出欠: <span className="count-yes">○{selectedAttendanceCounts.yes}</span>{" "}
                <span className="count-maybe">△{selectedAttendanceCounts.maybe}</span>{" "}
                <span className="count-no">×{selectedAttendanceCounts.no}</span>
              </p>
            )}
            <div className="rsvp-table">
              {selectedAttendanceRsvps.length === 0 ? (
                <div className="rsvp-row">
                  <span>サンプル表示はありません</span>
                  <span className="rsvp-mark unknown">-</span>
                </div>
              ) : (
                selectedAttendanceRsvps.map((rsvp) => (
                  <div key={rsvp.uid} className="rsvp-row">
                    <span>{toDemoFamilyName(rsvp.displayName, "-")}</span>
                    <span className={`rsvp-mark ${rsvp.status}`}>{statusSymbol[rsvp.status]}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
