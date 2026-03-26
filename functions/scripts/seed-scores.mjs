import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const args = process.argv.slice(2);

const getArgValue = (name) => {
  const exact = args.find((arg) => arg.startsWith(`${name}=`));
  if (exact) return exact.slice(name.length + 1);
  const index = args.indexOf(name);
  if (index >= 0) return args[index + 1] ?? "";
  return "";
};

const parseCsvRows = (csvText) => {
  const rows = [];
  let row = [];
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

  return rows.filter((currentRow) => currentRow.some((currentCell) => currentCell.trim() !== ""));
};

const toOptionalString = (value) => {
  const normalized = (value ?? "").trim();
  return normalized;
};

const parseScoresCsv = (csvText) => {
  const rows = parseCsvRows(csvText);
  if (rows.length <= 1) return [];

  return rows.slice(1).reduce((result, cols) => {
    const noRaw = (cols[0] ?? "").trim();
    const no = Number(noRaw);
    const title = (cols[1] ?? "").trim();
    if (!Number.isFinite(no) || !title) return result;

    result.push({
      id: String(no),
      no,
      title,
      productCode: toOptionalString(cols[2]),
      duration: toOptionalString(cols[3]),
      publisher: toOptionalString(cols[4]),
      note: toOptionalString(cols[5]),
    });
    return result;
  }, []);
};

const projectId = process.env.GCLOUD_PROJECT || getArgValue("--project");
const csvArg = getArgValue("--file");

if (!projectId) {
  console.error("projectId が必要です。--project または GCLOUD_PROJECT を指定してください。");
  process.exit(1);
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const defaultCsvPath = path.resolve(__dirname, "../../minamigaoka/public/data/scores.csv");
const csvPath = csvArg ? path.resolve(process.cwd(), csvArg) : defaultCsvPath;

initializeApp({ projectId });
const db = getFirestore();

const run = async () => {
  const csvText = await fs.readFile(csvPath, "utf8");
  const scores = parseScoresCsv(csvText);

  let successCount = 0;
  let failureCount = 0;

  for (const score of scores) {
    try {
      await db.collection("scores").doc(score.id).set(
        {
          no: score.no,
          title: score.title,
          productCode: score.productCode,
          duration: score.duration,
          publisher: score.publisher,
          note: score.note,
        },
        { merge: true },
      );
      successCount += 1;
    } catch (error) {
      failureCount += 1;
      console.error(
        JSON.stringify(
          {
            id: score.id,
            no: score.no,
            error: error instanceof Error ? error.message : String(error),
          },
          null,
          2,
        ),
      );
    }
  }

  console.log(
    JSON.stringify(
      {
        projectId,
        csvPath,
        targetCollection: "scores",
        totalCount: scores.length,
        successCount,
        failureCount,
      },
      null,
      2,
    ),
  );

  if (failureCount > 0) {
    process.exitCode = 1;
  }
};

run().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
