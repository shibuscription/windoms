import { mockData } from "./mockData";
import type { DemoData } from "../types";

export const dataSourceInfo = {
  mode: "mock",
  description: "Phase 1 は mockData を使用。Phase 2 以降に Firestore へ段階移行する。",
} as const;

export const loadInitialData = (): DemoData => mockData;
