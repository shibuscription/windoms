import type { DemoData, ScheduleDayDoc, SessionDoc } from "../types";
import { shiftDateKey, todayDateKey } from "../utils/date";
import { makeSessionRelatedId } from "../utils/todoUtils";

const today = todayDateKey();
const dayMinus1 = shiftDateKey(today, -1);
const dayMinus2 = shiftDateKey(today, -2);
const dayMinus3 = shiftDateKey(today, -3);

const toDateFromKey = (dateKey: string): Date => {
  const [y, m, d] = dateKey.split("-").map(Number);
  return new Date(y, m - 1, d);
};

const getNextWeekdayDateKey = (baseDateKey: string, weekday: number): string => {
  const base = toDateFromKey(baseDateKey);
  const diff = (weekday - base.getDay() + 7) % 7 || 7;
  return shiftDateKey(baseDateKey, diff);
};

const nextSaturday = getNextWeekdayDateKey(today, 6);
const nextSunday = getNextWeekdayDateKey(today, 0);
const followingSaturday = shiftDateKey(nextSaturday, 7);
export const DEMO_CURRENT_UID = "g01";
const DUTY_LAST_NAMES = ["伊藤", "佐藤", "鈴木", "高橋", "-"] as const;

const dutyNameBySeed = (seed: number): string => DUTY_LAST_NAMES[seed % DUTY_LAST_NAMES.length];

const makeSession = (
  order: number,
  startTime: string,
  endTime: string,
  type: SessionDoc["type"],
  dutySeed: number,
  eventName?: string,
): SessionDoc => ({
  order,
  startTime,
  endTime,
  type,
  eventName,
  dutyRequirement: "duty",
  requiresShift: true,
  location: type === "event" ? "市内会場" : "第1音楽室",
  assignees: [],
  assigneeNameSnapshot: dutyNameBySeed(dutySeed),
  plannedInstructors: [],
  plannedSeniors: [],
});

const buildFeb2026ScheduleDays = (): Record<string, ScheduleDayDoc> => {
  const result: Record<string, ScheduleDayDoc> = {};
  let dutySeed = 0;
  const year = 2026;
  const month = 2;
  const daysInMonth = new Date(year, month, 0).getDate();

  for (let day = 1; day <= daysInMonth; day += 1) {
    const dateKey = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const weekday = new Date(year, month - 1, day).getDay();
    const sessions: SessionDoc[] = [];

    if (weekday === 2 || weekday === 4) {
      sessions.push(makeSession(1, "17:00", "18:30", "normal", dutySeed));
      dutySeed += 1;
    }
    if (weekday === 6) {
      sessions.push(makeSession(1, "09:00", "12:00", "self", dutySeed));
      sessions.push(makeSession(2, "12:00", "15:00", "normal", dutySeed + 1));
      dutySeed += 2;
    }
    if (weekday === 0) {
      sessions.push(makeSession(1, "09:00", "12:00", "normal", dutySeed));
      sessions.push(makeSession(2, "12:00", "15:00", "self", dutySeed + 1));
      dutySeed += 2;
    }

    if (dateKey === "2026-02-11") {
      sessions.length = 0;
      sessions.push(makeSession(1, "10:00", "14:00", "event", dutySeed, "市民文化祭ステージ"));
      dutySeed += 1;
    }
    if (dateKey === "2026-02-23") {
      sessions.length = 0;
      sessions.push(makeSession(1, "13:00", "16:00", "event", dutySeed, "陶器まつり屋外演奏"));
      dutySeed += 1;
    }

    if (sessions.length === 0) continue;
    result[dateKey] = {
      defaultLocation: "第1音楽室",
      sessions,
    };
  }
  return result;
};

const demoEvents = [
  { id: "teiki-2026", title: "定期演奏会" },
  { id: "touki-2026", title: "陶器まつり屋外演奏" },
  { id: "camp-2025", title: "夏合宿" },
  { id: "parent-meeting-2025", title: "保護者会" },
];

