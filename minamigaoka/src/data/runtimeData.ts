import { mockData } from "./mockData";
import type { DemoData } from "../types";

export const dataSourceInfo = {
  mode: "mixed",
  description: "Firestore 正式化済みモジュールは Firestore を正とし、未移行モジュールのみ mockData を初期値として使う。",
} as const;

export const loadInitialData = (): DemoData => mockData;
