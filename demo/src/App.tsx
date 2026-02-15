import { Link, Navigate, Route, Routes } from "react-router-dom";
import { useMemo, useState } from "react";
import { HomePage } from "./pages/HomePage";
import { TodayPage } from "./pages/TodayPage";
import { LogPage } from "./pages/LogPage";
import { mockData } from "./data/mockData";
import type { DayLog, DemoData, DemoRsvp } from "./types";

export function App() {
  const [data, setData] = useState<DemoData>(mockData);

  const context = useMemo(
    () => ({
      data,
      updateDayLog: (date: string, updater: (prev: DayLog) => DayLog) => {
        setData((prev) => {
          const current = prev.dayLogs[date] ?? {
            notes: "",
            weather: "",
            activities: [],
            actualInstructors: [],
            actualSeniors: [],
          };
          return {
            ...prev,
            dayLogs: {
              ...prev.dayLogs,
              [date]: updater(current),
            },
          };
        });
      },
      updateSessionRsvps: (date: string, sessionOrder: number, rsvps: DemoRsvp[]) => {
        setData((prev) => {
          const day = prev.scheduleDays[date];
          if (!day) return prev;
          return {
            ...prev,
            scheduleDays: {
              ...prev.scheduleDays,
              [date]: {
                ...day,
                sessions: day.sessions.map((session) =>
                  session.order === sessionOrder ? { ...session, demoRsvps: rsvps } : session,
                ),
              },
            },
          };
        });
      },
      updateDemoDictionaries: (next: Partial<DemoData["demoDictionaries"]>) => {
        setData((prev) => ({
          ...prev,
          demoDictionaries: {
            instructors: Array.from(
              new Set([...(prev.demoDictionaries.instructors ?? []), ...(next.instructors ?? [])]),
            ),
            seniors: Array.from(
              new Set([...(prev.demoDictionaries.seniors ?? []), ...(next.seniors ?? [])]),
            ),
          },
        }));
      },
    }),
    [data],
  );

  return (
    <div className="app-shell">
      <div className="demo-badge">DEMO（データは仮）</div>
      <header className="app-header">
        <Link to="/" className="brand">
          Windoms demo
        </Link>
      </header>
      <main className="page-wrap">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route
            path="/today"
            element={<TodayPage data={context.data} updateDayLog={context.updateDayLog} />}
          />
          <Route
            path="/logs/:date"
            element={
              <LogPage
                data={context.data}
                updateDayLog={context.updateDayLog}
                updateSessionRsvps={context.updateSessionRsvps}
                updateDemoDictionaries={context.updateDemoDictionaries}
              />
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}
