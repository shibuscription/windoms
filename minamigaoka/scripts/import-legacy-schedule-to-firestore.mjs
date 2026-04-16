import fs from "node:fs";
import path from "node:path";
import { initializeApp } from "firebase/app";
import {
  collection,
  doc,
  getDocs,
  setDoc,
  writeBatch,
} from "firebase/firestore";
import { getFirestore } from "firebase/firestore";

const RANGE_END_DATE = "2026-02-28";

const requiredKeys = [
  "VITE_FIREBASE_API_KEY",
  "VITE_FIREBASE_AUTH_DOMAIN",
  "VITE_FIREBASE_PROJECT_ID",
  "VITE_FIREBASE_STORAGE_BUCKET",
  "VITE_FIREBASE_MESSAGING_SENDER_ID",
  "VITE_FIREBASE_APP_ID",
];

const missingKeys = requiredKeys.filter((key) => !(process.env[key] || "").trim());
if (missingKeys.length > 0) {
  console.error("Firebase 設定が不足しています:", missingKeys.join(", "));
  process.exit(1);
}

const firebaseConfig = {
  apiKey: process.env.VITE_FIREBASE_API_KEY,
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.VITE_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const args = process.argv.slice(2);

const getArgValue = (flag) => {
  const index = args.indexOf(flag);
  if (index === -1) return null;
  return args[index + 1] ?? null;
};

const hasFlag = (flag) => args.includes(flag);
const dryRun = !hasFlag("--apply");

const defaultInputPath = path.resolve(process.cwd(), "./migration-output/legacy-schedule-preview.json");
const inputJsonPath = path.resolve(getArgValue("--input") ?? defaultInputPath);

if (!fs.existsSync(inputJsonPath)) {
  console.error("preview JSON が見つかりません。--input で指定してください:", inputJsonPath);
  process.exit(1);
}

const preview = JSON.parse(fs.readFileSync(inputJsonPath, "utf8").replace(/^\uFEFF/, ""));
const scheduleDays = preview?.scheduleDays ?? {};
const dayEntries = Object.entries(scheduleDays).sort(([leftDate], [rightDate]) =>
  leftDate.localeCompare(rightDate),
);

if (dayEntries.length === 0) {
  console.error("投入対象の scheduleDays がありません。");
  process.exit(1);
}

const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const invalidDates = dayEntries
  .map(([date]) => date)
  .filter((date) => !datePattern.test(date) || date > RANGE_END_DATE);

if (invalidDates.length > 0) {
  console.error("投入対象に不正な日付があります。処理を中断します。", invalidDates);
  process.exit(1);
}

const conflicts = [];

for (const [date] of dayEntries) {
  const sessionsRef = collection(db, "scheduleDays", date, "sessions");
  const existingSessionsSnapshot = await getDocs(sessionsRef);
  if (!existingSessionsSnapshot.empty) {
    conflicts.push({
      date,
      existingSessionCount: existingSessionsSnapshot.size,
      existingSessionIds: existingSessionsSnapshot.docs.map((item) => item.id),
    });
  }
}

const summary = {
  dryRun,
  inputJsonPath,
  targetDateCount: dayEntries.length,
  targetSessionCount: dayEntries.reduce((count, [, day]) => count + (Array.isArray(day.sessions) ? day.sessions.length : 0), 0),
  rangeEndDateInclusive: RANGE_END_DATE,
  conflicts,
};

console.log(JSON.stringify(summary, null, 2));

if (conflicts.length > 0) {
  console.error("既存 sessions が対象日に存在するため中断しました。");
  process.exit(1);
}

if (dryRun) {
  console.log("dry-run のため Firestore への書き込みは実行していません。");
  process.exit(0);
}

for (const [date, day] of dayEntries) {
  const dayRef = doc(db, "scheduleDays", date);
  await setDoc(dayRef, {}, { merge: true });

  const sessions = Array.isArray(day.sessions) ? day.sessions : [];
  const batch = writeBatch(db);
  for (const session of sessions) {
    const sessionRef = doc(collection(db, "scheduleDays", date, "sessions"));
    batch.set(sessionRef, {
      order: Number(session.order ?? 0),
      startTime: String(session.startTime ?? ""),
      endTime: String(session.endTime ?? ""),
      type: String(session.type ?? "normal"),
      eventName: typeof session.eventName === "string" ? session.eventName : "",
      dutyRequirement: "duty",
      requiresShift: true,
      assignees: Array.isArray(session.assignees)
        ? session.assignees.filter((item) => typeof item === "string")
        : [],
      assigneeNameSnapshot:
        typeof session.assigneeNameSnapshot === "string" ? session.assigneeNameSnapshot : "",
      location: typeof session.location === "string" ? session.location : "",
      note: typeof session.note === "string" ? session.note : "",
    });
  }
  await batch.commit();
}

console.log(
  JSON.stringify(
    {
      applied: true,
      inputJsonPath,
      targetDateCount: summary.targetDateCount,
      targetSessionCount: summary.targetSessionCount,
    },
    null,
    2,
  ),
);
