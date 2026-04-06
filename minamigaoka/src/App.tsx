import { Link, Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { useCallback, useEffect, useMemo, useState } from "react";
import { HomePage } from "./pages/HomePage";
import { TodayPage } from "./pages/TodayPage";
import { CalendarPage } from "./pages/CalendarPage";
import { LogPage } from "./pages/LogPage";
import { LogsListPage } from "./pages/LogsListPage";
import { ActivityPlanPage } from "./pages/ActivityPlanPage";
import { AttendancePage } from "./pages/AttendancePage";
import { WatchPage } from "./pages/WatchPage";
import { ShiftSurveyPage } from "./pages/ShiftSurveyPage";
import { LunchPage } from "./pages/LunchPage";
import { FeesPage } from "./pages/FeesPage";
import { LinksPage } from "./pages/LinksPage";
import { MemberDirectoryPage } from "./pages/MemberDirectoryPage";
import { MembersManagementPage } from "./pages/MembersPage";
import { ModuleSettingsPage } from "./pages/ModuleSettingsPage";
import { SettingsPage } from "./pages/SettingsPage";
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
import { SystemNotificationsPage } from "./pages/SystemNotificationsPage";
import { onAuthStateChanged, signOut } from "firebase/auth";
import type {
  DayLog,
  DemoData,
  DemoRsvp,
  EventRecord,
  Score,
  Todo,
} from "./types";
import { formatDateYmd, formatTimeNoLeadingZero, formatWeekdayJa, todayDateKey, weekdayTone } from "./utils/date";
import {
  canViewSharedTodo,
  getVisibleSharedScopesForRole,
  resolveTodoAudienceRole,
  resolveTodoRelatedSummary,
  sortTodos,
} from "./utils/todoUtils";
import {
  getActivityPlanTargetMonthKey,
  readActivityPlanStatus,
  readDemoUnansweredCount,
} from "./utils/activityPlan";
import { LoginScreen } from "./components/LoginScreen";
import { auth, ensureAuthPersistence, hasFirebaseAppConfig } from "./config/firebase";
import { siteConfig } from "./config/site";
import { toAuthenticatedUser, type AuthenticatedUser } from "./auth/session";
import { LinkifiedText } from "./components/LinkifiedText";
import { loadInitialData } from "./data/runtimeData";
import { getMemberByAuthUid } from "./members/service";
import type { MemberRecord, MemberRole } from "./members/types";
import { canManageCalendarSessions as canManageCalendarSessionsByMember } from "./members/permissions";
import {
  canAccessModuleBySettings,
  menuModuleDefinitions,
  sanitizeModuleVisibilitySettings,
  type DemoMenuRole,
  type ModuleMenuId,
  type ModuleVisibilitySettings,
} from "./modules/menuVisibility";
import { subscribeModuleVisibilitySettings } from "./modules/moduleVisibilityService";
import {
  createEvent as createFirestoreEvent,
  deleteEvent as deleteFirestoreEvent,
  saveEvent as saveFirestoreEvent,
  subscribeEvents,
} from "./events/service";
import {
  ensureDayLog as ensureFirestoreDayLog,
  saveDayLog as saveFirestoreDayLog,
  saveSessionRsvps as saveFirestoreSessionRsvps,
  subscribeDayLogs,
} from "./journal/service";
import type { SaveAttendanceEntry } from "./attendance/service";
import { subscribeScheduleDays } from "./schedule/service";
import { saveScore as saveFirestoreScore, subscribeScores } from "./scores/service";
import {
  createInstrument as createFirestoreInstrument,
  deleteInstrument as deleteFirestoreInstrument,
  saveInstrument as saveFirestoreInstrument,
  subscribeInstruments,
} from "./instruments/service";
import {
  createTodo as createFirestoreTodo,
  deleteTodo as deleteFirestoreTodo,
  saveTodo as saveFirestoreTodo,
  subscribeTodos,
} from "./todos/service";
import {
  completePurchaseRequest as completeFirestorePurchaseRequest,
  createLunchRecord as createFirestoreLunchRecord,
  createPurchaseRequest as createFirestorePurchaseRequest,
  createReimbursement as createFirestoreReimbursement,
  deleteLunchRecord as deleteFirestoreLunchRecord,
  deletePurchaseRequest as deleteFirestorePurchaseRequest,
  deleteReimbursement as deleteFirestoreReimbursement,
  markReimbursementPaid as markFirestoreReimbursementPaid,
  saveLunchRecord as saveFirestoreLunchRecord,
  savePurchaseRequest as saveFirestorePurchaseRequest,
  saveReimbursement as saveFirestoreReimbursement,
  subscribeLunchRecords,
  subscribePurchaseRequests,
  subscribeReimbursements,
} from "./operations/service";
import {
  markNotificationAsRead,
  reopenNotification,
  resolveNotification,
  subscribeUserNotifications,
} from "./notifications/service";
import type { UserNotificationRecord } from "./notifications/types";

type MenuItem = {
  id: ModuleMenuId;
  label: string;
  icon: string;
  to: string;
  badgeText?: string;
  isActive: (location: { pathname: string; search: string }) => boolean;
};

type MenuSection = {
  id: string;
  heading: string;
  items: MenuItem[];
};

const toMenuRole = (role: MemberRole | "parent" | "admin"): DemoMenuRole => {
  if (role === "admin") return "admin";
  if (role === "child") return "child";
  return "parent";
};

const viewIsActive = (location: { pathname: string; search: string }, view: string) =>
  location.pathname === "/today" && new URLSearchParams(location.search).get("view") === view;

const toFamilyName = (value?: string): string => {
  const name = (value ?? "").trim();
  if (!name || name === "-") return "";
  if (name.includes(" ")) return name.split(" ")[0] || "";
  if (name.includes("　")) return name.split("　")[0] || "";
  return name.endsWith("家") ? name.slice(0, -1) : name;
};

const formatShortDateWithWeekday = (dateKey: string): string => {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  const weekday = date.toLocaleDateString("ja-JP", { weekday: "short" });
  return `${month}/${String(day).padStart(2, "0")}(${weekday})`;
};

const formatNotificationDateTime = (value: unknown): string => {
  if (!value) return "-";
  if (typeof value === "object" && value !== null && "toDate" in value) {
    const date = (value as { toDate?: () => Date }).toDate?.();
    if (date instanceof Date && !Number.isNaN(date.getTime())) {
      return date.toLocaleString("ja-JP", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });
    }
  }
  const date = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const isParentHeaderTarget = (
  member: MemberRecord | null,
  authRole?: AuthenticatedUser["role"],
): boolean => {
  if (member) {
    return member.memberTypes.includes("parent") || member.role === "parent" || member.role === "officer";
  }
  return authRole === "parent" || authRole === "admin";
};

const resolvePageLabel = (pathname: string, search: string): string | null => {
  if (pathname === "/settings") return "設定";
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
  if (pathname === "/logs" || pathname.startsWith("/logs/")) return "当番日誌";
  if (pathname === "/attendance") return "\u51fa\u6b20";
  if (pathname === "/todos") return "TODO";
  if (pathname === "/events" || pathname.startsWith("/events/")) return "イベント";
  if (pathname === "/activity-plan" || pathname === "/shift-survey") return "シフト作成";
  if (pathname === "/purchases") return "購入依頼";
  if (pathname === "/reimbursements") return "立替";
  if (pathname.startsWith("/lunch")) return "お弁当";
  if (pathname === "/dues") return "会費管理";
  if (pathname === "/accounting" || pathname.startsWith("/accounting/")) return "会計";
  if (pathname === "/instruments") return "楽器";
  if (pathname === "/scores") return "楽譜";
  if (pathname === "/docs" || pathname.startsWith("/docs/")) return "資料";
  if (pathname === "/members") return "メンバー";
  if (pathname === "/settings/members") return "メンバー管理";
  if (pathname === "/settings/modules") return "モジュール管理";
  if (pathname === "/settings/system-notifications") return "システム通知";
  if (pathname === "/links") return "リンク集";
  return null;
};

const menuSections = (
  activityPlanBadgeText: string | undefined,
  linkedMember: MemberRecord | null,
  moduleVisibilitySettings: ModuleVisibilitySettings,
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
          isActive: (location) => location.pathname === "/today" && !location.search,
        },
        {
          id: "calendar",
          label: "カレンダー",
          icon: "🗓️",
          to: "/calendar",
          isActive: (location) => location.pathname === "/calendar",
        },
        {
          id: "attendance",
          label: "\u51fa\u6b20",
          icon: "\u2611\uFE0F",
          to: "/attendance",
          isActive: (location) => location.pathname === "/attendance",
        },
        {
          id: "duty-log",
          label: "当番日誌",
          icon: "📝",
          to: "/logs",
          isActive: (location) => location.pathname === "/logs" || location.pathname.startsWith("/logs/"),
        },
        {
          id: "practice-log",
          label: "練習日誌",
          icon: "✍️",
          to: "/today?view=practice-log",
          isActive: (location) => viewIsActive(location, "practice-log"),
        },
        {
          id: "homework",
          label: "宿題",
          icon: "📘",
          to: "/today?view=homework",
          isActive: (location) => viewIsActive(location, "homework"),
        },
        {
          id: "todo",
          label: "TODO",
          icon: "✅",
          to: "/todos",
          isActive: (location) => location.pathname === "/todos",
        },
        {
          id: "event",
          label: "イベント",
          icon: "🎪",
          to: "/events",
          isActive: (location) => location.pathname.startsWith("/events"),
        },
        {
          id: "shift-create",
          label: "シフト作成",
          icon: "🧭",
          to: "/activity-plan",
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
          isActive: (location) => location.pathname.startsWith("/purchases"),
        },
        {
          id: "reimbursement",
          label: "立替",
          icon: "🧾",
          to: "/reimbursements",
          isActive: (location) => location.pathname.startsWith("/reimbursements"),
        },
        {
          id: "lunch",
          label: "お弁当",
          icon: "🍱",
          to: "/lunch",
          isActive: (location) => location.pathname.startsWith("/lunch"),
        },
        {
          id: "dues",
          label: "会費管理",
          icon: "◉",
          to: "/dues",
          isActive: (location) => location.pathname.startsWith("/dues"),
        },
        {
          id: "accounting",
          label: "会計",
          icon: "💰",
          to: "/accounting",
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
          isActive: (location) => location.pathname.startsWith("/instruments"),
        },
        {
          id: "scores",
          label: "楽譜",
          icon: "🎼",
          to: "/scores",
          isActive: (location) => location.pathname.startsWith("/scores"),
        },
        {
          id: "docs",
          label: "資料",
          icon: "📁",
          to: "/docs",
          isActive: (location) =>
            location.pathname === "/docs" || location.pathname.startsWith("/docs/"),
        },
        {
          id: "members",
          label: "メンバー",
          icon: "👥",
          to: "/members",
          isActive: (location) => location.pathname === "/members",
        },
        {
          id: "links",
          label: "リンク集",
          icon: "🔗",
          to: "/links",
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
          to: "/settings",
          isActive: (location) => location.pathname === "/settings",
        },
        {
          id: "members-management",
          label: "メンバー管理",
          icon: "🛠️",
          to: "/settings/members",
          isActive: (location) => location.pathname === "/settings/members",
        },
        {
          id: "module-management",
          label: "モジュール管理",
          icon: "🧩",
          to: "/settings/modules",
          isActive: (location) => location.pathname === "/settings/modules",
        },
        {
          id: "system-notifications",
          label: "システム通知",
          icon: "🔔",
          to: "/settings/system-notifications",
          isActive: (location) => location.pathname === "/settings/system-notifications",
        },
      ],
    },
  ];

  const moduleDefinitionsById = menuModuleDefinitions.reduce<Record<string, (typeof menuModuleDefinitions)[number]>>(
    (result, definition) => {
      result[definition.id] = definition;
      return result;
    },
    {},
  );

  return sections
    .map((section) => ({
      ...section,
      items: section.items.filter(
        (item) =>
          canAccessModuleBySettings(item.id, linkedMember, moduleVisibilitySettings) &&
          moduleDefinitionsById[item.id] !== undefined,
      ),
    }))
    .filter((section) => section.items.length > 0);
};

