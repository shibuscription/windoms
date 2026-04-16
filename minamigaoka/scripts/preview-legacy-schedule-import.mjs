import fs from "node:fs";
import path from "node:path";

const RANGE_END_DATE = "2026-02-28";

const args = process.argv.slice(2);

const getArgValue = (flag) => {
  const index = args.indexOf(flag);
  if (index === -1) return null;
  return args[index + 1] ?? null;
};

const defaultInputCandidates = [
  "C:\\Users\\shibu\\Desktop\\windoms_schedule_import_guess_until_2026-02.csv",
  "/mnt/data/windoms_schedule_import_guess_until_2026-02.csv",
];

const defaultInputPath = defaultInputCandidates.find((candidate) => fs.existsSync(candidate)) ?? null;
const inputCsvPath = getArgValue("--input") ?? defaultInputPath;
const outputDir = path.resolve(process.cwd(), getArgValue("--out-dir") ?? "./migration-output");
const outputJsonPath = path.resolve(outputDir, "legacy-schedule-preview.json");
const outputMdPath = path.resolve(outputDir, "legacy-schedule-preview.md");

if (!inputCsvPath || !fs.existsSync(inputCsvPath)) {
  console.error("CSV ファイルが見つかりません。--input で指定してください。");
  process.exit(1);
}

const normalizeDate = (value) => {
  const source = String(value ?? "").trim();
  const match = source.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/);
  if (!match) return "";
  const [, year, month, day] = match;
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
};

const normalizeTime = (value) => {
  const source = String(value ?? "").trim();
  if (!source) return "";
  const match = source.match(/^(\d{1,2}):(\d{1,2})$/);
  if (!match) return source;
  const [, hour, minute] = match;
  return `${hour.padStart(2, "0")}:${minute.padStart(2, "0")}`;
};

const normalizeCell = (value) => String(value ?? "").trim();

