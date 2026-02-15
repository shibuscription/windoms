import type { DemoData } from "../types";
import { shiftDateKey, todayDateKey } from "../utils/date";

const today = todayDateKey();
const dayMinus1 = shiftDateKey(today, -1);
const dayMinus2 = shiftDateKey(today, -2);
const dayMinus3 = shiftDateKey(today, -3);

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
  scheduleDays: {
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
          assignees: ["uid_001"],
          assigneeNameSnapshot: "林 太郎",
          plannedInstructors: ["講師A"],
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
          location: "第2音楽室",
          assignees: ["uid_004"],
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
        {
          order: 3,
          startTime: "15:30",
          endTime: "17:00",
          type: "event",
          dutyRequirement: "duty",
          requiresShift: true,
          location: "体育館",
          assignees: ["uid_007"],
          assigneeNameSnapshot: "佐々木 舞",
          plannedInstructors: ["講師B"],
          plannedSeniors: ["先輩D"],
          demoRsvps: [
            { uid: "m01", displayName: "田中", status: "yes" },
            { uid: "m02", displayName: "佐藤", status: "maybe" },
            { uid: "m03", displayName: "高橋", status: "yes" },
            { uid: "m08", displayName: "加藤", status: "no" },
            { uid: "m11", displayName: "松本", status: "unknown" },
          ],
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
        { startTime: "09:05", type: "基礎練習", title: "ロングトーン" },
        { startTime: "09:05", type: "合奏", title: "課題曲" },
      ],
      actualInstructors: ["講師A"],
      actualSeniors: [],
    },
  },
};