export function App() {
  const [data, setData] = useState<DemoData>(() => {
    const initialData = loadInitialData();
    return {
      ...initialData,
      scheduleDays: {},
      dayLogs: {},
      todos: hasFirebaseAppConfig ? [] : initialData.todos,
      purchaseRequests: [],
      reimbursements: [],
      lunchRecords: [],
      instruments: hasFirebaseAppConfig ? [] : initialData.instruments,
    };
  });
  const [authUser, setAuthUser] = useState<AuthenticatedUser | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [linkedMember, setLinkedMember] = useState<MemberRecord | null>(null);
  const [isLinkedMemberReady, setIsLinkedMemberReady] = useState(false);
  const [moduleVisibilitySettings, setModuleVisibilitySettings] = useState<ModuleVisibilitySettings>(() =>
    sanitizeModuleVisibilitySettings(undefined),
  );
  const [isScoresLoading, setIsScoresLoading] = useState(true);
  const [scoresLoadError, setScoresLoadError] = useState("");
  const [isInstrumentsLoading, setIsInstrumentsLoading] = useState(hasFirebaseAppConfig);
  const [instrumentsLoadError, setInstrumentsLoadError] = useState("");
  const [isPurchaseRequestsLoading, setIsPurchaseRequestsLoading] = useState(hasFirebaseAppConfig);
  const [purchaseRequestsLoadError, setPurchaseRequestsLoadError] = useState("");
  const [isReimbursementsLoading, setIsReimbursementsLoading] = useState(hasFirebaseAppConfig);
  const [reimbursementsLoadError, setReimbursementsLoadError] = useState("");
  const [isLunchRecordsLoading, setIsLunchRecordsLoading] = useState(hasFirebaseAppConfig);
  const [lunchRecordsLoadError, setLunchRecordsLoadError] = useState("");
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [menuHeaderToast, setMenuHeaderToast] = useState("");
  const [isLogoutConfirmOpen, setIsLogoutConfirmOpen] = useState(false);
  const [activeStatusPanel, setActiveStatusPanel] = useState<"notice" | "todo" | null>(
    null,
  );
  const [selectedNotificationId, setSelectedNotificationId] = useState<string | null>(null);
  const [selectedInboxTodoId, setSelectedInboxTodoId] = useState<string | null>(null);
  const [noticeTab, setNoticeTab] = useState<"active" | "resolved">("active");
  const [notifications, setNotifications] = useState<UserNotificationRecord[]>([]);
  const [isNotificationsLoading, setIsNotificationsLoading] = useState(hasFirebaseAppConfig);
  const [notificationsLoadError, setNotificationsLoadError] = useState("");
  const location = useLocation();
  const navigate = useNavigate();
  const today = todayDateKey();
  const activityPlanMonthKey = getActivityPlanTargetMonthKey(today);
  const currentUid = authUser?.appUid ?? "";
  const currentNotificationUid = authUser?.user.uid ?? "";
  const currentRole = linkedMember ? toMenuRole(linkedMember.role) : authUser?.role ?? "parent";
  const currentOperatorRole: "admin" | "parent" = currentRole === "admin" ? "admin" : "parent";
  const isAdmin = linkedMember?.role === "admin" || (!linkedMember && authUser?.role === "admin");
  const canManageAccounting =
    isAdmin || linkedMember?.staffPermissions.includes("accounting") === true;
  const canManageCalendarSessions =
    isAdmin || canManageCalendarSessionsByMember(linkedMember);
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
    () => menuSections(activityPlanBadgeText, linkedMember, moduleVisibilitySettings),
    [activityPlanBadgeText, linkedMember, moduleVisibilitySettings],
  );
  const currentPageLabel = resolvePageLabel(location.pathname, location.search) ?? siteConfig.productName;
  const canUseNativeShare =
    typeof navigator !== "undefined" && typeof navigator.share === "function";

  useEffect(() => subscribeModuleVisibilitySettings(setModuleVisibilitySettings), []);

  useEffect(() => {
    if (!hasFirebaseAppConfig || !currentNotificationUid) {
      setNotifications([]);
      setNotificationsLoadError("");
      setIsNotificationsLoading(false);
      return undefined;
    }
    setIsNotificationsLoading(true);
    setNotificationsLoadError("");
    return subscribeUserNotifications(
      currentNotificationUid,
      (rows) => {
        setNotifications(rows);
        setIsNotificationsLoading(false);
      },
      (message) => {
        setNotificationsLoadError(message);
        setIsNotificationsLoading(false);
      },
    );
  }, [currentNotificationUid]);

  useEffect(() => {
    if (!menuHeaderToast) return undefined;
    const timer = window.setTimeout(() => setMenuHeaderToast(""), 2200);
    return () => window.clearTimeout(timer);
  }, [menuHeaderToast]);

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
    if (!hasFirebaseAppConfig) {
      return undefined;
    }

    try {
      return subscribeTodos(
        (todos) => {
          setData((prev) => ({
            ...prev,
            todos,
          }));
        },
        () => {
          setData((prev) => ({
            ...prev,
            todos: [],
          }));
        },
      );
    } catch {
      setData((prev) => ({
        ...prev,
        todos: [],
      }));
      return undefined;
    }
  }, []);

  useEffect(() => {
    if (!hasFirebaseAppConfig) {
      return undefined;
    }

    try {
      return subscribeEvents(
        (events) => {
          setData((prev) => ({
            ...prev,
            events,
          }));
        },
        () => {
          setData((prev) => ({
            ...prev,
            events: [],
          }));
        },
      );
    } catch {
      setData((prev) => ({
        ...prev,
        events: [],
      }));
      return undefined;
    }
  }, []);

  useEffect(() => {
    if (!hasFirebaseAppConfig) {
      setData((prev) => ({
        ...prev,
        scheduleDays: {},
      }));
      return undefined;
    }

    try {
      return subscribeScheduleDays(
        (scheduleDays) => {
          setData((prev) => ({
            ...prev,
            scheduleDays,
          }));
        },
        () => {
          setData((prev) => ({
            ...prev,
            scheduleDays: {},
          }));
        },
      );
    } catch {
      setData((prev) => ({
        ...prev,
        scheduleDays: {},
      }));
      return undefined;
    }
  }, []);

  useEffect(() => {
    if (!hasFirebaseAppConfig) {
      setData((prev) => ({
        ...prev,
        dayLogs: {},
      }));
      return undefined;
    }

    try {
      return subscribeDayLogs(
        (dayLogs) => {
          setData((prev) => ({
            ...prev,
            dayLogs,
          }));
        },
        () => {
          setData((prev) => ({
            ...prev,
            dayLogs: {},
          }));
        },
      );
    } catch {
      setData((prev) => ({
        ...prev,
        dayLogs: {},
      }));
      return undefined;
    }
  }, []);

  useEffect(() => {
    if (!hasFirebaseAppConfig) {
      setData((prev) => ({
        ...prev,
        scores: [],
      }));
      setIsScoresLoading(false);
      setScoresLoadError("Firebase 設定が未完了のため、楽譜データを読み込めません。");
      return undefined;
    }

    setIsScoresLoading(true);
    setScoresLoadError("");

    try {
      return subscribeScores(
        (scores) => {
          setData((prev) => ({
            ...prev,
            scores,
          }));
          setIsScoresLoading(false);
          setScoresLoadError("");
        },
        () => {
          setData((prev) => ({
            ...prev,
            scores: [],
          }));
          setIsScoresLoading(false);
          setScoresLoadError("楽譜データの読み込みに失敗しました。");
        },
      );
    } catch {
      setData((prev) => ({
        ...prev,
        scores: [],
      }));
      setIsScoresLoading(false);
      setScoresLoadError("楽譜データの読み込みに失敗しました。");
      return undefined;
    }
  }, []);

  useEffect(() => {
    if (!hasFirebaseAppConfig) {
      setData((prev) => ({
        ...prev,
        instruments: [],
      }));
      setIsInstrumentsLoading(false);
      setInstrumentsLoadError("Firebase 設定が未完了のため、楽器データを読み込めません。");
      return undefined;
    }

    setIsInstrumentsLoading(true);
    setInstrumentsLoadError("");

    try {
      return subscribeInstruments(
        (instruments) => {
          setData((prev) => ({
            ...prev,
            instruments,
          }));
          setIsInstrumentsLoading(false);
          setInstrumentsLoadError("");
        },
        () => {
          setData((prev) => ({
            ...prev,
            instruments: [],
          }));
          setIsInstrumentsLoading(false);
          setInstrumentsLoadError("楽器データの読み込みに失敗しました。");
        },
      );
    } catch {
      setData((prev) => ({
        ...prev,
        instruments: [],
      }));
      setIsInstrumentsLoading(false);
      setInstrumentsLoadError("楽器データの読み込みに失敗しました。");
      return undefined;
    }
  }, []);

  useEffect(() => {
    if (!hasFirebaseAppConfig) {
      setData((prev) => ({
        ...prev,
        purchaseRequests: [],
      }));
      setIsPurchaseRequestsLoading(false);
      setPurchaseRequestsLoadError("Firebase 設定が未完了のため、購入依頼を読み込めません。");
      return undefined;
    }

    setIsPurchaseRequestsLoading(true);
    setPurchaseRequestsLoadError("");

    try {
      return subscribePurchaseRequests(
        (purchaseRequests) => {
          setData((prev) => ({
            ...prev,
            purchaseRequests,
          }));
          setIsPurchaseRequestsLoading(false);
          setPurchaseRequestsLoadError("");
        },
        () => {
          setData((prev) => ({
            ...prev,
            purchaseRequests: [],
          }));
          setIsPurchaseRequestsLoading(false);
          setPurchaseRequestsLoadError("購入依頼の読み込みに失敗しました。");
        },
      );
    } catch {
      setData((prev) => ({
        ...prev,
        purchaseRequests: [],
      }));
      setIsPurchaseRequestsLoading(false);
      setPurchaseRequestsLoadError("購入依頼の読み込みに失敗しました。");
      return undefined;
    }
  }, []);

  useEffect(() => {
    if (!hasFirebaseAppConfig) {
      setData((prev) => ({
        ...prev,
        reimbursements: [],
      }));
      setIsReimbursementsLoading(false);
      setReimbursementsLoadError("Firebase 設定が未完了のため、立替を読み込めません。");
      return undefined;
    }

    setIsReimbursementsLoading(true);
    setReimbursementsLoadError("");

    try {
      return subscribeReimbursements(
        (reimbursements) => {
          setData((prev) => ({
            ...prev,
            reimbursements,
          }));
          setIsReimbursementsLoading(false);
          setReimbursementsLoadError("");
        },
        () => {
          setData((prev) => ({
            ...prev,
            reimbursements: [],
          }));
          setIsReimbursementsLoading(false);
          setReimbursementsLoadError("立替の読み込みに失敗しました。");
        },
      );
    } catch {
      setData((prev) => ({
        ...prev,
        reimbursements: [],
      }));
      setIsReimbursementsLoading(false);
      setReimbursementsLoadError("立替の読み込みに失敗しました。");
      return undefined;
    }
  }, []);

  useEffect(() => {
    if (!hasFirebaseAppConfig) {
      setData((prev) => ({
        ...prev,
        lunchRecords: [],
      }));
      setIsLunchRecordsLoading(false);
      setLunchRecordsLoadError("Firebase 設定が未完了のため、お弁当を読み込めません。");
      return undefined;
    }

    setIsLunchRecordsLoading(true);
    setLunchRecordsLoadError("");

    try {
      return subscribeLunchRecords(
        (lunchRecords) => {
          setData((prev) => ({
            ...prev,
            lunchRecords,
          }));
          setIsLunchRecordsLoading(false);
          setLunchRecordsLoadError("");
        },
        () => {
          setData((prev) => ({
            ...prev,
            lunchRecords: [],
          }));
          setIsLunchRecordsLoading(false);
          setLunchRecordsLoadError("お弁当の読み込みに失敗しました。");
        },
      );
    } catch {
      setData((prev) => ({
        ...prev,
        lunchRecords: [],
      }));
      setIsLunchRecordsLoading(false);
      setLunchRecordsLoadError("お弁当の読み込みに失敗しました。");
      return undefined;
    }
  }, []);

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
    if (activeStatusPanel === "todo") return;
    setSelectedInboxTodoId(null);
  }, [activeStatusPanel]);

  useEffect(() => {
    const updateDocumentTitle = () => {
      const rawHash = window.location.hash.startsWith("#")
        ? window.location.hash.slice(1)
        : window.location.hash;
      const [pathPart, queryPart] = rawHash.split("?");
      const pathname = pathPart || "/";
      const search = queryPart ? `?${queryPart}` : "";
      const label = resolvePageLabel(pathname, search);
      document.title = label ? `${label} | ${siteConfig.documentTitle}` : siteConfig.documentTitle;
    };

    updateDocumentTitle();
    window.addEventListener("hashchange", updateDocumentTitle);
    return () => window.removeEventListener("hashchange", updateDocumentTitle);
  }, [location.pathname, location.search]);

  const activeNotificationCount = notifications.filter((item) => item.status === "active").length;
  const selfTodoKeys = useMemo(
    () =>
      new Set(
        [currentUid, linkedMember?.id, linkedMember?.authUid]
          .filter((value): value is string => Boolean(value && value.trim()))
          .map((value) => value.trim()),
      ),
    [currentUid, linkedMember],
  );
  const todoAudienceRole = resolveTodoAudienceRole(linkedMember, authUser?.role);
  const canViewSharedTodos = getVisibleSharedScopesForRole(todoAudienceRole).length > 0;
  const sharedInboxTodos = useMemo(
    () =>
      sortTodos(
        data.todos.filter(
          (todo) =>
            todo.kind === "shared" &&
            !!todo.assigneeUid &&
            selfTodoKeys.has(todo.assigneeUid) &&
            !todo.completed &&
            canViewSharedTodo(todo, linkedMember, authUser?.role),
        ),
      ),
    [authUser?.role, data.todos, linkedMember, selfTodoKeys],
  );
  const privateInboxTodos = useMemo(
    () =>
      sortTodos(
        data.todos.filter(
          (todo) => todo.kind === "private" && todo.createdByUid === currentUid && !todo.completed,
        ),
      ),
    [data.todos, currentUid],
  );
  const inboxTodoCount = sharedInboxTodos.length + privateInboxTodos.length;
  const selectedNotification = useMemo(
    () =>
      selectedNotificationId
        ? notifications.find((item) => item.id === selectedNotificationId) ?? null
        : null,
    [notifications, selectedNotificationId],
  );
  const selectedInboxTodo = useMemo(
    () => (selectedInboxTodoId ? data.todos.find((todo) => todo.id === selectedInboxTodoId) ?? null : null),
    [data.todos, selectedInboxTodoId],
  );
  const statusButtons: Array<{ id: "notice" | "todo"; icon: string; label: string; badge: number }> = [
    { id: "notice", icon: "🔔", label: "Notices", badge: activeNotificationCount },
    { id: "todo", icon: "✅", label: "My TODO", badge: inboxTodoCount + (hasShiftSurveyTodo ? 1 : 0) },
  ];
  const activeNotifications = notifications.filter((item) => item.status === "active");
  const resolvedNotifications = notifications.filter((item) => item.status === "resolved");
  const showNextDuty = isParentHeaderTarget(linkedMember, authUser?.role);
  const nextDutySession = useMemo(() => {
    if (!showNextDuty) return null;
    const familyId = linkedMember?.familyId?.trim() ?? "";
    const familyName = toFamilyName(linkedMember?.familyName || linkedMember?.name || "");
    if (!familyId && !familyName) return null;

    return Object.entries(data.scheduleDays)
      .filter(([dateKey]) => dateKey >= today)
      .sort(([leftDate], [rightDate]) => leftDate.localeCompare(rightDate))
      .flatMap(([dateKey, day]) =>
        (day.sessions ?? [])
          .filter((session) => {
            if (session.dutyRequirement !== "duty") return false;
            if (familyId && session.assigneeFamilyId === familyId) return true;
            return familyName !== "" && toFamilyName(session.assigneeNameSnapshot) === familyName;
          })
          .map((session) => ({ dateKey, session })),
      )
      .sort((left, right) => {
        if (left.dateKey !== right.dateKey) return left.dateKey.localeCompare(right.dateKey);
        if (left.session.order !== right.session.order) return left.session.order - right.session.order;
        return left.session.startTime.localeCompare(right.session.startTime);
      })[0] ?? null;
  }, [data.scheduleDays, linkedMember, showNextDuty, today]);
  const nextDuty = useMemo(() => {
    if (!showNextDuty) return null;
    if (!nextDutySession) {
      return {
        label: "次の当番:",
        date: "-",
        time: "",
      };
    }
    return {
      label: "次の当番:",
      date: formatShortDateWithWeekday(nextDutySession.dateKey),
      time: `${formatTimeNoLeadingZero(nextDutySession.session.startTime)}-${formatTimeNoLeadingZero(nextDutySession.session.endTime)}`,
    };
  }, [nextDutySession, showNextDuty]);
  const showLunchIcon = useMemo(() => {
    if (!nextDutySession) return false;
    const tone = weekdayTone(nextDutySession.dateKey);
    return (tone === "sat" || tone === "sun") && nextDutySession.session.startTime >= "12:00";
  }, [nextDutySession]);
  const lunchPath = "/lunch";
  const usesWidePageLayout =
    location.pathname === "/settings/modules" || location.pathname === "/accounting/ledger";
  const handleNotificationClick = useCallback(
    async (notification: UserNotificationRecord) => {
      setSelectedNotificationId(notification.id);
      if (!currentNotificationUid || notification.isRead) return;
      try {
        await markNotificationAsRead(currentNotificationUid, notification.id);
      } catch (error) {
        setMenuHeaderToast(
          error instanceof Error ? error.message : "通知の既読化に失敗しました",
        );
      }
    },
    [currentNotificationUid],
  );
  const handleResolveNotification = useCallback(
    async (notification: UserNotificationRecord) => {
      if (!currentNotificationUid || notification.status === "resolved") return;
      try {
        await resolveNotification(currentNotificationUid, notification.id, !notification.isRead);
      } catch (error) {
        setMenuHeaderToast(
          error instanceof Error ? error.message : "通知の更新に失敗しました",
        );
      }
    },
    [currentNotificationUid],
  );
  const handleReopenNotification = useCallback(
    async (notification: UserNotificationRecord) => {
      if (!currentNotificationUid || notification.status !== "resolved") return;
      try {
        await reopenNotification(currentNotificationUid, notification.id);
      } catch (error) {
        setMenuHeaderToast(
          error instanceof Error ? error.message : "通知の更新に失敗しました",
        );
      }
    },
    [currentNotificationUid],
  );

  const updateDayLog = useCallback((date: string, updater: (prev: DayLog) => DayLog) => {
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
  }, []);

  const saveDayLog = useCallback((date: string, dayLog: DayLog) => saveFirestoreDayLog(date, dayLog), []);

  const ensureDayLog = useCallback((date: string) => ensureFirestoreDayLog(date), []);

  const updateSessionRsvps = useCallback((date: string, sessionOrder: number, rsvps: DemoRsvp[]) => {
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
  }, []);

  const saveSessionRsvps = useCallback(
    (date: string, sessionId: string, rsvps: DemoRsvp[]) =>
      saveFirestoreSessionRsvps(date, sessionId, rsvps),
    [],
  );

  const applyAttendanceEntries = useCallback((entries: SaveAttendanceEntry[]) => {
    if (entries.length === 0) return;
    setData((prev) => {
      let hasChanged = false;
      const nextScheduleDays = { ...prev.scheduleDays };

      entries.forEach((entry) => {
        const day = nextScheduleDays[entry.date];
        if (!day) return;

        const nextSessions = day.sessions.map((session) => {
          if (session.id !== entry.sessionId) return session;

          const currentRsvps = session.demoRsvps ?? [];
          const filteredRsvps = currentRsvps.filter((rsvp) => rsvp.uid !== entry.memberId);
          const nextRsvps =
            entry.status === "unknown"
              ? filteredRsvps
              : [
                  ...filteredRsvps,
                  {
                    uid: entry.memberId,
                    displayName: entry.displayName,
                    status: entry.status,
                    comment: entry.comment,
                  },
                ];

          hasChanged = true;
          return { ...session, demoRsvps: nextRsvps };
        });

        nextScheduleDays[entry.date] = {
          ...day,
          sessions: nextSessions,
        };
      });

      if (!hasChanged) return prev;
      return {
        ...prev,
        scheduleDays: nextScheduleDays,
      };
    });
  }, []);

  const updateDemoDictionaries = useCallback((next: Partial<DemoData["demoDictionaries"]>) => {
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
  }, []);

  const context = useMemo(
    () => ({
      data,
      updateDayLog,
      saveDayLog,
      ensureDayLog,
      updateSessionRsvps,
      saveSessionRsvps,
      updateDemoDictionaries,
    }),
    [data, ensureDayLog, saveDayLog, saveSessionRsvps, updateDayLog, updateDemoDictionaries, updateSessionRsvps],
  );

  const createTodo = useCallback((todo: Omit<Todo, "id">) => createFirestoreTodo(todo), []);

  const saveTodo = useCallback((todo: Todo) => saveFirestoreTodo(todo), []);

  const deleteTodo = useCallback((todoId: string) => deleteFirestoreTodo(todoId), []);

  const createEvent = useCallback((event: Omit<EventRecord, "id">) => createFirestoreEvent(event), []);

  const saveEvent = useCallback((event: EventRecord) => saveFirestoreEvent(event), []);

  const deleteEvent = useCallback((eventId: string) => deleteFirestoreEvent(eventId), []);

  const updateScores = (updater: (prev: Score[]) => Score[]) => {
    setData((prev) => ({
      ...prev,
      scores: updater(prev.scores),
    }));
  };

  const copyCurrentPageUrl = useCallback(async () => {
    try {
      if (!navigator.clipboard || typeof navigator.clipboard.writeText !== "function") {
        throw new Error("clipboard unavailable");
      }
      await navigator.clipboard.writeText(window.location.href);
      setMenuHeaderToast("リンクをコピーしました");
    } catch {
      setMenuHeaderToast("リンクのコピーに失敗しました");
    }
  }, []);

  const shareCurrentPageUrl = useCallback(async () => {
    if (!canUseNativeShare) return;
    try {
      await navigator.share({
        title: `${siteConfig.productName} - ${currentPageLabel}`,
        url: window.location.href,
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return;
      }
      setMenuHeaderToast("共有に失敗しました");
    }
  }, [canUseNativeShare, currentPageLabel]);

  if (!isAuthReady) {
    return (
      <div className="auth-screen">
        <section className="auth-card">
          <p className="auth-eyebrow">{siteConfig.fullDisplayName}</p>
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
          <p className="auth-eyebrow">{siteConfig.fullDisplayName}</p>
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
          {nextDuty && (
            <div className="next-duty" aria-label={`${nextDuty.label} ${nextDuty.date} ${nextDuty.time}`.trim()}>
              <span className="next-duty-label">{nextDuty.label}</span>
              <span className="next-duty-date">{nextDuty.date}</span>
              {nextDuty.time ? <span className="next-duty-time">{nextDuty.time}</span> : null}
            </div>
          )}
          {showLunchIcon && (
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
          )}
          {statusButtons.map((item) => {
            const isActive = activeStatusPanel === item.id;
            return (
              <button
                key={item.id}
                type="button"
                className={`status-icon-button ${isActive ? "active" : ""}`}
                aria-label={item.label}
                onClick={() => {
                  if (item.id === "notice") setNoticeTab("active");
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
      <main className={`page-wrap${usesWidePageLayout ? " page-wrap-wide" : ""}`}>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route
            path="/today"
            element={
                <TodayPage
                  data={context.data}
                  ensureDayLog={context.ensureDayLog}
                  currentUid={currentUid}
                  linkedMember={linkedMember}
                  authRole={authUser?.role ?? null}
                  saveTodo={saveTodo}
                />
            }
          />
          <Route
            path="/calendar"
            element={
                <CalendarPage
                  data={context.data}
                  canManageSessions={canManageCalendarSessions}
                  ensureDayLog={context.ensureDayLog}
                  linkedMember={linkedMember}
                  authRole={authUser?.role ?? null}
                />
            }
          />
          <Route
            path="/logs"
            element={<LogsListPage data={context.data} ensureDayLog={context.ensureDayLog} />}
          />
          <Route
            path="/activity-plan"
            element={isAdmin ? <ActivityPlanPage /> : <Navigate to="/today" replace />}
          />
          <Route
            path="/attendance"
            element={
              <AttendancePage
                data={data}
                currentUid={currentUid}
                linkedMember={linkedMember}
                authRole={authUser?.role ?? null}
                applyAttendanceEntries={applyAttendanceEntries}
              />
            }
          />
          <Route path="/watch" element={<WatchPage />} />
          <Route path="/shift-survey" element={isAdmin ? <ShiftSurveyPage /> : <Navigate to="/today" replace />} />
          <Route
            path="/lunch"
            element={
              <LunchPage
                data={data}
                currentUid={currentUid}
                demoRole={currentOperatorRole}
                canManageAccounting={canManageAccounting}
                isLoading={isLunchRecordsLoading}
                loadError={lunchRecordsLoadError}
                createLunchRecord={createFirestoreLunchRecord}
                saveLunchRecord={saveFirestoreLunchRecord}
                deleteLunchRecord={deleteFirestoreLunchRecord}
              />
            }
          />
          <Route path="/dues" element={<FeesPage currentUid={currentUid} isAdmin={isAdmin} />} />
          <Route
            path="/events"
            element={
              <EventsPage
                data={data}
                currentUid={currentUid}
                linkedMember={linkedMember}
                authRole={authUser?.role ?? null}
                saveTodo={saveTodo}
                createEvent={createEvent}
                saveEvent={saveEvent}
                deleteEvent={deleteEvent}
                menuRole={currentRole}
              />
            }
          />
          <Route
            path="/events/:eventId"
            element={
              <EventsPage
                data={data}
                currentUid={currentUid}
                linkedMember={linkedMember}
                authRole={authUser?.role ?? null}
                saveTodo={saveTodo}
                createEvent={createEvent}
                saveEvent={saveEvent}
                deleteEvent={deleteEvent}
                menuRole={currentRole}
              />
            }
          />
          <Route
            path="/todos"
            element={
              <TodosPage
                data={data}
                currentUid={currentUid}
                linkedMember={linkedMember}
                authRole={authUser?.role ?? null}
                createTodo={createTodo}
                saveTodo={saveTodo}
                deleteTodo={deleteTodo}
              />
            }
          />
          <Route path="/docs" element={<DocsListPage isAdmin={isAdmin} />} />
          <Route
            path="/docs/new"
            element={isAdmin ? <DocsEditorPage mode="new" isAdmin={isAdmin} /> : <Navigate to="/docs" replace />}
          />
          <Route path="/docs/:id" element={<DocsDetailPage isAdmin={isAdmin} />} />
          <Route
            path="/docs/:id/edit"
            element={isAdmin ? <DocsEditorPage mode="edit" isAdmin={isAdmin} /> : <Navigate to="/docs" replace />}
          />
          <Route
            path="/purchases"
            element={
              <PurchasesPage
                data={data}
                currentUid={currentUid}
                demoRole={currentOperatorRole}
                canManageAccounting={canManageAccounting}
                isLoading={isPurchaseRequestsLoading}
                loadError={purchaseRequestsLoadError}
                createPurchaseRequest={createFirestorePurchaseRequest}
                savePurchaseRequest={saveFirestorePurchaseRequest}
                completePurchaseRequest={completeFirestorePurchaseRequest}
                deletePurchaseRequest={deleteFirestorePurchaseRequest}
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
                canManageAccounting={canManageAccounting}
                isLoading={isReimbursementsLoading}
                loadError={reimbursementsLoadError}
                createReimbursement={createFirestoreReimbursement}
                markReimbursementPaid={markFirestoreReimbursementPaid}
                saveReimbursement={saveFirestoreReimbursement}
                deleteReimbursement={deleteFirestoreReimbursement}
              />
            }
          />
          <Route
            path="/instruments"
            element={
              <InstrumentsPage
                data={data}
                isAdmin={isAdmin}
                isLoading={isInstrumentsLoading}
                loadError={instrumentsLoadError}
                createInstrument={createFirestoreInstrument}
                saveInstrument={saveFirestoreInstrument}
                deleteInstrument={deleteFirestoreInstrument}
              />
            }
          />
          <Route
            path="/scores"
            element={
              <ScorePage
                data={data}
                updateScores={updateScores}
                saveScore={saveFirestoreScore}
                isAdmin={isAdmin}
                isLoading={isScoresLoading}
                loadError={scoresLoadError}
              />
            }
          />
          <Route path="/links" element={<LinksPage menuRole={currentRole} />} />
          <Route path="/members" element={<MemberDirectoryPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route
            path="/settings/members"
            element={isAdmin ? <MembersManagementPage /> : <Navigate to="/today" replace />}
          />
          <Route
            path="/settings/modules"
            element={isAdmin ? <ModuleSettingsPage /> : <Navigate to="/today" replace />}
          />
          <Route
            path="/settings/system-notifications"
            element={
              isAdmin ? (
                <SystemNotificationsPage
                  currentMember={linkedMember}
                  currentLoginId={authUser?.loginId ?? ""}
                />
              ) : (
                <Navigate to="/today" replace />
              )
            }
          />
          <Route path="/accounting" element={<AccountingHome isAdmin={isAdmin} />} />
          <Route
            path="/accounting/ledger"
            element={<AccountLedger isAdmin={isAdmin} canManageAccounting={canManageAccounting} />}
          />
          <Route path="/accounting/report" element={<AccountingReport />} />
          <Route
            path="/accounting/periods"
            element={isAdmin ? <AccountingPeriods canManageYear={isAdmin} /> : <Navigate to="/accounting" replace />}
          />
          <Route
            path="/logs/:date"
            element={
              <LogPage
                data={context.data}
                updateDayLog={context.updateDayLog}
                saveDayLog={context.saveDayLog}
                ensureDayLog={context.ensureDayLog}
                updateSessionRsvps={context.updateSessionRsvps}
                saveSessionRsvps={context.saveSessionRsvps}
                updateDemoDictionaries={context.updateDemoDictionaries}
                isScoresLoading={isScoresLoading}
                scoresLoadError={scoresLoadError}
                linkedMember={linkedMember}
              />
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      {isMenuOpen && (
        <div className="menu-overlay" onClick={() => setIsMenuOpen(false)}>
          <div className="menu-panel" onClick={(event) => event.stopPropagation()}>
            <div className="menu-content">
              {menuHeaderToast && <div className="inline-toast menu-inline-toast">{menuHeaderToast}</div>}
              <div className="menu-topbar">
                <div className="menu-share-actions">
                  <button
                    type="button"
                    className="menu-header-icon-button"
                    aria-label="現在のページのリンクをコピー"
                    title="リンクをコピー"
                    onClick={() => void copyCurrentPageUrl()}
                  >
                    🔗
                  </button>
                  {canUseNativeShare && (
                    <button
                      type="button"
                      className="menu-header-icon-button menu-header-share-button"
                      aria-label="現在のページを共有"
                      title="共有"
                      onClick={() => void shareCurrentPageUrl()}
                    >
                      ⤴
                    </button>
                  )}
                </div>
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
                <button
                  type="button"
                  className="menu-close"
                  aria-label="閉じる" title="閉じる"
                  onClick={() => setIsMenuOpen(false)}
                >
                  ×
                </button>
              </div>
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
        <div className="modal-backdrop" role="dialog" aria-modal="true">
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
                    className={`status-panel-tab ${noticeTab === "active" ? "active" : ""}`}
                    onClick={() => setNoticeTab("active")}
                  >
                    未対応
                  </button>
                  <button
                    type="button"
                    className={`status-panel-tab ${noticeTab === "resolved" ? "active" : ""}`}
                    onClick={() => setNoticeTab("resolved")}
                  >
                    対応済
                  </button>
                </div>
                <ul className="status-panel-list">
                  {isNotificationsLoading && <li>通知を読み込み中...</li>}
                  {!isNotificationsLoading && notificationsLoadError && (
                    <li className="field-error">{notificationsLoadError}</li>
                  )}
                  {!isNotificationsLoading &&
                    !notificationsLoadError &&
                    (noticeTab === "active" ? activeNotifications : resolvedNotifications).map((item) => (
                      <li
                        key={item.id}
                        className="status-notice-row"
                        onClick={() => void handleNotificationClick(item)}
                      >
                        <div className="status-notice-main">
                          <span className={item.isRead ? "" : "status-unread"}>
                            {item.title}
                            {!item.isRead && <span className="status-new-tag">NEW</span>}
                          </span>
                          <p className="status-notice-meta">
                            {formatNotificationDateTime(item.createdAt)}
                            {item.senderName ? ` / ${item.senderName}` : ""}
                          </p>
                        </div>
                      </li>
                    ))}
                  {!isNotificationsLoading &&
                    !notificationsLoadError &&
                    noticeTab === "active" &&
                    activeNotifications.length === 0 && <li>未対応の通知はありません</li>}
                  {!isNotificationsLoading &&
                    !notificationsLoadError &&
                    noticeTab === "resolved" &&
                    resolvedNotifications.length === 0 && <li>対応済の通知はありません</li>}
                </ul>
              </>
            )}
            {activeStatusPanel === "todo" && (
              <>
                <p className="status-panel-subtitle">自分の受信箱</p>
                <h2 className="status-panel-title">TODO受信箱</h2>
                <div className="status-todo-section">
                  <h3>個人TODO</h3>
                  <ul className="status-panel-list">
                    {privateInboxTodos.map((item) => {
                      return (
                        <li key={item.id} className="status-inbox-row">
                          <div className="status-inbox-main">
                            <button
                              type="button"
                              className="status-inbox-trigger"
                              onClick={() => setSelectedInboxTodoId(item.id)}
                            >
                            <strong>{item.title}</strong>
                            <span className="status-inbox-meta">期限: {item.dueDate ?? "—"}</span>
                            </button>
                          </div>
                          <button
                            type="button"
                            className="button button-small button-secondary"
                            onClick={() =>
                              void saveTodo({ ...item, completed: true })
                            }
                          >
                            完了
                          </button>
                        </li>
                      );
                    })}
                    {privateInboxTodos.length === 0 && <li>個人TODOはありません</li>}
                  </ul>
                </div>
                {canViewSharedTodos && <div className="status-todo-section">
                  <h3>共有TODO（自分担当）</h3>
                  <ul className="status-panel-list">
                    {sharedInboxTodos.map((item) => {
                      const related = resolveTodoRelatedSummary(data, item);
                      const relatedPath = related.to;
                      return (
                        <li key={item.id} className="status-inbox-row">
                          <div className="status-inbox-main">
                            <button
                              type="button"
                              className="status-inbox-trigger"
                              onClick={() => setSelectedInboxTodoId(item.id)}
                            >
                            <strong>{item.title}</strong>
                            <span className="status-inbox-meta">期限: {item.dueDate ?? "—"}</span>
                            </button>
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
                              void saveTodo({ ...item, completed: true })
                            }
                          >
                            完了
                          </button>
                        </li>
                      );
                    })}
                    {sharedInboxTodos.length === 0 && <li>共有TODOはありません</li>}
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
                </div>}
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
      {selectedNotification && (
        <div className="modal-backdrop modal-backdrop-front" onClick={() => setSelectedNotificationId(null)}>
          <section className="modal-panel todos-related-modal" onClick={(event) => event.stopPropagation()}>
            <button
              type="button"
              className="modal-close"
              aria-label="閉じる"
              onClick={() => setSelectedNotificationId(null)}
            >
              ×
            </button>
            <h3>通知詳細</h3>
            <p className="modal-context">{selectedNotification.title}</p>
            <p className="modal-summary">作成日時: {formatNotificationDateTime(selectedNotification.createdAt)}</p>
            {selectedNotification.senderName && (
              <p className="modal-summary">送信者: {selectedNotification.senderName}</p>
            )}
            <p className="modal-summary">
              状態: {selectedNotification.status === "resolved" ? "対応済" : "未対応"}
            </p>
            {selectedNotification.body?.trim() ? (
              <>
                <p className="modal-summary">本文</p>
                <p className="todo-memo-full">
                  <LinkifiedText
                    text={selectedNotification.body}
                    className="todo-linkified-text"
                  />
                </p>
              </>
            ) : (
              <p className="muted">本文はありません。</p>
            )}
            <div className="modal-actions">
              <button
                type="button"
                className="button button-secondary"
                onClick={() => setSelectedNotificationId(null)}
              >
                閉じる
              </button>
              {selectedNotification.status === "active" && (
                <button
                  type="button"
                  className="button"
                  onClick={() => void handleResolveNotification(selectedNotification)}
                >
                  対応済にする
                </button>
              )}
              {selectedNotification.status === "resolved" && (
                <button
                  type="button"
                  className="button"
                  onClick={() => void handleReopenNotification(selectedNotification)}
                >
                  未対応に戻す
                </button>
              )}
            </div>
          </section>
        </div>
      )}
      {selectedInboxTodo && (
        <div className="modal-backdrop modal-backdrop-front" onClick={() => setSelectedInboxTodoId(null)}>
          <section className="modal-panel todos-related-modal" onClick={(event) => event.stopPropagation()}>
            <button
              type="button"
              className="modal-close"
              aria-label="閉じる"
              onClick={() => setSelectedInboxTodoId(null)}
            >
              ×
            </button>
            <h3>TODO詳細</h3>
            <p className="modal-context">{selectedInboxTodo.title}</p>
            <p className="modal-summary">期限: {selectedInboxTodo.dueDate ?? "—"}</p>
            <p className="modal-summary">
              種別: {selectedInboxTodo.kind === "shared" ? "共有TODO" : "個人TODO"}
            </p>
            <p className="modal-summary">状態: {selectedInboxTodo.completed ? "完了" : "未完了"}</p>
            {selectedInboxTodo.memo?.trim() && (
              <>
                <p className="modal-summary">メモ</p>
                <p className="todo-memo-full">
                  <LinkifiedText text={selectedInboxTodo.memo} className="todo-linkified-text" />
                </p>
              </>
            )}
            <div className="modal-actions">
              <button
                type="button"
                className="button button-secondary"
                onClick={() => setSelectedInboxTodoId(null)}
              >
                閉じる
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