const demoTodos: DemoData["todos"] = [
  {
    id: "todo-001",
    title: "配布資料の最終確認",
    completed: false,
    createdAt: "2026-02-18T08:10:00+09:00",
    assigneeUid: null,
    dueDate: "2026-03-01",
    related: { type: "event", id: "teiki-2026" },
  },
  {
    id: "todo-002",
    title: "会場導線の掲示を準備",
    completed: false,
    createdAt: "2026-02-18T09:30:00+09:00",
    assigneeUid: "g02",
    dueDate: "2026-03-05",
    related: { type: "event", id: "teiki-2026" },
  },
  {
    id: "todo-003",
    title: "当日セッションの出欠最終確認",
    completed: false,
    createdAt: "2026-02-19T11:00:00+09:00",
    assigneeUid: DEMO_CURRENT_UID,
    dueDate: "2026-03-03",
    related: { type: "session", id: makeSessionRelatedId(today, 1) },
  },
  {
    id: "todo-004",
    title: "備品棚の整理",
    completed: false,
    createdAt: "2026-02-20T08:45:00+09:00",
    assigneeUid: DEMO_CURRENT_UID,
    related: null,
  },
  {
    id: "todo-005",
    title: "連絡テンプレートを更新",
    completed: true,
    createdAt: "2026-02-15T18:20:00+09:00",
    assigneeUid: null,
    dueDate: "2026-02-16",
    related: { type: "session", id: makeSessionRelatedId("2026-02-23", 1) },
  },
  {
    id: "todo-006",
    title: "保護者会の議題たたき台を作る",
    completed: false,
    createdAt: "2026-02-21T07:30:00+09:00",
    assigneeUid: "g04",
    related: { type: "event", id: "parent-meeting-2025" },
  },
];

const demoPurchaseRequests: DemoData["purchaseRequests"] = [
  {
    id: "pr-001",
    title: "譜面台クリップの補充",
    createdAt: "2026-02-20T09:00:00+09:00",
    category: "備品",
    memo: "壊れやすいため予備を多めに確保",
    quantity: 20,
    estimatedAmount: 2800,
    createdBy: "g02",
    purchaseAssignees: [],
    status: "OPEN",
  },
  {
    id: "pr-002",
    title: "リード 2 1/2 のまとめ買い",
    createdAt: "2026-02-21T18:30:00+09:00",
    category: "消耗品",
    quantity: "2箱",
    estimatedAmount: 6400,
    createdBy: "g03",
    purchaseAssignees: ["g01"],
    status: "OPEN",
  },
  {
    id: "pr-003",
    title: "本番用ガムテープ",
    createdAt: "2026-02-23T08:15:00+09:00",
    category: "イベント",
    memo: "黒テープ優先",
    quantity: 6,
    estimatedAmount: 1800,
    createdBy: "g01",
    purchaseAssignees: ["g02", "g04"],
    status: "OPEN",
  },
  {
    id: "pr-004",
    title: "会場案内ラミネートフィルム",
    createdAt: "2026-02-18T13:40:00+09:00",
    category: "印刷物",
    quantity: 2,
    estimatedAmount: 1200,
    createdBy: "g04",
    purchaseAssignees: ["g01"],
    status: "BOUGHT",
    boughtBy: "g01",
    boughtAt: "2026-02-22T10:30:00+09:00",
  },
  {
    id: "pr-005",
    title: "消毒スプレー補充",
    createdAt: "2026-02-24T17:20:00+09:00",
    category: "衛生",
    quantity: 3,
    estimatedAmount: 1500,
    createdBy: "g07",
    purchaseAssignees: ["g02", "g07"],
    status: "BOUGHT",
    boughtBy: "g02",
    boughtAt: "2026-02-25T18:00:00+09:00",
  },
];

