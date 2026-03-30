import type { FamilyRecord } from "./types";

const getFamilySortOrder = (family: FamilyRecord): number =>
  typeof family.sortOrder === "number" && Number.isFinite(family.sortOrder) ? family.sortOrder : Number.MAX_SAFE_INTEGER;

const compareFamilyName = (left: FamilyRecord, right: FamilyRecord): number => {
  const nameCompare = (left.name || "").localeCompare(right.name || "", "ja");
  if (nameCompare !== 0) return nameCompare;
  return left.id.localeCompare(right.id, "ja");
};

export const sortFamiliesByDisplayOrder = (rows: FamilyRecord[]): FamilyRecord[] =>
  [...rows].sort((left, right) => {
    const orderCompare = getFamilySortOrder(left) - getFamilySortOrder(right);
    if (orderCompare !== 0) return orderCompare;
    return compareFamilyName(left, right);
  });
