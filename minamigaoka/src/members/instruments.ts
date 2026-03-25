import type { InstrumentCode, InstrumentMasterItem } from "./types";

export const instrumentMaster: InstrumentMasterItem[] = [
  { code: "piccolo", label: "ピッコロ", sortOrder: 10, isActive: true, group: "woodwind" },
  { code: "flute", label: "フルート", sortOrder: 20, isActive: true, group: "woodwind" },
  { code: "clarinet", label: "クラリネット", sortOrder: 30, isActive: true, group: "woodwind" },
  { code: "oboe", label: "オーボエ", sortOrder: 40, isActive: true, group: "woodwind" },
  { code: "bassoon", label: "ファゴット", sortOrder: 50, isActive: true, group: "woodwind" },
  { code: "soprano_sax", label: "ソプラノサックス", sortOrder: 60, isActive: true, group: "woodwind" },
  { code: "alto_sax", label: "アルトサックス", sortOrder: 70, isActive: true, group: "woodwind" },
  { code: "tenor_sax", label: "テナーサックス", sortOrder: 80, isActive: true, group: "woodwind" },
  { code: "baritone_sax", label: "バリトンサックス", sortOrder: 90, isActive: true, group: "woodwind" },
  { code: "trumpet", label: "トランペット", sortOrder: 100, isActive: true, group: "brass" },
  { code: "horn", label: "ホルン", sortOrder: 110, isActive: true, group: "brass" },
  { code: "trombone", label: "トロンボーン", sortOrder: 120, isActive: true, group: "brass" },
  { code: "euphonium", label: "ユーフォニアム", sortOrder: 130, isActive: true, group: "brass" },
  { code: "tuba", label: "チューバ", sortOrder: 140, isActive: true, group: "brass" },
  { code: "bass", label: "ベース", sortOrder: 150, isActive: true, group: "other" },
  { code: "percussion", label: "パーカッション", sortOrder: 160, isActive: true, group: "other" },
];

export const activeInstrumentMaster = instrumentMaster
  .filter((item) => item.isActive)
  .sort((a, b) => a.sortOrder - b.sortOrder);

export const instrumentCodeSet = new Set<InstrumentCode>(instrumentMaster.map((item) => item.code));

export const instrumentLabelByCode = instrumentMaster.reduce<Record<InstrumentCode, string>>((result, item) => {
  result[item.code] = item.label;
  return result;
}, {} as Record<InstrumentCode, string>);

export const normalizeInstrumentCodes = (value: unknown): InstrumentCode[] => {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value.filter(
        (item): item is InstrumentCode => typeof item === "string" && instrumentCodeSet.has(item as InstrumentCode),
      ),
    ),
  );
};

export const formatInstrumentLabels = (codes: InstrumentCode[]): string =>
  codes.map((code) => instrumentLabelByCode[code]).filter(Boolean).join(", ");
