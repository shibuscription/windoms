import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { DemoData, DemoRsvp, DutyRequirement, RsvpStatus, SessionDoc } from "../types";
import {
  formatDateYmd,
  formatWeekdayJa,
  formatTimeNoLeadingZero,
  todayDateKey,
  weekdayTone,
} from "../utils/date";

type TodayPageProps = {
  data: DemoData;
};

const typeLabel: Record<SessionDoc["type"], string> = {
  normal: "通常練習",
  self: "自主練",
  event: "イベント",
};

const dutyLabel: Record<DutyRequirement, string> = {
  duty: "当番",
  watch: "見守り",
};
const statusSymbol: Record<RsvpStatus, string> = {
  yes: "◯",
  maybe: "△",
  no: "×",
  unknown: "-",
};

const countRsvps = (session: SessionDoc) => {
  const list = session.demoRsvps ?? [];
  return {
    yes: list.filter((item) => item.status === "yes").length,
    maybe: list.filter((item) => item.status === "maybe").length,
    no: list.filter((item) => item.status === "no").length,
  };
};

const sortRsvps = (items: DemoRsvp[], data: DemoData): DemoRsvp[] =>
  [...items].sort((a, b) => {
    const ma = data.members[a.uid];
    const mb = data.members[b.uid];
    if (ma && mb) {
      if (ma.grade !== mb.grade) return mb.grade - ma.grade;
      if (ma.instrumentOrder !== mb.instrumentOrder) return ma.instrumentOrder - mb.instrumentOrder;
      return ma.kana.localeCompare(mb.kana, "ja");
    }
    if (ma && !mb) return -1;
    if (!ma && mb) return 1;
    return a.displayName.localeCompare(b.displayName, "ja");
  });

export function TodayPage({ data }: TodayPageProps) {
  const date = todayDateKey();
  const day = data.scheduleDays[date];
  const [selectedSession, setSelectedSession] = useState<SessionDoc | null>(null);
  const dayDefaultLocation = day?.defaultLocation;

  const sessions = useMemo(
    () => [...(day?.sessions ?? [])].sort((a, b) => a.order - b.order),
    [day],
  );

  const hasLog = Boolean(data.dayLogs[date]);
  const hasSessions = sessions.length > 0;
  const logStatus = hasLog ? "☑ 記録あり" : hasSessions ? "⚠ 記録なし" : "";
  const logStatusClass = hasLog ? "has-log" : hasSessions ? "no-log" : "";
  const selectedCounts = selectedSession ? countRsvps(selectedSession) : null;
  const sortedSelectedRsvps = useMemo(
    () => (selectedSession ? sortRsvps(selectedSession.demoRsvps ?? [], data) : []),
    [selectedSession, data],
  );

  return (
    <section className="card">
      <div className="today-header">
        <div>
          <h1 className="date-hero">
            <span className="date-main">{formatDateYmd(date)}</span>
            <span className={`date-weekday ${weekdayTone(date)}`}>（{formatWeekdayJa(date)}）</span>
          </h1>
        </div>
        <div className="today-actions">
          <Link to={`/logs/${date}`} className="button button-small">
            日誌へ
          </Link>
          {logStatus && <span className={`log-status ${logStatusClass}`}>{logStatus}</span>}
        </div>
      </div>

      {day?.notice && <div className="notice-block">{day.notice}</div>}

      {!day || sessions.length === 0 ? (
        <p>今日のセッションは未登録です。</p>
      ) : (
        <div className="session-list">
          {sessions.map((session, index) => {
            const counts = countRsvps(session);
            const label = typeLabel[session.type];
            return (
              <article key={`${session.order}-${index}`} className={`session-card ${session.type}`}>
                <span className={`session-type-badge ${session.type}`}>{label}</span>
                <div className="session-time">
                  {formatTimeNoLeadingZero(session.startTime)} -{" "}
                  {formatTimeNoLeadingZero(session.endTime)}
                </div>
                <div className="kv-row">
                  <span className="kv-key">{dutyLabel[session.dutyRequirement]}：</span>
                  <span className="kv-val shift-role">
                    {session.assigneeNameSnapshot || "未割当"}
                  </span>
                </div>
                <div className="kv-row">
                  <span className="kv-key">出欠：</span>
                  <span className="kv-val">
                    <button
                      type="button"
                      className="attendance-trigger"
                      onClick={() => setSelectedSession(session)}
                    >
                      <span className="count-yes">◯{counts.yes}</span>
                      <span className="count-maybe">△{counts.maybe}</span>
                      <span className="count-no">×{counts.no}</span>
                    </button>
                  </span>
                </div>
                {session.location && session.location !== dayDefaultLocation && (
                  <div className="kv-row">
                    <span className="kv-key">場所：</span>
                    <span className="kv-val">{session.location}</span>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}

      {selectedSession && (
        <div className="modal-backdrop" onClick={() => setSelectedSession(null)}>
          <div className="modal-panel" onClick={(event) => event.stopPropagation()}>
            <button
              type="button"
              className="modal-close"
              onClick={() => setSelectedSession(null)}
              aria-label="閉じる"
            >
              ×
            </button>
            <p className="modal-context">
              {formatDateYmd(date)}（{formatWeekdayJa(date)}）{" "}
              {formatTimeNoLeadingZero(selectedSession.startTime)}–
              {formatTimeNoLeadingZero(selectedSession.endTime)}
            </p>
            {selectedCounts && (
              <p className="modal-summary">
                出欠：<span className="count-yes">◯{selectedCounts.yes}</span>{" "}
                <span className="count-maybe">△{selectedCounts.maybe}</span>{" "}
                <span className="count-no">×{selectedCounts.no}</span>
              </p>
            )}
            <div className="rsvp-table">
              {sortedSelectedRsvps.map((rsvp) => (
                <div key={rsvp.uid} className="rsvp-row">
                  <span>{rsvp.displayName}</span>
                  <span className={`rsvp-mark ${rsvp.status}`}>{statusSymbol[rsvp.status]}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
