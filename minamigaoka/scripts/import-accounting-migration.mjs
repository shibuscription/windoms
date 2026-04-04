import fs from "node:fs";
import path from "node:path";
import { initializeApp } from "firebase/app";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { getFirestore } from "firebase/firestore";

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

const defaultInputCandidates = [
  "/mnt/data/windoms-accounting-migration-preview.json",
  "C:\\Users\\shibu\\Desktop\\windoms-accounting-migration-preview.json",
];

const previewInputPath =
  getArgValue("--input") ??
  defaultInputCandidates.find((candidate) => fs.existsSync(candidate)) ??
  null;

if (!previewInputPath || !fs.existsSync(previewInputPath)) {
  console.error("preview JSON が見つかりません。--input で指定してください。");
  process.exit(1);
}

const dryRun = !hasFlag("--apply");

const ensureArray = (value) => {
  if (Array.isArray(value)) return value;
  if (value == null) return [];
  return [value];
};

const readJson = (filePath) =>
  JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""));

const migrationPreview = readJson(previewInputPath);

const period = migrationPreview.period;
const accounts = ensureArray(migrationPreview.accounts);
const openingBalances = ensureArray(migrationPreview.openingBalances);
const normalizedTransactions = migrationPreview.normalizedTransactions ?? {};
const incomes = ensureArray(normalizedTransactions.income);
const expenses = ensureArray(normalizedTransactions.expense);
const transfers = ensureArray(normalizedTransactions.transfer);
const skippedRows = ensureArray(migrationPreview.skippedRows);

const exceptionCandidates = skippedRows.filter(
  (row) =>
    row?.reason === "outsideFiscalPeriod" &&
    row?.date === "2025-08-28" &&
    row?.accountId === "cash_treasurer" &&
    row?.subject === "消耗品費" &&
    row?.memo === "印鑑ケース" &&
    Number(row?.expenseAmount) === 1370,
);

if (exceptionCandidates.length !== 1) {
  console.error(
    `移行例外の印鑑ケース行を 1 件だけ特定できませんでした。found=${exceptionCandidates.length}`,
  );
  process.exit(1);
}

const correctedExceptionExpense = {
  type: "expense",
  date: period.startDate,
  amount: 1370,
  accountId: "cash_treasurer",
  accountName: "現金（会計手元金）",
  categoryId: "expense_misc",
  oldSubject: "消耗品費",
  memo: "印鑑ケース",
  source: {
    kind: "migrationException",
    originalDate: "2025-08-28",
    reason: "outsideFiscalPeriod",
    previewInputPath,
  },
};

const finalExpenses = [...expenses, correctedExceptionExpense].sort((a, b) => {
  if (a.date !== b.date) return a.date.localeCompare(b.date);
  if ((a.accountId ?? "") !== (b.accountId ?? "")) return (a.accountId ?? "").localeCompare(b.accountId ?? "");
  return Number(a.amount ?? 0) - Number(b.amount ?? 0);
});

const fiscalYear = Number(period?.fiscalYear);
if (!Number.isFinite(fiscalYear)) {
  console.error("preview JSON の fiscalYear が不正です。");
  process.exit(1);
}

const targetPeriodId = `migration_${fiscalYear}`;
const targetPeriodLabel = `${fiscalYear}年度`;

const periodsCollection = collection(db, "accountingPeriods");
const accountsCollection = collection(db, "accountingAccounts");
const periodAccountsCollection = collection(db, "accountingPeriodAccounts");
const transactionsCollection = collection(db, "accountingTransactions");

const openingBalanceMap = new Map(
  openingBalances.map((item) => [item.accountId, Number(item.openingBalance ?? 0)]),
);

const periodAccountsPayload = accounts.map((account) => ({
  id: `${targetPeriodId}_${account.accountId}`,
  periodId: targetPeriodId,
  accountId: account.accountId,
  openingBalance: openingBalanceMap.get(account.accountId) ?? 0,
}));

const buildTransactionId = (kind, index) =>
  `${targetPeriodId}_${kind}_${String(index + 1).padStart(3, "0")}`;

const incomePayload = incomes.map((item, index) => ({
  id: buildTransactionId("income", index),
  periodId: targetPeriodId,
  type: "income",
  date: item.date,
  amount: Number(item.amount),
  categoryId: item.categoryId,
  memo: item.memo ?? null,
  accountId: item.accountId,
  fromAccountId: null,
  toAccountId: null,
  attachments: [],
  source: "manual",
}));

const expensePayload = finalExpenses.map((item, index) => ({
  id: buildTransactionId("expense", index),
  periodId: targetPeriodId,
  type: "expense",
  date: item.date,
  amount: Number(item.amount),
  categoryId: item.categoryId,
  memo: item.memo ?? null,
  accountId: item.accountId,
  fromAccountId: null,
  toAccountId: null,
  attachments: [],
  source: "manual",
}));