const parseCsv = (csvText) => {
  const source = csvText.replace(/^\uFEFF/, "");
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;

  for (let index = 0; index < source.length; index += 1) {
    const ch = source[index];
    const next = source[index + 1];

    if (ch === '"') {
      if (inQuotes && next === '"') {
        cell += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (ch === "," && !inQuotes) {
      row.push(cell);
      cell = "";
      continue;
    }

    if ((ch === "\n" || ch === "\r") && !inQuotes) {
      if (ch === "\r" && next === "\n") {
        index += 1;
      }
      row.push(cell);
      cell = "";
      if (row.length > 1 || row[0] !== "") {
        rows.push(row);
      }
      row = [];
      continue;
    }

    cell += ch;
  }

  if (cell !== "" || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  if (rows.length === 0) return [];
  const headers = rows[0];
  return rows.slice(1).map((cells) => {
    const record = {};
    headers.forEach((header, headerIndex) => {
      record[header] = cells[headerIndex] ?? "";
    });
    return record;
  });
};

const mapSessionType = (value) => {
  const source = normalizeCell(value);
  if (source === "通常練習") return "normal";
  if (source === "自主練") return "self";
  if (source === "イベント") return "event";
  if (source === "その他") return "other";
  return "other";
};

const buildEventName = (row, type) => {
  if (type === "normal" || type === "self") return "";
  const guessedEventName = normalizeCell(row.guessedEventName);
  if (guessedEventName) return guessedEventName;
  const strippedTitle = normalizeCell(row.strippedTitle);
  if (strippedTitle) return strippedTitle;
  return normalizeCell(row.originalTitle);
};

const csvText = fs.readFileSync(inputCsvPath, "utf8");
const sourceRows = parseCsv(csvText);

const targetRows = [];
const excludedRowsAfterRange = [];
const invalidRows = [];

sourceRows.forEach((row, index) => {
  const date = normalizeDate(row.date);
  if (!date) {
    invalidRows.push({ rowNumber: index + 2, reason: "invalidDate", row });
    return;
  }
  if (date > RANGE_END_DATE) {
    excludedRowsAfterRange.push({ rowNumber: index + 2, date, row });
    return;
  }
  const startTime = normalizeTime(row.startTime);
  const endTime = normalizeTime(row.endTime);
  const type = mapSessionType(row.guessedType);
  const assigneeNameSnapshot = normalizeCell(row.guessedAssigneeName);
  const location = normalizeCell(row.guessedLocation);
  const note = normalizeCell(row.guessedNote);
  const eventName = buildEventName(row, type);

  targetRows.push({
    rowNumber: index + 2,
    date,
    startTime,
    endTime,
    type,
    eventName,
    assigneeNameSnapshot,
    location,
    note,
  });
});

const dayMap = new Map();
for (const row of targetRows) {
  if (!dayMap.has(row.date)) {
    dayMap.set(row.date, []);
  }
  dayMap.get(row.date).push(row);
}

const sortedDates = Array.from(dayMap.keys()).sort((left, right) => left.localeCompare(right));
const scheduleDays = {};

for (const date of sortedDates) {
  const rows = dayMap.get(date);
  rows.sort((left, right) => {
    const startCompare = left.startTime.localeCompare(right.startTime);
    if (startCompare !== 0) return startCompare;
    return left.rowNumber - right.rowNumber;
  });
  const sessions = rows.map((row, index) => {
    const session = {
      order: index + 1,
      startTime: row.startTime,
      endTime: row.endTime,
      type: row.type,
      eventName: row.eventName,
      assigneeNameSnapshot: row.assigneeNameSnapshot,
      location: row.location,
      note: row.note,
      dutyRequirement: "duty",
      assignees: [],
      requiresShift: true,
    };
    if (!session.eventName) delete session.eventName;
    if (!session.assigneeNameSnapshot) delete session.assigneeNameSnapshot;
    if (!session.location) delete session.location;
    if (!session.note) delete session.note;
    return session;
  });

  scheduleDays[date] = { sessions };
}

const preview = {
  generatedAt: new Date().toISOString(),
  sourceCsvPath: path.resolve(inputCsvPath),
  targetRange: {
    endDateInclusive: RANGE_END_DATE,
  },
  counts: {
    sourceRows: sourceRows.length,
    targetRows: targetRows.length,
    excludedRowsAfterRange: excludedRowsAfterRange.length,
    invalidRows: invalidRows.length,
    scheduleDayCount: sortedDates.length,
    sessionCount: targetRows.length,
  },
  collisionsPolicy: {
    onExistingSessions: "abort",
    requiresApplyFlag: true,
  },
  scheduleDays,
  excludedRowsAfterRange: excludedRowsAfterRange.map((item) => ({
    rowNumber: item.rowNumber,
    date: item.date,
    originalTitle: normalizeCell(item.row.originalTitle),
  })),
  invalidRows,
};

const markdownLines = [
  "# Legacy Schedule Preview",
  "",
  `- generatedAt: ${preview.generatedAt}`,
  `- sourceCsvPath: ${preview.sourceCsvPath}`,
  `- endDateInclusive: ${RANGE_END_DATE}`,
  `- sourceRows: ${preview.counts.sourceRows}`,
  `- targetRows: ${preview.counts.targetRows}`,
  `- excludedRowsAfterRange: ${preview.counts.excludedRowsAfterRange}`,
  `- invalidRows: ${preview.counts.invalidRows}`,
  `- scheduleDayCount: ${preview.counts.scheduleDayCount}`,
  "",
];

for (const date of sortedDates) {
  markdownLines.push(`## ${date}`);
  markdownLines.push("");
  markdownLines.push("| order | startTime | endTime | type | eventName | assigneeNameSnapshot | location | note |");
  markdownLines.push("| ---: | --- | --- | --- | --- | --- | --- | --- |");
  for (const session of scheduleDays[date].sessions) {
    markdownLines.push(
      `| ${session.order} | ${session.startTime} | ${session.endTime} | ${session.type} | ${session.eventName ?? ""} | ${session.assigneeNameSnapshot ?? ""} | ${session.location ?? ""} | ${session.note ?? ""} |`,
    );
  }
  markdownLines.push("");
}

fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(outputJsonPath, `${JSON.stringify(preview, null, 2)}\n`, "utf8");
fs.writeFileSync(outputMdPath, `${markdownLines.join("\n")}\n`, "utf8");

console.log(
  JSON.stringify(
    {
      ok: true,
      inputCsvPath: path.resolve(inputCsvPath),
      outputJsonPath,
      outputMarkdownPath: outputMdPath,
      counts: preview.counts,
    },
    null,
    2,
  ),
);
