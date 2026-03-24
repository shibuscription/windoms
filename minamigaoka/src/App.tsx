import { Link, Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import { HomePage } from "./pages/HomePage";
import { TodayPage } from "./pages/TodayPage";
import { CalendarPage } from "./pages/CalendarPage";
import { LogPage } from "./pages/LogPage";
import { ActivityPlanPage } from "./pages/ActivityPlanPage";
import { AttendancePage } from "./pages/AttendancePage";
import { WatchPage } from "./pages/WatchPage";
import { ShiftSurveyPage } from "./pages/ShiftSurveyPage";
import { LunchPage } from "./pages/LunchPage";
import { LinksPage } from "./pages/LinksPage";
import { MemberDirectoryPage } from "./pages/MemberDirectoryPage";
import { MembersManagementPage } from "./pages/MembersPage";
import { EventsPage } from "./pages/EventsPage";
import { TodosPage } from "./pages/TodosPage";
import { DocsDetailPage, DocsEditorPage, DocsListPage } from "./pages/DocsPage";
import { PurchasesPage } from "./pages/PurchasesPage";
import { ReimbursementsPage } from "./pages/ReimbursementsPage";
import { ScorePage } from "./pages/ScorePage";
import { InstrumentsPage } from "./pages/InstrumentsPage";
import { AccountingHome } from "./pages/Accounting/AccountingHome";
import { AccountingPeriods } from "./pages/Accounting/AccountingPeriods";
import { AccountingReport } from "./pages/Accounting/AccountingReport";
import { AccountLedger } from "./pages/Accounting/AccountLedger";
import { onAuthStateChanged, signOut } from "firebase/auth";
import type {
  DayLog,
  DemoData,
  DocMemo,
  DemoRsvp,
  Instrument,
  LunchRecord,
  PurchaseRequest,
  QuoCard,
  Reimbursement,
  Score,
  Todo,
} from "./types";
import { formatDateYmd, formatWeekdayJa, isValidDateKey, todayDateKey, weekdayTone } from "./utils/date";
import { resolveTodoRelatedSummary, sortTodos } from "./utils/todoUtils";
import {
  getActivityPlanTargetMonthKey,
  readActivityPlanStatus,
  readDemoUnansweredCount,
} from "./utils/activityPlan";
import { LoginScreen } from "./components/LoginScreen";
import { auth, ensureAuthPersistence } from "./config/firebase";
import { toAuthenticatedUser, type AuthenticatedUser } from "./auth/session";
import { appRuntimeConfig } from "./config/runtime";
import { loadInitialData } from "./data/runtimeData";
import { getMemberByAuthUid } from "./members/service";
import type { MemberRecord, MemberRole } from "./members/types";

type MenuItem = {
  id: string;
  label: string;
  icon: string;
  to: string;
  allowedRoles: DemoMenuRole[];
  badgeText?: string;
  isActive: (location: { pathname: string; search: string }) => boolean;
};

type MenuSection = {
  id: string;
  heading: string;
  items: MenuItem[];
};

type DemoMenuRole = "child" | "parent" | "admin";

type DemoNotification = {
  id: string;
  title: string;
  type: "actionable" | "info";
  read: boolean;
  resolved: boolean;
};

const toMenuRole = (role: MemberRole | "parent" | "admin"): DemoMenuRole => {
  if (role === "admin") return "admin";
  if (role === "child") return "child";
  return "parent";
};

const viewIsActive = (location: { pathname: string; search: string }, view: string) =>
  location.pathname === "/today" && new URLSearchParams(location.search).get("view") === view;

const resolveLunchDate = (location: { pathname: string; search: string }, fallback: string): string => {
  if (location.pathname !== "/today") return fallback;
  const date = new URLSearchParams(location.search).get("date");
  return date && isValidDateKey(date) ? date : fallback;
};

const resolvePageLabel = (pathname: string, search: string): string | null => {
  if (pathname === "/today") {
    const view = new URLSearchParams(search).get("view");
    if (view === "practice-log") return "練習日誌";
    if (view === "homework") return "宿題";
    if (view === "instruments") return "楽器";
    if (view === "docs") return "資料";
    if (view === "settings") return "設定";
    return "Today";
  }
  if (pathname === "/calendar") return "カレンダー";
  if (pathname.startsWith("/logs/")) return "当番日誌";
  if (pathname === "/todos") return "TODO";
  if (pathname === "/events" || pathname.startsWith("/events/")) return "イベント";
  if (pathname === "/activity-plan" || pathname === "/shift-survey") return "シフト作成";
  if (pathname === "/purchases") return "購入依頼";
  if (pathname === "/reimbursements") return "立替";
  if (pathname.startsWith("/lunch")) return "お弁当";
  if (pathname === "/accounting" || pathname.startsWith("/accounting/")) return "会計";
  if (pathname === "/instruments") return "楽器";
  if (pathname === "/scores") return "楽譜";
  if (pathname === "/docs" || pathname.startsWith("/docs/")) return "資料";
  if (pathname === "/members") return "メンバー";
  if (pathname === "/settings/members") return "メンバー管理";
  if (pathname === "/links") return "リンク集";
  return null;
};

const menuSections = (
  today: string,
  activityPlanBadgeText: string | undefined,
  role: DemoMenuRole,
): MenuSection[] => {
  const sections: MenuSection[] = [
    {
      id: "activity",
      heading: "活動",
      items: [
        {
          id: "today",
          label: "Today",
          icon: "📅",
          to: "/today",
          allowedRoles: ["child", "parent", "admin"],
          isActive: (location) => location.pathname === "/today" && !location.search,
        },
        {
          id: "calendar",
          label: "カレンダー",
          icon: "🗓️",
          to: "/calendar",
          allowedRoles: ["child", "parent", "admin"],
          isActive: (location) => location.pathname === "/calendar",
        },
        {
          id: "duty-log",
          label: "当番日誌",
          icon: "📝",
          to: `/logs/${today}`,
          allowedRoles: ["parent", "admin"],
          isActive: (location) => location.pathname.startsWith("/logs/"),
        },
        {
          id: "practice-log",
          label: "練習日誌",
          icon: "✍️",
          to: "/today?view=practice-log",
          allowedRoles: ["child", "parent", "admin"],
          isActive: (location) => viewIsActive(location, "practice-log"),
        },
        {
          id: "homework",
          label: "宿題",
          icon: "📘",
          to: "/today?view=homework",
          allowedRoles: ["child", "parent", "admin"],
          isActive: (location) => viewIsActive(location, "homework"),
        },
        {
          id: "todo",
          label: "TODO",
          icon: "✅",
          to: "/todos",
          allowedRoles: ["parent", "admin"],
          isActive: (location) => location.pathname === "/todos",
        },
        {
          id: "event",
          label: "イベント",
          icon: "🎪",
          to: "/events",
          allowedRoles: ["child", "parent", "admin"],
          isActive: (location) => location.pathname.startsWith("/events"),
        },
        {
          id: "shift-create",
          label: "シフト作成",
          icon: "🧭",
          to: "/activity-plan",
          allowedRoles: ["admin"],
          badgeText: activityPlanBadgeText,
          isActive: (location) => location.pathname === "/activity-plan",
        },
      ],
    },
    {
      id: "accounting",
      heading: "会計",
      items: [
        {
          id: "purchase-request",
          label: "購入依頼",
          icon: "🛍️",
          to: "/purchases",
          allowedRoles: ["parent", "admin"],
          isActive: (location) => location.pathname.startsWith("/purchases"),
        },
        {
          id: "reimbursement",
          label: "立替",
          icon: "🧾",
          to: "/reimbursements",
          allowedRoles: ["parent", "admin"],
          isActive: (location) => location.pathname.startsWith("/reimbursements"),
        },
        {
          id: "lunch",
          label: "お弁当",
          icon: "🍱",
          to: "/lunch",
          allowedRoles: ["parent", "admin"],
          isActive: (location) => location.pathname.startsWith("/lunch"),
        },
        {
          id: "accounting",
          label: "会計",
          icon: "💰",
          to: "/accounting",
          allowedRoles: ["admin"],
          isActive: (location) => location.pathname.startsWith("/accounting"),
        },
      ],
    },
    {
      id: "assets",
      heading: "資産",
      items: [
        {
          id: "instruments",
          label: "楽器",
          icon: "🎷",
          to: "/instruments",
          allowedRoles: ["child", "parent", "admin"],
          isActive: (location) => location.pathname.startsWith("/instruments"),
        },
        {
          id: "scores",
          label: "楽譜",
          icon: "🎼",
          to: "/scores",
          allowedRoles: ["child", "parent", "admin"],
          isActive: (location) => location.pathname.startsWith("/scores"),
        },
        {
          id: "docs",
          label: "資料",
          icon: "📁",
          to: "/docs",
          allowedRoles: ["child", "parent", "admin"],
          isActive: (location) =>
            location.pathname === "/docs" || location.pathname.startsWith("/docs/"),
        },
        {
          id: "members",
          label: "メンバー",
          icon: "👥",
          to: "/members",
          allowedRoles: ["child", "parent", "admin"],
          isActive: (location) => location.pathname === "/members",
        },
        {
          id: "links",
          label: "リンク集",
          icon: "🔗",
          to: "/links",
          allowedRoles: ["child", "parent", "admin"],
          isActive: (location) => location.pathname === "/links",
        },
      ],
    },
    {
      id: "settings",
      heading: "設定",
      items: [
        {
          id: "settings",
          label: "設定",
          icon: "⚙️",
          to: "/today?view=settings",
          allowedRoles: ["child", "parent", "admin"],
          isActive: (location) => viewIsActive(location, "settings"),
        },
        {
          id: "members-management",
          label: "メンバー管理",
          icon: "🛠️",
          to: "/settings/members",
          allowedRoles: ["admin"],
          isActive: (location) => location.pathname === "/settings/members",
        },
      ],
    },
  ];

  return sections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => item.allowedRoles.includes(role)),
    }))
    .filter((section) => section.items.length > 0);
};

