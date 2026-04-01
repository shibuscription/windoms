import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import type { DayLog, DemoData, SessionDoc } from "../types";
import {
  formatDateYmd,
  formatMonthJa,
  formatTimeNoLeadingZero,
  formatWeekdayJa,
  getMonthKeyFromDateKey,
  isValidMonthKey,
  shiftMonthKey,
  todayDateKey,
  weekdayTone,
} from "../utils/date";

type LogsListPageProps = {
  data: DemoData;
  ensureDayLog: (date: string) => Promise<void>;
};

type LogsListItem = {
  date: string;
  sessions: SessionDoc[];
  log: DayLog | null;
};

const toFamilyName = (value?: string): string => {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return "-";
  return trimmed.split(/\s+/)[0] || trimmed;
};

const resolveMonthKey = (rawMonthKey: string | null): string => {
  if (rawMonthKey && isValidMonthKey(rawMonthKey)) return rawMonthKey;
  return getMonthKeyFromDateKey(todayDateKey());
};

const sessionBadgeLabel = (session: SessionDoc): string => {
  if (session.type === "event") return "イベント";
  if (session.type === "self") return "自主練";
  return "通常練習";
};

const sessionDetail = (session: SessionDoc): string | null => {
  if (session.type !== "event") return null;
  return session.eventName?.trim() || "イベント名未設定";
};

function DutyStampPreview({
  sessions,
  log,
}: {
  sessions: SessionDoc[];
  log: DayLog | null;
}) {
  return (
    <div className="duty-section duty-section-compact">
      <div className="duty-connected-scroll">
        <div className="duty-connected-wrap duty-connected-wrap-compact">
          {sessions.map((session, index) => {
            const order = session.order ?? index + 1;
            const stamp = log?.dutyStamps?.[String(order)];
            const isStamped = Boolean(stamp);
            const isUnassigned = !session.assigneeNameSnapshot?.trim();
            const plannedName = toFamilyName(session.assigneeNameSnapshot);
            const displayName = isStamped ? toFamilyName(stamp?.stampedByName) : plannedName;
            const stateClass = isStamped ? "stamped" : isUnassigned ? "unassigned" : "unstamped";
            const title = isStamped
              ? `捺印者: ${stamp?.stampedByName ?? ""}`
              : session.assigneeNameSnapshot
                ? `予定当番: ${session.assigneeNameSnapshot}`
                : "当番未設定";

            return (
              <div
                key={`${session.id ?? session.order}-${order}`}
                className="duty-connected-cell duty-connected-cell-compact"
              >
                <div
                  className={`duty-stamp-circle duty-stamp-preview ${stateClass}`}
                  title={title}
                  aria-label={title}
                >
                  <span className="duty-stamp-text">{displayName}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function LogsListPage({ data, ensureDayLog }: LogsListPageProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const [openingDate, setOpeningDate] = useState("");
  const [openError, setOpenError] = useState("");
  const monthKey = resolveMonthKey(searchParams.get("ym"));

  const items = useMemo<LogsListItem[]>(
    () =>
      Object.entries(data.scheduleDays)
        .filter(([date, day]) => getMonthKeyFromDateKey(date) === monthKey && day.sessions.length > 0)
        .sort(([a], [b]) => b.localeCompare(a))
        .map(([date, day]) => ({
          date,
          sessions: [...day.sessions].sort((left, right) => left.order - right.order),
          log: data.dayLogs[date] ?? null,
        })),
    [data.dayLogs, data.scheduleDays, monthKey],
  );

  const moveMonth = (diff: number) => {
    const nextMonthKey = shiftMonthKey(monthKey, diff);
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set("ym", nextMonthKey);
    setSearchParams(nextParams, { replace: true });
  };

  const onOpenLog = async (date: string) => {
    setOpeningDate(date);
    setOpenError("");
    try {
      await ensureDayLog(date);
      navigate(`/logs/${date}`);
    } catch {
      setOpenError("日誌を開けませんでした。時間をおいて再度お試しください。");
    } finally {
      setOpeningDate((current) => (current === date ? "" : current));
    }
  };

  return (
    <section className="card logs-list-page">
      <div className="logs-list-header">
        <div>
          <h1>当番日誌</h1>
        </div>
      </div>

      <div className="logs-list-month-nav">
        <button type="button" className="button button-small logs-list-nav-button" onClick={() => moveMonth(-1)}>
          ← 前月
        </button>
        <strong className="logs-list-month-label">{formatMonthJa(monthKey)}</strong>
        <button type="button" className="button button-small logs-list-nav-button" onClick={() => moveMonth(1)}>
          翌月 →
        </button>
      </div>

      {openError && <p className="field-error">{openError}</p>}

      {items.length === 0 ? (
        <div className="empty-state logs-list-empty">
          <p>この月に予定がある日はありません。</p>
        </div>
      ) : (
        <div className="logs-list-cards">
          {items.map((item) => {
            const isCreated = Boolean(item.log);
            const isOpening = openingDate === item.date;

            return (
              <button
                key={item.date}
                type="button"
                className={`logs-list-card ${isCreated ? "created" : "pending"}`}
                onClick={() => void onOpenLog(item.date)}
                disabled={isOpening}
              >
                <div className="logs-list-card-top">
                  <div className="logs-list-date-block">
                    <strong className="logs-list-date">{formatDateYmd(item.date)}</strong>
                    <span className={`logs-list-weekday ${weekdayTone(item.date)}`}>（{formatWeekdayJa(item.date)}）</span>
                  </div>
                  <span className={`logs-list-status-badge ${isCreated ? "created" : "pending"}`}>
                    {isCreated ? "作成済み" : "未作成"}
                  </span>
                </div>

                <div className="logs-list-sessions">
                  {item.sessions.map((session) => {
                    const detail = sessionDetail(session);
                    return (
                      <div key={session.id ?? `${item.date}-${session.order}`} className="logs-list-session-row">
                        <span className="logs-list-session-time">
                          {formatTimeNoLeadingZero(session.startTime)}〜{formatTimeNoLeadingZero(session.endTime)}
                        </span>
                        <div className="logs-list-session-main">
                          <span className={`logs-list-session-badge ${session.type}`}>{sessionBadgeLabel(session)}</span>
                          {detail ? <span className="logs-list-session-detail">{detail}</span> : null}
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="logs-list-duty-block">
                  <span className="logs-list-duty-label">当番</span>
                  <DutyStampPreview sessions={item.sessions} log={item.log} />
                </div>

                {isOpening && <span className="logs-list-opening">開いています...</span>}
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}