const demoReimbursements: DemoData["reimbursements"] = [
  {
    id: "rb-001",
    title: "テープ類立替",
    amount: 1780,
    purchasedAt: "2026-02-20T19:00:00+09:00",
    buyer: "g04",
    memo: "会場設営用",
    receipt: "レシート写真あり",
    relatedPurchaseRequestId: "pr-003",
  },
  {
    id: "rb-002",
    title: "譜面コピー用紙",
    amount: 980,
    purchasedAt: "2026-02-18T12:10:00+09:00",
    buyer: "g01",
    paidByTreasurerAt: "2026-02-24T20:15:00+09:00",
  },
  {
    id: "rb-003",
    title: "マーカー立替",
    amount: 420,
    purchasedAt: "2026-02-17T17:20:00+09:00",
    buyer: "g07",
    memo: "色指定あり",
  },
  {
    id: "rb-004",
    title: "救急セット補充",
    amount: 3250,
    purchasedAt: "2026-02-14T11:45:00+09:00",
    buyer: "g01",
    receipt: "https://example.com/receipt/rb-004",
    paidByTreasurerAt: "2026-02-18T09:15:00+09:00",
    receivedByBuyerAt: "2026-02-19T21:05:00+09:00",
  },
  {
    id: "rb-005",
    title: "ガムテープ補充",
    amount: 630,
    purchasedAt: "2026-02-26T18:05:00+09:00",
    buyer: "g01",
    memo: "未精算サンプル（自分）",
  },
];

const demoLunchRecords: DemoData["lunchRecords"] = [
  {
    id: "ln-001",
    title: "お弁当（からあげ）- QUO2枚",
    amount: 500,
    purchasedAt: `${today}T08:15:00+09:00`,
    date: today,
    buyer: "g01",
    dutyMemberId: "g01",
    dutyHouseholdId: "hh01",
    paymentSplits: [
      { type: "quo", cardId: "quo-old", amount: 300 },
      { type: "quo", cardId: "quo-main", amount: 200 },
    ],
    memo: "朝にコンビニで購入",
    imageUrls: ["https://picsum.photos/seed/windoms-lunch-1/640/640"],
  },
  {
    id: "ln-002",
    title: "お弁当（幕の内）- QUO+立替",
    amount: 500,
    purchasedAt: `${dayMinus1}T12:05:00+09:00`,
    date: dayMinus1,
    buyer: "g02",
    dutyMemberId: "g02",
    dutyHouseholdId: "hh01",
    paymentSplits: [
      { type: "quo", cardId: "quo-old", amount: 300 },
      { type: "reimbursement", amount: 200 },
    ],
    memo: "練習後にまとめ買い",
    imageUrls: ["https://picsum.photos/seed/windoms-lunch-2/640/640"],
  },
  {
    id: "ln-003",
    title: "お弁当（焼き魚）",
    amount: 720,
    purchasedAt: `${dayMinus2}T11:40:00+09:00`,
    date: dayMinus2,
    buyer: "g04",
    dutyMemberId: "g04",
    dutyHouseholdId: "hh03",
    paymentSplits: [{ type: "reimbursement", amount: 720 }],
  },
];

const demoLunchDuties: DemoData["lunchDuties"] = [
  { date: nextSaturday, slotType: "WEEKEND_PM", assigneeHouseholdId: "hh01" },
  { date: nextSunday, slotType: "WEEKEND_PM", assigneeHouseholdId: "hh03" },
  { date: followingSaturday, slotType: "WEEKEND_PM", assigneeHouseholdId: "hh05" },
];

const demoQuoCards: DemoData["quoCards"] = [
  { id: "quo-main", purchaseDate: "2026-03-01", balance: 6800, active: true },
  { id: "quo-old", purchaseDate: "2026-02-10", balance: 1200, active: true },
  { id: "quo-archived-01", purchaseDate: "2026-01-05", balance: 0, active: false, archived: true },
];