export function App() {
  const [data, setData] = useState<DemoData>(loadInitialData);
  const [authUser, setAuthUser] = useState<AuthenticatedUser | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [linkedMember, setLinkedMember] = useState<MemberRecord | null>(null);
  const [isLinkedMemberReady, setIsLinkedMemberReady] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isLogoutConfirmOpen, setIsLogoutConfirmOpen] = useState(false);
  const [activeStatusPanel, setActiveStatusPanel] = useState<"notice" | "todo" | null>(
    null,
  );
  const [noticeTab, setNoticeTab] = useState<"pending" | "history">("pending");
  const [notifications, setNotifications] = useState<DemoNotification[]>([
    { id: "n1", title: "当番可否アンケートの回答期限が近づいています", type: "actionable", read: false, resolved: false },
    { id: "n2", title: "3月の活動予定が通知されました", type: "info", read: false, resolved: true },
    { id: "n3", title: "見守り当番の調整が未完了です", type: "actionable", read: true, resolved: false },
  ]);
  const location = useLocation();
  const navigate = useNavigate();
  const today = todayDateKey();
  const activityPlanMonthKey = getActivityPlanTargetMonthKey(today);
  const currentUid = authUser?.appUid ?? "";
  const currentRole = linkedMember ? toMenuRole(linkedMember.role) : authUser?.role ?? "parent";
  const currentOperatorRole: "admin" | "parent" = currentRole === "admin" ? "admin" : "parent";
  const isAdmin = linkedMember?.role === "admin" || (!linkedMember && authUser?.role === "admin");
  const accountPrimaryName = linkedMember?.name?.trim() || authUser?.loginId || "ログイン中ユーザー";
  const accountLoginId = authUser?.loginId ?? "-";
  const accountRoleLabel = linkedMember?.role ?? authUser?.role ?? "-";
  const activityPlanStatus = readActivityPlanStatus(activityPlanMonthKey);
  const unansweredCount = readDemoUnansweredCount(activityPlanMonthKey);
  const activityPlanBadgeText =
    isAdmin && activityPlanStatus === "SURVEY_OPEN" && unansweredCount > 0
      ? `未回答 ${unansweredCount}`
      : undefined;
  const hasShiftSurveyTodo = isAdmin && activityPlanStatus === "SURVEY_OPEN" && unansweredCount > 0;
  const shiftSurveyPath = `/shift-survey?month=${activityPlanMonthKey}`;
  const visibleMenuSections = useMemo(
    () => menuSections(today, activityPlanBadgeText, currentRole),
    [today, activityPlanBadgeText, currentRole],
  );

  useEffect(() => {
    let active = true;

    const start = async () => {
      if (!auth) {
        if (active) setIsAuthReady(true);
        return;
      }

      await ensureAuthPersistence();
      if (!active) return;

      const unsubscribe = onAuthStateChanged(auth, (user) => {
        if (!active) return;
        setAuthUser(user ? toAuthenticatedUser(user) : null);
        setIsAuthReady(true);
      });

      return unsubscribe;
    };

    let cleanup: (() => void) | void;
    void start().then((unsubscribe) => {
      cleanup = unsubscribe;
    });

    return () => {
      active = false;
      cleanup?.();
    };
  }, []);

  useEffect(() => {
    if (!authUser) {
      setLinkedMember(null);
      setIsLinkedMemberReady(true);
      return;
    }

    let active = true;
    setIsLinkedMemberReady(false);

    void getMemberByAuthUid(authUser.user.uid)
      .then((member) => {
        if (!active) return;
        setLinkedMember(member);
      })
      .catch(() => {
        if (!active) return;
        setLinkedMember(null);
      })
      .finally(() => {
        if (!active) return;
        setIsLinkedMemberReady(true);
      });

    return () => {
      active = false;
    };
  }, [authUser]);

  useEffect(() => {
    if (!isMenuOpen && !activeStatusPanel) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsMenuOpen(false);
      if (event.key === "Escape") setActiveStatusPanel(null);
    };
    document.addEventListener("keydown", onKeyDown);
    const originalOverflow = document.body.style.overflow;
    if (isMenuOpen || activeStatusPanel) {
      document.body.style.overflow = "hidden";
    }
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = originalOverflow;
    };
  }, [isMenuOpen, activeStatusPanel]);

  useEffect(() => {
    if (!activeStatusPanel) return;
    setActiveStatusPanel(null);
  }, [location.key]);

  useEffect(() => {
    const updateDocumentTitle = () => {
      const rawHash = window.location.hash.startsWith("#")
        ? window.location.hash.slice(1)
        : window.location.hash;
      const [pathPart, queryPart] = rawHash.split("?");
      const pathname = pathPart || "/";
      const search = queryPart ? `?${queryPart}` : "";
      const label = resolvePageLabel(pathname, search);
      document.title = label ? `${appRuntimeConfig.appName} | ${label}` : appRuntimeConfig.appName;
    };

    updateDocumentTitle();
    window.addEventListener("hashchange", updateDocumentTitle);
    return () => window.removeEventListener("hashchange", updateDocumentTitle);
  }, [location.pathname, location.search]);

  const unreadNotificationCount = notifications.filter((item) => !item.read).length;
  const inboxTodos = useMemo(
    () =>
      sortTodos(
        data.todos.filter((todo) => todo.assigneeUid === currentUid && !todo.completed),
      ),
    [data.todos, currentUid],
  );
  const inboxTodoCount = inboxTodos.length;
  const statusButtons: Array<{ id: "notice" | "todo"; icon: string; label: string; badge: number }> = [
    { id: "notice", icon: "🔔", label: "Notices", badge: unreadNotificationCount },
    { id: "todo", icon: "✅", label: "My TODO", badge: inboxTodoCount + (hasShiftSurveyTodo ? 1 : 0) },
  ];
  const pendingNotifications = notifications.filter(
    (item) => item.type === "actionable" && !item.resolved,
  );
  const historyNotifications = notifications.filter(
    (item) => item.read || item.type === "info",
  );
  const nextDuty = {
    label: "次の当番:",
    date: "2/21(土)",
    time: "9:00-12:00",
  };
  const lunchDate = resolveLunchDate(location, today);
  const lunchPath = `/lunch?date=${lunchDate}`;

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
            mainInstructorAttendance: {},
            dutyStamps: {},
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

  const updateTodos = (updater: (prev: Todo[]) => Todo[]) => {
    setData((prev) => ({
      ...prev,
      todos: updater(prev.todos),
    }));
  };

  const updateDocs = (updater: (prev: DocMemo[]) => DocMemo[]) => {
    setData((prev) => ({
      ...prev,
      docs: updater(prev.docs),
    }));
  };

  const updatePurchaseRequests = (updater: (prev: PurchaseRequest[]) => PurchaseRequest[]) => {
    setData((prev) => ({
      ...prev,
      purchaseRequests: updater(prev.purchaseRequests),
    }));
  };

  const updateReimbursements = (updater: (prev: Reimbursement[]) => Reimbursement[]) => {
    setData((prev) => ({
      ...prev,
      reimbursements: updater(prev.reimbursements),
    }));
  };

  const updateLunchRecords = (updater: (prev: LunchRecord[]) => LunchRecord[]) => {
    setData((prev) => ({
      ...prev,
      lunchRecords: updater(prev.lunchRecords),
    }));
  };

  const updateQuoCards = (updater: (prev: QuoCard[]) => QuoCard[]) => {
    setData((prev) => ({
      ...prev,
      quoCards: updater(prev.quoCards),
    }));
  };

  const updateScores = (updater: (prev: Score[]) => Score[]) => {
    setData((prev) => ({
      ...prev,
      scores: updater(prev.scores),
    }));
  };

  const updateInstruments = (updater: (prev: Instrument[]) => Instrument[]) => {
    setData((prev) => ({
      ...prev,
      instruments: updater(prev.instruments),
    }));
  };

  if (!isAuthReady) {
    return (
      <div className="auth-screen">
        <section className="auth-card">
          <p className="auth-eyebrow">{appRuntimeConfig.appName}</p>
          <h1>認証を確認しています</h1>
          <p className="muted">ログイン状態を読み込んでいます。</p>
        </section>
      </div>
    );
  }

  if (!authUser) {
    return <LoginScreen />;
  }

  if (!isLinkedMemberReady) {
    return (
      <div className="auth-screen">
        <section className="auth-card">
          <p className="auth-eyebrow">{appRuntimeConfig.appName}</p>
          <h1>メンバー情報を確認しています</h1>
          <p className="muted">Firestore 上の members との紐付けを確認しています。</p>
        </section>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <Link to="/today" className="brand">
          <picture>
            <source srcSet="/assets/logo/logo-windoms.svg" type="image/svg+xml" />
            <img
              className="app-logo"
              src="/assets/logo/logo-windoms.png"
              alt="Windoms"
            />
          </picture>
        </Link>
        <div className="header-actions">
          <div className="next-duty" aria-label={`${nextDuty.label} ${nextDuty.date} ${nextDuty.time}`}>
            <span className="next-duty-label">{nextDuty.label}</span>
            <span className="next-duty-date">{nextDuty.date}</span>
            <span className="next-duty-time">{nextDuty.time}</span>
          </div>
          <button
            type="button"
            className="status-icon-button"
            aria-label="お弁当"
            onClick={() => navigate(lunchPath)}
          >
            <span className="status-icon-emoji" aria-hidden="true">
              🍱
            </span>
          </button>
          {statusButtons.map((item) => {
            const isActive = activeStatusPanel === item.id;
            return (
              <button
                key={item.id}
                type="button"
                className={`status-icon-button ${isActive ? "active" : ""}`}
                aria-label={item.label}
                onClick={() => {
                  if (item.id === "notice") setNoticeTab("pending");
                  setActiveStatusPanel((prev) => (prev === item.id ? null : item.id));
                }}
              >
                <span className="status-icon-emoji" aria-hidden="true">
                  {item.icon}
                </span>
                <span className="status-icon-badge" aria-hidden="true">
                  {item.badge}
                </span>
              </button>
            );
          })}
          <button
            type="button"
            className="menu-trigger"
            aria-label="メニューを開く"
            onClick={() => {
              setActiveStatusPanel(null);
              setIsMenuOpen(true);
            }}
          >
            ☰
          </button>
        </div>
      </header>
      <main className="page-wrap">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route
            path="/today"
            element={
              <TodayPage
                data={context.data}
                updateDayLog={context.updateDayLog}
                currentUid={currentUid}
                updateTodos={updateTodos}
              />
            }
          />
          <Route path="/calendar" element={<CalendarPage data={context.data} />} />
          <Route
            path="/activity-plan"
            element={isAdmin ? <ActivityPlanPage /> : <Navigate to="/today" replace />}
          />
          <Route path="/attendance" element={<AttendancePage />} />
          <Route path="/watch" element={<WatchPage />} />
          <Route path="/shift-survey" element={isAdmin ? <ShiftSurveyPage /> : <Navigate to="/today" replace />} />
          <Route
            path="/lunch"
            element={
              <LunchPage
                data={data}
                currentUid={currentUid}
                demoRole={currentOperatorRole}
                updateLunchRecords={updateLunchRecords}
                updateReimbursements={updateReimbursements}
                updateQuoCards={updateQuoCards}
              />
            }
          />
          <Route
            path="/events"
            element={<EventsPage data={data} currentUid={currentUid} updateTodos={updateTodos} menuRole={currentRole} />}
          />
          <Route
            path="/events/:eventId"
            element={<EventsPage data={data} currentUid={currentUid} updateTodos={updateTodos} menuRole={currentRole} />}
          />
          <Route
            path="/todos"
            element={<TodosPage data={data} currentUid={currentUid} updateTodos={updateTodos} />}
          />
          <Route path="/docs" element={<DocsListPage data={data} updateDocs={updateDocs} />} />
          <Route path="/docs/new" element={<DocsEditorPage data={data} updateDocs={updateDocs} mode="new" />} />
          <Route path="/docs/:id" element={<DocsDetailPage data={data} updateDocs={updateDocs} />} />
          <Route path="/docs/:id/edit" element={<DocsEditorPage data={data} updateDocs={updateDocs} mode="edit" />} />
          <Route
            path="/purchases"
            element={
              <PurchasesPage
                data={data}
                currentUid={currentUid}
                demoRole={currentOperatorRole}
                updatePurchaseRequests={updatePurchaseRequests}
                updateReimbursements={updateReimbursements}
              />
            }
          />
          <Route
            path="/reimbursements"
            element={
              <ReimbursementsPage
                data={data}
                currentUid={currentUid}
                demoRole={currentOperatorRole}
                updateReimbursements={updateReimbursements}
              />
            }
          />
          <Route
            path="/instruments"
            element={<InstrumentsPage data={data} updateInstruments={updateInstruments} />}
          />
          <Route
            path="/scores"
            element={
              <ScorePage
                data={data}
                updateScores={updateScores}
                isAdmin={isAdmin}
              />
            }
          />
          <Route path="/links" element={<LinksPage menuRole={currentRole} />} />
          <Route path="/members" element={<MemberDirectoryPage />} />
          <Route
            path="/settings/members"
            element={isAdmin ? <MembersManagementPage /> : <Navigate to="/today" replace />}
          />
          <Route path="/accounting" element={isAdmin ? <AccountingHome /> : <Navigate to="/today" replace />} />
          <Route path="/accounting/ledger" element={isAdmin ? <AccountLedger /> : <Navigate to="/today" replace />} />
          <Route path="/accounting/report" element={isAdmin ? <AccountingReport /> : <Navigate to="/today" replace />} />
          <Route
            path="/accounting/periods"
            element={isAdmin ? <AccountingPeriods canManageYear={isAdmin} /> : <Navigate to="/today" replace />}
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
      {isMenuOpen && (
        <div className="menu-overlay" onClick={() => setIsMenuOpen(false)}>
          <div className="menu-panel">
            <div className="menu-content">
              <button
                type="button"
                className="menu-close"
                aria-label="閉じる" title="閉じる"
                onClick={() => setIsMenuOpen(false)}
              >
                ×
              </button>
              <button
                type="button"
                className="menu-today-header"
                onClick={() => {
                  setIsMenuOpen(false);
                  navigate("/today");
                }}
              >
                <span className="menu-today-date">{formatDateYmd(today)}</span>
                <span className={`menu-today-weekday ${weekdayTone(today)}`}>（{formatWeekdayJa(today)}）</span>
              </button>
              <div className="menu-sections">
                {visibleMenuSections.map((section) => (
                  <section key={section.id} className="menu-section">
                    <h2 className="menu-section-title">{section.heading}</h2>
                    <div className="menu-grid">
                      {section.items.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          className={`menu-item ${item.isActive(location) ? "active" : ""}`}
                          onClick={() => {
                            setIsMenuOpen(false);
                            navigate(item.to);
                          }}
                        >
                          <span className="menu-item-icon" aria-hidden="true">
                            {item.icon}
                          </span>
                          <span className="menu-item-label">{item.label}</span>
                          {item.badgeText && <span className="menu-item-badge">{item.badgeText}</span>}
                        </button>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
              <section className="menu-account-panel">
                <div className="menu-account-meta">
                  <strong className="menu-account-name">{accountPrimaryName}</strong>
                  <span className="menu-account-sub">loginId: {accountLoginId}</span>
                  <span className="menu-account-sub">role: {accountRoleLabel}</span>
                </div>
                <div className="menu-account-actions">
                  <button
                    type="button"
                    className="button button-small button-secondary"
                    onClick={() => setIsLogoutConfirmOpen(true)}
                  >
                    ログアウト
                  </button>
                </div>
              </section>
            </div>
          </div>
        </div>
      )}
      {isLogoutConfirmOpen && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" onClick={() => setIsLogoutConfirmOpen(false)}>
          <section className="modal-panel events-delete-modal" onClick={(event) => event.stopPropagation()}>
            <button
              type="button"
              className="modal-close"
              aria-label="閉じる"
              title="閉じる"
              onClick={() => setIsLogoutConfirmOpen(false)}
            >
              ×
            </button>
            <h3>ログアウトしますか？</h3>
            <div className="modal-actions">
              <button type="button" className="button button-secondary" onClick={() => setIsLogoutConfirmOpen(false)}>
                キャンセル
              </button>
              <button
                type="button"
                className="button"
                onClick={() => {
                  if (!auth) return;
                  setIsLogoutConfirmOpen(false);
                  setIsMenuOpen(false);
                  void signOut(auth);
                }}
              >
                ログアウト
              </button>
            </div>
          </section>
        </div>
      )}
      {activeStatusPanel && (
        <div className="status-panel-overlay" onClick={() => setActiveStatusPanel(null)}>
          <section className="status-panel" onClick={(event) => event.stopPropagation()}>
            <button
              type="button"
              className="status-panel-close"
              aria-label="閉じる" title="閉じる"
              onClick={() => setActiveStatusPanel(null)}
            >
              ×
            </button>
            {activeStatusPanel === "notice" && (
              <>
                <p className="status-panel-subtitle">システム通知</p>
                <h2 className="status-panel-title">通知センター</h2>
                <div className="status-panel-tabs">
                  <button
                    type="button"
                    className={`status-panel-tab ${noticeTab === "pending" ? "active" : ""}`}
                    onClick={() => setNoticeTab("pending")}
                  >
                    未処理
                  </button>
                  <button
                    type="button"
                    className={`status-panel-tab ${noticeTab === "history" ? "active" : ""}`}
                    onClick={() => setNoticeTab("history")}
                  >
                    履歴
                  </button>
                </div>
                <ul className="status-panel-list">
                  {(noticeTab === "pending" ? pendingNotifications : historyNotifications).map((item) => (
                    <li
                      key={item.id}
                      className="status-notice-row"
                      onClick={() =>
                        setNotifications((prev) =>
                          prev.map((notice) =>
                            notice.id === item.id ? { ...notice, read: true } : notice,
                          ),
                        )
                      }
                    >
                      <span className={item.read ? "" : "status-unread"}>
                        {item.title}
                        {!item.read && <span className="status-new-tag">NEW</span>}
                      </span>
                      {item.type === "actionable" && !item.resolved && (
                        <button
                          type="button"
                          className="button button-small"
                          onClick={(event) => {
                            event.stopPropagation();
                            setNotifications((prev) =>
                              prev.map((notice) =>
                                notice.id === item.id ? { ...notice, resolved: true, read: true } : notice,
                              ),
                            );
                          }}
                        >
                          解消
                        </button>
                      )}
                    </li>
                  ))}
                  {noticeTab === "pending" && pendingNotifications.length === 0 && <li>未処理通知はありません</li>}
                  {noticeTab === "history" && historyNotifications.length === 0 && <li>履歴はありません</li>}
                </ul>
              </>
            )}
            {activeStatusPanel === "todo" && (
              <>
                <p className="status-panel-subtitle">自分の受信箱</p>
                <h2 className="status-panel-title">TODO受信箱</h2>
                <div className="status-todo-section">
                  <h3>未完了（自分担当）</h3>
                  <ul className="status-panel-list">
                    {inboxTodos.map((item) => {
                      const related = resolveTodoRelatedSummary(data, item);
                      const relatedPath = related.to;
                      return (
                        <li key={item.id} className="status-inbox-row">
                          <div className="status-inbox-main">
                            <strong>{item.title}</strong>
                            <span className="status-inbox-meta">期限: {item.dueDate ?? "—"}</span>
                            <span className="status-inbox-meta">
                              {related.to ? (
                                <button
                                  type="button"
                                  className="status-inline-link"
                                  onClick={() => {
                                    if (!relatedPath) return;
                                    setActiveStatusPanel(null);
                                    navigate(relatedPath);
                                  }}
                                >
                                  {related.label}
                                </button>
                              ) : (
                                related.label
                              )}
                            </span>
                          </div>
                          <button
                            type="button"
                            className="button button-small button-secondary"
                            onClick={() =>
                              updateTodos((prev) =>
                                prev.map((todo) =>
                                  todo.id === item.id ? { ...todo, completed: true } : todo,
                                ),
                              )
                            }
                          >
                            完了
                          </button>
                        </li>
                      );
                    })}
                    {inboxTodos.length === 0 && <li>受信箱のTODOはありません</li>}
                  </ul>
                  <div className="modal-actions">
                    <button
                      type="button"
                      className="button button-small"
                      onClick={() => {
                        setActiveStatusPanel(null);
                        navigate("/todos");
                      }}
                    >
                      TODOページを開く
                    </button>
                  </div>
                </div>
                {hasShiftSurveyTodo && (
                  <div className="status-todo-section">
                    <h3>アンケート</h3>
                    <ul className="status-panel-list">
                      <li>
                        <span>当番可否アンケートに回答してください（未回答 {unansweredCount} 件）</span>
                        <button
                          type="button"
                          className="button button-small"
                          onClick={() => {
                            setActiveStatusPanel(null);
                            navigate(shiftSurveyPath);
                          }}
                        >
                          回答する
                        </button>
                      </li>
                    </ul>
                  </div>
                )}
              </>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
