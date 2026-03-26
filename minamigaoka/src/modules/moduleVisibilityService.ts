import { doc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "../config/firebase";
import {
  defaultModuleVisibilitySettings,
  sanitizeModuleVisibilitySettings,
  type ModuleVisibilitySettings,
} from "./menuVisibility";

const moduleVisibilityDoc = db ? doc(db, "appSettings", "menuVisibility") : null;

export const subscribeModuleVisibilitySettings = (
  onValue: (settings: ModuleVisibilitySettings) => void,
  onError?: (message: string) => void,
): (() => void) => {
  if (!moduleVisibilityDoc) {
    onValue(defaultModuleVisibilitySettings);
    return () => undefined;
  }

  return onSnapshot(
    moduleVisibilityDoc,
    (snapshot) => {
      const data = snapshot.data();
      onValue(sanitizeModuleVisibilitySettings(data?.modules));
    },
    (error) => {
      onError?.(error instanceof Error ? error.message : "モジュール設定の読み込みに失敗しました。");
      onValue(defaultModuleVisibilitySettings);
    },
  );
};

export const saveModuleVisibilitySettings = async (settings: ModuleVisibilitySettings): Promise<void> => {
  if (!moduleVisibilityDoc) {
    throw new Error("Firebase 設定が不足しているためモジュール設定を保存できません。");
  }

  await setDoc(
    moduleVisibilityDoc,
    {
      modules: settings,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
};