const transferPayload = transfers.map((item, index) => ({
  id: buildTransactionId("transfer", index),
  periodId: targetPeriodId,
  type: "transfer",
  date: item.date,
  amount: Number(item.amount),
  categoryId: null,
  memo: item.memo ?? null,
  accountId: null,
  fromAccountId: item.fromAccountId,
  toAccountId: item.toAccountId,
  attachments: [],
  source: "manual",
}));

const summary = {
  dryRun,
  previewInputPath: path.resolve(previewInputPath),
  targetPeriod: {
    id: targetPeriodId,
    fiscalYear,
    label: targetPeriodLabel,
    startDate: period.startDate,
    endDate: period.endDate,
    state: period.state,
  },
  accounts: accounts.map((item) => ({
    accountId: item.accountId,
    name: item.name,
    sortOrder: item.sortOrder,
    isActive: item.isActive,
  })),
  counts: {
    openingBalances: periodAccountsPayload.length,
    income: incomePayload.length,
    expense: expensePayload.length,
    transfer: transferPayload.length,
    exceptionCorrections: 1,
  },
};

console.log(JSON.stringify(summary, null, 2));

const existingAccountSnapshots = new Map();
for (const account of accounts) {
  const ref = doc(accountsCollection, account.accountId);
  const snapshot = await getDoc(ref);
  existingAccountSnapshots.set(account.accountId, snapshot);
  if (!snapshot.exists()) continue;
  const value = snapshot.data();
  const sameName = (value.name ?? "").trim() === account.name;
  const sameSortOrder = Number(value.sortOrder ?? 999) === Number(account.sortOrder ?? 999);
  const sameActive = value.isActive !== false;
  if (!sameName || !sameSortOrder || !sameActive) {
    console.error(`既存口座 ${account.accountId} の定義が preview と一致しないため停止しました。`);
    console.error(
      JSON.stringify(
        {
          existing: {
            name: value.name ?? null,
            sortOrder: value.sortOrder ?? null,
            isActive: value.isActive ?? null,
          },
          preview: account,
        },
        null,
        2,
      ),
    );
    process.exit(1);
  }
}

const existingPeriodsSnapshot = await getDocs(query(periodsCollection, where("fiscalYear", "==", fiscalYear)));
if (!existingPeriodsSnapshot.empty) {
  console.error(`fiscalYear=${fiscalYear} の accountingPeriod が既に存在するため停止しました。`);
  existingPeriodsSnapshot.docs.forEach((item) => {
    const value = item.data();
    console.error(`- ${item.id}: label=${value.label ?? ""} state=${value.state ?? ""}`);
  });
  process.exit(1);
}

const existingEditingSnapshot = await getDocs(query(periodsCollection, where("state", "==", "editing")));
if (!existingEditingSnapshot.empty) {
  console.error("既存の editing 期が存在するため停止しました。editing は常に 1 件のみです。");
  existingEditingSnapshot.docs.forEach((item) => {
    const value = item.data();
    console.error(`- ${item.id}: fiscalYear=${value.fiscalYear ?? ""} label=${value.label ?? ""}`);
  });
  process.exit(1);
}

if (dryRun) {
  console.log("dry-run のため Firestore への書き込みは行いません。");
  process.exit(0);
}

const batch = writeBatch(db);

batch.set(doc(periodsCollection, targetPeriodId), {
  label: targetPeriodLabel,
  fiscalYear,
  startDate: period.startDate,
  endDate: period.endDate,
  state: period.state ?? "editing",
  createdAt: serverTimestamp(),
  updatedAt: serverTimestamp(),
});

for (const account of accounts) {
  const existingSnapshot = existingAccountSnapshots.get(account.accountId);
  const accountPayload = {
    name: account.name,
    sortOrder: Number(account.sortOrder),
    isActive: account.isActive !== false,
    updatedAt: serverTimestamp(),
  };
  if (!existingSnapshot?.exists()) {
    accountPayload.createdAt = serverTimestamp();
  }
  batch.set(
    doc(accountsCollection, account.accountId),
    accountPayload,
    { merge: true },
  );
}

for (const periodAccount of periodAccountsPayload) {
  batch.set(doc(periodAccountsCollection, periodAccount.id), {
    periodId: periodAccount.periodId,
    accountId: periodAccount.accountId,
    openingBalance: Number(periodAccount.openingBalance),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

for (const transaction of [...incomePayload, ...expensePayload, ...transferPayload]) {
  batch.set(doc(transactionsCollection, transaction.id), {
    periodId: transaction.periodId,
    type: transaction.type,
    date: transaction.date,
    amount: transaction.amount,
    categoryId: transaction.categoryId,
    memo: transaction.memo,
    accountId: transaction.accountId,
    fromAccountId: transaction.fromAccountId,
    toAccountId: transaction.toAccountId,
    attachments: [],
    source: transaction.source,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

await batch.commit();

console.log(
  JSON.stringify(
    {
      applied: true,
      targetPeriodId,
      counts: summary.counts,
    },
    null,
    2,
  ),
);