export const mockData: DemoData = {
  demoDictionaries: {
    instructors: ["講師A", "講師B", "講師C"],
    seniors: ["先輩B", "先輩C", "先輩D"],
  },
  members: {
    m01: { uid: "m01", grade: 3, instrumentOrder: 2, kana: "たなか" },
    m02: { uid: "m02", grade: 2, instrumentOrder: 1, kana: "さとう" },
    m03: { uid: "m03", grade: 2, instrumentOrder: 3, kana: "たかはし" },
    m04: { uid: "m04", grade: 1, instrumentOrder: 2, kana: "いとう" },
    m05: { uid: "m05", grade: 1, instrumentOrder: 4, kana: "わたなべ" },
    m06: { uid: "m06", grade: 3, instrumentOrder: 5, kana: "なかむら" },
    m07: { uid: "m07", grade: 2, instrumentOrder: 6, kana: "こばやし" },
    m08: { uid: "m08", grade: 1, instrumentOrder: 1, kana: "かとう" },
    m09: { uid: "m09", grade: 3, instrumentOrder: 4, kana: "よしだ" },
    m10: { uid: "m10", grade: 2, instrumentOrder: 5, kana: "やまもと" },
    m11: { uid: "m11", grade: 1, instrumentOrder: 3, kana: "まつもと" },
  },
  users: {
    g01: { uid: "g01", displayName: "渋谷父", householdId: "hh01" },
    g02: { uid: "g02", displayName: "渋谷母", householdId: "hh01" },
    g03: { uid: "g03", displayName: "田中母", householdId: "hh02" },
    g04: { uid: "g04", displayName: "佐藤祖母", householdId: "hh03" },
    g05: { uid: "g05", displayName: "高橋叔母", householdId: "hh04" },
    g06: { uid: "g06", displayName: "伊藤父", householdId: "hh05" },
    g07: { uid: "g07", displayName: "渡辺母", householdId: "hh06" },
  },
  households: {
    hh01: {
      householdId: "hh01",
      label: "渋谷家",
      members: [
        { uid: "g01", role: "guardian", relationshipToChild: "father" },
        { uid: "g02", role: "guardian", relationshipToChild: "mother" },
        { uid: "m01", role: "child" },
        { uid: "m02", role: "child" },
      ],
    },
    hh02: {
      householdId: "hh02",
      label: "田中家",
      members: [
        { uid: "g03", role: "guardian", relationshipToChild: "mother" },
        { uid: "m03", role: "child" },
      ],
    },
    hh03: {
      householdId: "hh03",
      label: "佐藤家",
      members: [
        { uid: "g04", role: "guardian", relationshipToChild: "grandmother" },
        { uid: "m04", role: "child" },
      ],
    },
    hh04: {
      householdId: "hh04",
      label: "高橋家",
      members: [
        { uid: "g05", role: "guardian", relationshipToChild: "aunt" },
        { uid: "m05", role: "child" },
      ],
    },
    hh05: {
      householdId: "hh05",
      label: "伊藤家",
      members: [
        { uid: "g06", role: "guardian", relationshipToChild: "father" },
        { uid: "m06", role: "child" },
      ],
    },
    hh06: {
      householdId: "hh06",
      label: "渡辺家",
      members: [
        { uid: "g07", role: "guardian", relationshipToChild: "mother" },
        { uid: "m07", role: "child" },
      ],
    },
  },
  events: demoEvents,
  todos: demoTodos,
  purchaseRequests: demoPurchaseRequests,
  reimbursements: demoReimbursements,
  lunchRecords: demoLunchRecords,
  lunchDuties: demoLunchDuties,
  quoCards: demoQuoCards,
  scheduleDays: {
    ...buildFeb2026ScheduleDays(),
    [today]: {
      defaultLocation: "第1音楽室",
      notice:
        "1行目: 本日16:30に片付け開始です。\n2行目: 打楽器は搬出前にチェックリストを確認してください。\n3行目: 譜面台は最後に倉庫へ戻してください。\n4行目: 合奏後は全員で床の確認を行います。\n5行目: 水分補給は休憩時にまとめて実施してください。\n6行目: 体育館利用時は上履きを忘れないでください。\n7行目: チューナーとメトロノームは当番が回収します。\n8行目: 終了後に忘れ物チェックを必ず行ってください。\n9行目: 連絡事項は日誌備考にも記録してください。\n10行目: お疲れさまでした。",
      plannedInstructors: ["講師A", "講師B"],
      plannedSeniors: ["先輩B", "先輩C", "先輩D"],
      sessions: [
        {
          order: 1,
          startTime: "09:00",
          endTime: "12:00",
          type: "normal",
          dutyRequirement: "duty",
          requiresShift: true,
          location: "音楽室",
          assignees: ["g01"],
          assigneeNameSnapshot: "林 太郎",
          plannedInstructors: ["井野先生", "講師A"],
          plannedSeniors: ["先輩B"],
          demoRsvps: [
            { uid: "m01", displayName: "田中", status: "yes" },
            { uid: "m02", displayName: "佐藤", status: "yes" },
            { uid: "m03", displayName: "高橋", status: "yes" },
            { uid: "m04", displayName: "伊藤", status: "yes" },
            { uid: "m05", displayName: "渡辺", status: "yes" },
            { uid: "m06", displayName: "中村", status: "yes" },
            { uid: "m07", displayName: "小林", status: "yes" },
            { uid: "m08", displayName: "加藤", status: "yes" },
            { uid: "m09", displayName: "吉田", status: "maybe" },
            { uid: "m10", displayName: "山本", status: "no" },
            { uid: "m11", displayName: "松本", status: "unknown" },
          ],
        },
        {
          order: 2,
          startTime: "12:00",
          endTime: "15:00",
          type: "self",
          dutyRequirement: "watch",
          requiresShift: false,
          location: "文化ホール",
          assignees: ["g04"],
          assigneeNameSnapshot: "伊藤 花子",
          plannedInstructors: [],
          plannedSeniors: ["先輩C"],
          demoRsvps: [
            { uid: "m01", displayName: "田中", status: "yes" },
            { uid: "m02", displayName: "佐藤", status: "yes" },
            { uid: "m03", displayName: "高橋", status: "yes" },
            { uid: "m04", displayName: "伊藤", status: "maybe" },
            { uid: "m05", displayName: "渡辺", status: "maybe" },
            { uid: "m06", displayName: "中村", status: "no" },
            { uid: "m07", displayName: "小林", status: "unknown" },
          ],
        },
      ],
    },
    [nextSaturday]: {
      defaultLocation: "第1音楽室",
      sessions: [
        {
          order: 1,
          startTime: "09:00",
          endTime: "12:00",
          type: "normal",
          dutyRequirement: "duty",
          requiresShift: true,
          location: "音楽室",
          assignees: ["g02"],
          assigneeNameSnapshot: "渋谷母",
          plannedInstructors: ["講師A"],
          plannedSeniors: [],
          demoRsvps: [],
        },
      ],
    },
    [nextSunday]: {
      defaultLocation: "第1音楽室",
      sessions: [
        {
          order: 1,
          startTime: "13:00",
          endTime: "16:00",
          type: "normal",
          dutyRequirement: "duty",
          requiresShift: true,
          location: "音楽室",
          assignees: ["g03"],
          assigneeNameSnapshot: "田中母",
          plannedInstructors: ["講師B"],
          plannedSeniors: [],
          demoRsvps: [],
        },
      ],
    },
  },
  dayLogs: {
    [dayMinus3]: {
      notes: "過去ログ（MRU確認用）",
      weather: "くもり",
      activities: [
        { startTime: "15:00", type: "合奏", title: "通し確認", songIds: ["song_004", "song_001"] },
      ],
      actualInstructors: ["講師C"],
      actualSeniors: ["先輩B"],
    },
    [dayMinus2]: {
      notes: "過去ログ（MRU確認用）",
      weather: "雨",
      activities: [
        { startTime: "09:20", type: "基礎練習", title: "発音", songIds: ["song_002"] },
        { startTime: "10:10", type: "合奏", title: "部分練習", songIds: ["song_003", "song_005"] },
      ],
      actualInstructors: ["講師A"],
      actualSeniors: [],
    },
    [dayMinus1]: {
      notes: "過去ログ（MRU確認用）",
      weather: "晴れ",
      activities: [
        { startTime: "16:10", type: "合奏", title: "全体", songIds: ["song_005", "song_001", "song_003"] },
      ],
      actualInstructors: ["講師B"],
      actualSeniors: ["先輩D"],
    },
    [today]: {
      notes: "",
      weather: "晴れ",
      activities: [
        { startTime: "09:00", type: "腹式呼吸", title: "" },
        { startTime: "09:15", type: "基礎練習", title: "ロングトーン" },
      ],
      actualInstructors: ["講師A"],
      actualSeniors: [],
      mainInstructorAttendance: {},
    },
  },
};
