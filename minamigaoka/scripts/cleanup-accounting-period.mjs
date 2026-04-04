import { initializeApp } from "firebase/app";
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  where,
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

const fiscalYear = Number(getArgValue("--fiscalYear") ?? "2025");
if (!Number.isFinite(fiscalYear)) {
  console.error("--fiscalYear が不正です。");
  process.exit(1);
}

const dryRun = !hasFlag("--apply");

const periodsCollection = collection(db, "accountingPeriods");
const periodAccountsCollection = collection(db, "accountingPeriodAccounts");
const transactionsCollection = collection(db, "accountingTransactions");
const accountsCollection = collection(db, "accountingAccounts");

const periodsSnapshot = await getDocs(query(periodsCollection, where("fiscalYear", "==", fiscalYear)));
const periodDocs = periodsSnapshot.docs.map((item) => ({
  id: item.id,
  ...item.data(),
}));
const periodIds = periodDocs.map((item) => item.id);

const periodAccountDocs = [];
const transactionDocs = [];

for (const periodId of periodIds) {
  const periodAccountsSnapshot = await getDocs(
    query(periodAccountsCollection, where("periodId", "==", periodId)),
  );
  periodAccountDocs.push(
    ...periodAccountsSnapshot.docs.map((item) => ({
      id: item.id,
      ...item.data(),
    })),
  );

  const transactionsSnapshot = await getDocs(
    query(transactionsCollection, where("periodId", "==", periodId)),
  );
  transactionDocs.push(
    ...transactionsSnapshot.docs.map((item) => ({
      id: item.id,
      ...item.data(),
    })),
  );
}

const referencedAccountIds = [...new Set(periodAccountDocs.map((item) => item.accountId).filter(Boolean))];
const existingAccounts = [];
for (const accountId of referencedAccountIds) {
  const snapshot = await getDocs(query(accountsCollection, where("__name__", "==", accountId)));
  existingAccounts.push(
    ...snapshot.docs.map((item) => ({
      id: item.id,
      ...item.data(),
    })),
  );
}

const summary = {
  dryRun,
  fiscalYear,
  deleteAccounts: false,
  counts: {
    periods: periodDocs.length,
    periodAccounts: periodAccountDocs.length,
    transactions: transactionDocs.length,
    referencedAccounts: referencedAccountIds.length,
  },
  periods: periodDocs.map((item) => ({
    id: item.id,
    label: item.label ?? null,
    state: item.state ?? null,
  })),
  referencedAccounts: existingAccounts.map((item) => ({
    id: item.id,
    name: item.name ?? null,
    sortOrder: item.sortOrder ?? null,
    isActive: item.isActive ?? null,
  })),
};

console.log(JSON.stringify(summary, null, 2));

if (periodDocs.length === 0) {
  console.log("対象年度の accountingPeriod は見つかりませんでした。");
  process.exit(0);
}

if (transactionDocs.length > 0) {
  console.error(
    `fiscalYear=${fiscalYear} には accountingTransactions が ${transactionDocs.length} 件あるため、自動削除を停止しました。`,
  );
  console.error("このスクリプトは空データ掃除用途です。取引が入っている年度には使わないでください。");
  process.exit(1);
}

if (dryRun) {
  console.log("dry-run のため Firestore への削除は行いません。");
  process.exit(0);
}

for (const item of periodAccountDocs) {
  await deleteDoc(doc(periodAccountsCollection, item.id));
}

for (const item of periodDocs) {
  await deleteDoc(doc(periodsCollection, item.id));
}

console.log(
  JSON.stringify(
    {
      applied: true,
      fiscalYear,
      deleted: {
        periods: periodDocs.length,
        periodAccounts: periodAccountDocs.length,
        transactions: 0,
      },
      keptAccounts: referencedAccountIds,
    },
    null,
    2,
  ),
);
