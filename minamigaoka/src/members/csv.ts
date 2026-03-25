import { isValidLoginId, normalizeLoginId } from "../auth/loginId";
import { instrumentCodeSet } from "./instruments";
import {
  normalizeAdminRole,
  normalizeMemberStatus,
  normalizeMemberTypes,
  normalizeStaffPermissions,
  validateMemberTypes,
} from "./permissions";
import type {
  AdminRole,
  InstrumentCode,
  MemberRecord,
  MemberStatus,
  MemberType,
  SaveMemberInput,
  StaffPermission,
} from "./types";

export const memberCsvTemplateHeader = [
  "familyName",
  "name",
  "nameKana",
  "loginId",
  "memberTypes",
  "adminRole",
  "staffPermissions",
  "memberStatus",
  "enrollmentYear",
  "instrumentCodes",
  "notes",
].join(",");

export type ParsedMemberCsvRow = {
  rowNumber: number;
  familyName: string;
  input: SaveMemberInput;
};

export type MemberCsvValidationError = {
  rowNumber: number;
  message: string;
};

export type ParseMemberCsvResult = {
  rows: ParsedMemberCsvRow[];
  errors: MemberCsvValidationError[];
};

const splitCsvList = (value: string): string[] =>
  value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

export const parseCsvRows = (csvText: string): string[][] => {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < csvText.length; i += 1) {
    const ch = csvText[i];

    if (ch === '"') {
      if (inQuotes && csvText[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (!inQuotes && ch === ",") {
      row.push(cell);
      cell = "";
      continue;
    }

    if (!inQuotes && (ch === "\n" || ch === "\r")) {
      if (ch === "\r" && csvText[i + 1] === "\n") i += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      continue;
    }

    cell += ch;
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  return rows;
};

const parseEnrollmentYear = (value: string): number | null | "invalid" => {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (!/^\d{4}$/.test(trimmed)) return "invalid";
  const year = Number(trimmed);
  return Number.isFinite(year) ? year : "invalid";
};

export const parseMemberCsv = (
  csvText: string,
  members: MemberRecord[],
  familyNameToId: Record<string, string>,
): ParseMemberCsvResult => {
  const rows = parseCsvRows(csvText);
  if (rows.length <= 1) {
    return {
      rows: [],
      errors: [{ rowNumber: 1, message: "2行目以降に取り込み対象のデータがありません。" }],
    };
  }

  const errors: MemberCsvValidationError[] = [];
  const parsedRows: ParsedMemberCsvRow[] = [];
  const seenLoginIds = new Set<string>();
  const existingLoginIds = new Set(
    members.map((member) => normalizeLoginId(member.loginId)).filter(Boolean),
  );

  rows.slice(1).forEach((cols, index) => {
    const rowNumber = index + 2;
    const familyName = (cols[0] ?? "").trim();
    const name = (cols[1] ?? "").trim();
    const nameKana = (cols[2] ?? "").trim();
    const rawLoginId = (cols[3] ?? "").trim();
    const rawMemberTypes = splitCsvList((cols[4] ?? "").trim());
    const rawAdminRole = (cols[5] ?? "").trim();
    const rawStaffPermissions = splitCsvList((cols[6] ?? "").trim());
    const rawMemberStatus = (cols[7] ?? "").trim();
    const rawEnrollmentYear = (cols[8] ?? "").trim();
    const rawInstrumentCodes = splitCsvList((cols[9] ?? "").trim());
    const notes = (cols[10] ?? "").trim();

    if (!name) {
      errors.push({ rowNumber, message: "name は必須です。" });
      return;
    }

    if (!rawLoginId) {
      errors.push({ rowNumber, message: "loginId は必須です。" });
      return;
    }

    const loginId = normalizeLoginId(rawLoginId);
    if (!isValidLoginId(loginId)) {
      errors.push({ rowNumber, message: "loginId は英小文字・数字・.-_ のみ使用できます。" });
      return;
    }

    if (existingLoginIds.has(loginId) || seenLoginIds.has(loginId)) {
      errors.push({ rowNumber, message: "loginId が重複しています。" });
      return;
    }

    const memberTypes = normalizeMemberTypes(rawMemberTypes) as MemberType[];
    const hasUnknownMemberTypes = rawMemberTypes.length !== memberTypes.length;
    const memberTypesError =
      rawMemberTypes.length === 0
        ? "memberTypes は1つ以上必要です。"
        : hasUnknownMemberTypes
          ? `memberTypes に不正な値が含まれています: ${rawMemberTypes.join(",")}`
          : validateMemberTypes(memberTypes);
    if (memberTypesError) {
      errors.push({ rowNumber, message: memberTypesError });
      return;
    }

    const adminRole = normalizeAdminRole(rawAdminRole || "none") as AdminRole;
    if (rawAdminRole && adminRole !== rawAdminRole) {
      errors.push({ rowNumber, message: `adminRole が不正です: ${rawAdminRole}` });
      return;
    }

    const staffPermissions = normalizeStaffPermissions(rawStaffPermissions) as StaffPermission[];
    if (rawStaffPermissions.length !== staffPermissions.length) {
      errors.push({ rowNumber, message: `staffPermissions に不正な値が含まれています: ${rawStaffPermissions.join(",")}` });
      return;
    }

    const memberStatus = normalizeMemberStatus(rawMemberStatus || "active") as MemberStatus;
    if (rawMemberStatus && memberStatus !== rawMemberStatus) {
      errors.push({ rowNumber, message: `memberStatus が不正です: ${rawMemberStatus}` });
      return;
    }

    const enrollmentYear = parseEnrollmentYear(rawEnrollmentYear);
    if (enrollmentYear === "invalid") {
      errors.push({ rowNumber, message: "enrollmentYear は西暦4桁で入力してください。" });
      return;
    }

    const unknownInstrumentCodes = rawInstrumentCodes.filter((code) => !instrumentCodeSet.has(code as InstrumentCode));
    if (unknownInstrumentCodes.length > 0) {
      errors.push({
        rowNumber,
        message: `instrumentCodes に未知の code が含まれています: ${unknownInstrumentCodes.join(",")}`,
      });
      return;
    }

    const familyId = familyName ? familyNameToId[familyName] ?? "" : "";
    if (familyName && !familyId) {
      errors.push({ rowNumber, message: `familyName に一致する family がありません: ${familyName}` });
      return;
    }

    seenLoginIds.add(loginId);
    parsedRows.push({
      rowNumber,
      familyName,
      input: {
        familyId,
        name,
        nameKana,
        enrollmentYear,
        instrumentCodes: rawInstrumentCodes as InstrumentCode[],
        memberTypes,
        adminRole,
        staffPermissions,
        memberStatus,
        loginId,
        notes,
      },
    });
  });

  return { rows: parsedRows, errors };
};
