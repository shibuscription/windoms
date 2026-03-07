const DEMO_NAME_WHITELIST = new Set([
  "瀬古",
  "大滝",
  "中村",
  "今井",
  "青木",
  "水野",
  "渋谷",
  "熊澤",
  "加藤",
  "井野",
]);

export const toDemoFamilyName = (name?: string, fallback = "-"): string => {
  const value = (name ?? "").trim();
  if (!value) return fallback;
  if (value === "-" || value === "—") return fallback;
  if (value === "井野") return value;
  const family = value
    .replace(/（.*?）/g, "")
    .replace(/家$/, "")
    .replace(/父|母|祖母|叔母|先生/g, "")
    .split(/[ 　]/)[0]
    ?.trim();
  if (!family) return fallback;
  return DEMO_NAME_WHITELIST.has(family) ? family : "中村";
};
