import type { InstrumentStatus } from "../types";

export type InstrumentCategoryKey =
  | "woodwind"
  | "brass"
  | "drums"
  | "percussion"
  | "keyboardPercussion";

export const instrumentCategoryOptions: Array<{
  value: InstrumentCategoryKey;
  label: string;
  sortOrder: number;
}> = [
  { value: "woodwind", label: "木管楽器", sortOrder: 100 },
  { value: "brass", label: "金管楽器", sortOrder: 200 },
  { value: "drums", label: "ドラム", sortOrder: 300 },
  { value: "percussion", label: "小物打楽器", sortOrder: 400 },
  { value: "keyboardPercussion", label: "鍵盤打楽器", sortOrder: 500 },
];

export const instrumentStatusOptions: InstrumentStatus[] = [
  "良好",
  "要調整",
  "修理中",
  "貸出中",
];

export const normalizeInstrumentCategory = (value: unknown): InstrumentCategoryKey => {
  const normalized = typeof value === "string" ? value.replace(/\s+/g, "").toLowerCase() : "";
  if (normalized === "woodwind" || normalized === "木管楽器") return "woodwind";
  if (normalized === "brass" || normalized === "金管楽器") return "brass";
  if (normalized === "drums" || normalized === "drum" || normalized === "ドラム") return "drums";
  if (normalized === "keyboardpercussion" || normalized === "鍵盤打楽器") {
    return "keyboardPercussion";
  }
  if (normalized === "percussion" || normalized === "小物打楽器") return "percussion";
  return "percussion";
};

export const instrumentCategoryLabel = (value: unknown): string => {
  const key = normalizeInstrumentCategory(value);
  return instrumentCategoryOptions.find((item) => item.value === key)?.label ?? "小物打楽器";
};

export const instrumentCategorySortOrder = (value: unknown): number => {
  const key = normalizeInstrumentCategory(value);
  return instrumentCategoryOptions.find((item) => item.value === key)?.sortOrder ?? 999;
};
