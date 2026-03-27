import { initializeApp } from "firebase/app";
import { getFirestore, doc, serverTimestamp, setDoc } from "firebase/firestore";

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

const seedItems = [
  { id: "photo-google", title: "Googleフォト", url: "https://photos.app.goo.gl/afyMZUo7YKrSaNHo9", type: "photo", role: "all" },
  { id: "sns-mamabrass-poppo", title: "ママブラス ぽっぽ（Instagram）", url: "https://www.instagram.com/mamabrass_poppo", type: "sns", role: "all" },
  { id: "sns-tono-wind", title: "東濃ウインドオーケストラ（Instagram）", url: "https://www.instagram.com/to_no_wind", type: "sns", role: "all" },
  { id: "sns-tokisho", title: "岐阜県立土岐商業高等学校吹奏楽団（Instagram）", url: "https://www.instagram.com/tokisho_w.e", type: "sns", role: "all" },
  { id: "sns-x-tajimi", title: "多治見高校吹奏楽部（X）", url: "https://x.com/tajimibrass", type: "sns", role: "all" },
  { id: "sns-gifu-fed", title: "岐阜県吹奏楽連盟", url: "https://www.ajba.or.jp/gifu/", type: "sns", role: "all" },
  { id: "admin-facility", title: "多治見市公共施設予約システム", url: "https://www2.pf489.com/tajimi/webR/", type: "admin", role: "officer" },
  { id: "admin-spoan", title: "スポあんネット", url: "https://www.spokyo.jp/", type: "admin", role: "officer" },
];

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

let successCount = 0;
let failureCount = 0;

for (const item of seedItems) {
  try {
    await setDoc(
      doc(db, "links", item.id),
      {
        title: item.title,
        url: item.url,
        type: item.type,
        role: item.role,
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
    successCount += 1;
    console.log(`OK  ${item.id}`);
  } catch (error) {
    failureCount += 1;
    console.error(`NG  ${item.id}`, error);
  }
}

console.log(
  JSON.stringify(
    {
      target: "links",
      total: seedItems.length,
      success: successCount,
      failure: failureCount,
    },
    null,
    2,
  ),
);
