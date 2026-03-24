type ReceiptOcrLine = {
  index: number;
  text: string;
};

type NumberToken = {
  value: number;
  raw: string;
  start: number;
  end: number;
};

type AmountCandidate = {
  value: number;
  score: number;
  lineIndex: number;
  lineText: string;
  matchedText: string;
  reason: string[];
};

type TitleCandidate = {
  title: string;
  score: number;
  lineIndex: number;
  lineText: string;
  reason: string[];
};

type CropRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type OcrPreprocessDebug = {
  status: "success" | "failed" | "fallback_original";
  usedImage: "cropped" | "original";
  message: string;
  sourcePreviewDataUrl: string | null;
  processedPreviewDataUrl: string | null;
  detectedRect: CropRect | null;
  workingSize: {
    width: number;
    height: number;
  };
};

export type ReceiptOcrPhase =
  | "画像を準備中"
  | "レシートを検出中"
  | "文字を読み取り中"
  | "金額を抽出中";

type ReadReceiptSuggestionOptions = {
  onProgress?: (phase: ReceiptOcrPhase, progress: number) => void;
  shouldCancel?: () => boolean;
};

export class ReceiptOcrCanceledError extends Error {
  constructor() {
    super("receipt_ocr_canceled");
    this.name = "ReceiptOcrCanceledError";
  }
}

const STRONG_AMOUNT_KEYWORDS = [
  "合計",
  "ご利用額",
  "お支払",
  "ご請求額",
  "請求額",
  "現計",
  "クレジット",
  "pay",
  "paypay",
  "電子マネー",
  "お買上",
];

const MEDIUM_AMOUNT_KEYWORDS = ["税込", "小計", "現金"];

const AMOUNT_EXCLUDE_KEYWORDS = [
  "外税",
  "内税",
  "税",
  "お釣り",
  "釣り",
  "ポイント",
  "登録番号",
  "会員番号",
  "tel",
  "fax",
  "商品数",
  "日時",
  "伝票番号",
  "レジ番号",
  "郵便番号",
];

const TITLE_EXCLUDE_KEYWORDS = [
  "合計",
  "小計",
  "外税",
  "内税",
  "税",
  "お釣り",
  "クレジット",
  "pay",
  "ポイント",
  "登録番号",
  "登録no",
  "no.",
  "領収番号",
  "伝票番号",
  "レシート番号",
  "取引番号",
  "端末番号",
  "発行番号",
  "会員番号",
  "電話番号",
  "お問い合わせ",
  "インボイス",
  "適格請求書",
  "店舗番号",
  "レジ",
  "担当",
  "責no",
  "責任者",
  "取引日時",
  "発行日時",
  "tel",
  "fax",
  "レシート",
  "領収書",
];

const STORE_HINT_KEYWORDS = ["店", "店舗", "株式会社", "有限会社", "営業時間", "住所"];

const PREVIEW_MAX_EDGE = 280;
const WORKING_MAX_EDGE = 1400;

const loadImageElement = (file: File): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("failed to load image"));
    };
    img.src = url;
  });

const drawToMaxCanvas = (img: HTMLImageElement, maxEdge: number): HTMLCanvasElement => {
  const scale = Math.min(1, maxEdge / Math.max(img.naturalWidth, img.naturalHeight));
  const width = Math.max(1, Math.round(img.naturalWidth * scale));
  const height = Math.max(1, Math.round(img.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  ctx.drawImage(img, 0, 0, width, height);
  return canvas;
};

const buildPreviewDataUrl = (canvas: HTMLCanvasElement): string => {
  const ratio = Math.min(1, PREVIEW_MAX_EDGE / Math.max(canvas.width, canvas.height));
  if (ratio >= 1) return canvas.toDataURL("image/jpeg", 0.8);
  const preview = document.createElement("canvas");
  preview.width = Math.max(1, Math.round(canvas.width * ratio));
  preview.height = Math.max(1, Math.round(canvas.height * ratio));
  const ctx = preview.getContext("2d");
  if (!ctx) return canvas.toDataURL("image/jpeg", 0.8);
  ctx.drawImage(canvas, 0, 0, preview.width, preview.height);
  return preview.toDataURL("image/jpeg", 0.8);
};

const canvasToBlob = (canvas: HTMLCanvasElement): Promise<Blob | null> =>
  new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), "image/jpeg", 0.92);
  });

const detectReceiptRect = (canvas: HTMLCanvasElement): CropRect | null => {
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const { width, height } = canvas;
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;

  const border = Math.max(6, Math.round(Math.min(width, height) * 0.06));
  let borderSum = 0;
  let borderCount = 0;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const isBorder = x < border || y < border || x >= width - border || y >= height - border;
      if (!isBorder) continue;
      const idx = (y * width + x) * 4;
      const lum = data[idx] * 0.299 + data[idx + 1] * 0.587 + data[idx + 2] * 0.114;
      borderSum += lum;
      borderCount += 1;
    }
  }

  if (borderCount === 0) return null;
  const borderMean = borderSum / borderCount;

  const rowHits = new Array<number>(height).fill(0);
  const colHits = new Array<number>(width).fill(0);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = (y * width + x) * 4;
      const lum = data[idx] * 0.299 + data[idx + 1] * 0.587 + data[idx + 2] * 0.114;
      const diff = Math.abs(lum - borderMean);
      const brighterThanBorder = lum > borderMean + 16;
      const isForeground = brighterThanBorder || diff > 48;
      if (!isForeground) continue;
      rowHits[y] += 1;
      colHits[x] += 1;
    }
  }

  const rowThreshold = Math.max(8, Math.round(width * 0.08));
  const colThreshold = Math.max(8, Math.round(height * 0.08));

  let top = rowHits.findIndex((count) => count >= rowThreshold);
  let bottom = -1;
  for (let y = height - 1; y >= 0; y -= 1) {
    if (rowHits[y] >= rowThreshold) {
      bottom = y;
      break;
    }
  }

  let left = colHits.findIndex((count) => count >= colThreshold);
  let right = -1;
  for (let x = width - 1; x >= 0; x -= 1) {
    if (colHits[x] >= colThreshold) {
      right = x;
      break;
    }
  }

  if (top < 0 || left < 0 || bottom <= top || right <= left) return null;

  const rawWidth = right - left + 1;
  const rawHeight = bottom - top + 1;
  const areaRatio = (rawWidth * rawHeight) / (width * height);
  const aspect = rawWidth / rawHeight;

  if (areaRatio < 0.06 || areaRatio > 0.96) return null;
  if (aspect < 0.18 || aspect > 2.8) return null;

  const marginX = Math.round(rawWidth * 0.04);
  const marginY = Math.round(rawHeight * 0.04);

  top = Math.max(0, top - marginY);
  left = Math.max(0, left - marginX);
  bottom = Math.min(height - 1, bottom + marginY);
  right = Math.min(width - 1, right + marginX);

  return {
    x: left,
    y: top,
    width: right - left + 1,
    height: bottom - top + 1,
  };
};

const cropCanvas = (source: HTMLCanvasElement, rect: CropRect): HTMLCanvasElement => {
  const canvas = document.createElement("canvas");
  canvas.width = rect.width;
  canvas.height = rect.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  ctx.drawImage(source, rect.x, rect.y, rect.width, rect.height, 0, 0, rect.width, rect.height);
  return canvas;
};

const preprocessReceiptImage = async (
  file: File,
): Promise<{ input: Blob | File; debug: OcrPreprocessDebug }> => {
  try {
    const img = await loadImageElement(file);
    const sourceCanvas = drawToMaxCanvas(img, WORKING_MAX_EDGE);
    const sourcePreviewDataUrl = buildPreviewDataUrl(sourceCanvas);
    const detectedRect = detectReceiptRect(sourceCanvas);

    if (!detectedRect) {
      return {
        input: file,
        debug: {
          status: "fallback_original",
          usedImage: "original",
          message: "矩形検出に失敗したため元画像を使用",
          sourcePreviewDataUrl,
          processedPreviewDataUrl: null,
          detectedRect: null,
          workingSize: { width: sourceCanvas.width, height: sourceCanvas.height },
        },
      };
    }

    const croppedCanvas = cropCanvas(sourceCanvas, detectedRect);
    if (croppedCanvas.width < 120 || croppedCanvas.height < 120) {
      return {
        input: file,
        debug: {
          status: "fallback_original",
          usedImage: "original",
          message: "検出領域が小さすぎるため元画像を使用",
          sourcePreviewDataUrl,
          processedPreviewDataUrl: null,
          detectedRect,
          workingSize: { width: sourceCanvas.width, height: sourceCanvas.height },
        },
      };
    }

    const processedBlob = await canvasToBlob(croppedCanvas);
    if (!processedBlob) {
      return {
        input: file,
        debug: {
          status: "fallback_original",
          usedImage: "original",
          message: "トリミング画像生成に失敗したため元画像を使用",
          sourcePreviewDataUrl,
          processedPreviewDataUrl: null,
          detectedRect,
          workingSize: { width: sourceCanvas.width, height: sourceCanvas.height },
        },
      };
    }

    return {
      input: processedBlob,
      debug: {
        status: "success",
        usedImage: "cropped",
        message: "レシート領域を検出してトリミング",
        sourcePreviewDataUrl,
        processedPreviewDataUrl: buildPreviewDataUrl(croppedCanvas),
        detectedRect,
        workingSize: { width: sourceCanvas.width, height: sourceCanvas.height },
      },
    };
  } catch {
    return {
      input: file,
      debug: {
        status: "failed",
        usedImage: "original",
        message: "前処理でエラーが発生したため元画像を使用",
        sourcePreviewDataUrl: null,
        processedPreviewDataUrl: null,
        detectedRect: null,
        workingSize: { width: 0, height: 0 },
      },
    };
  }
};

const normalizeAmountChunk = (chunk: string): string =>
  chunk
    .replace(/[\s\u3000]+/g, "")
    .replace(/[，]/g, ",")
    .replace(/[．。]/g, ".")
    .replace(/(\d),(\d{3})(?!\d)/g, "$1,$2");

const normalizeOcrLine = (line: string): string => {
  let normalized = line.replace(/[ \t\u3000]+/g, " ").trim();

  normalized = normalized.replace(/(?:[¥￥]\s*)?\d(?:[\d\s,，\.。]){2,}(?:\s*円)?/g, (chunk) => {
    const cleaned = normalizeAmountChunk(chunk);
    return cleaned.length >= 3 ? cleaned : chunk;
  });

  normalized = normalized.replace(
    /[ぁ-んァ-ヶー一-龠a-zA-Zａ-ｚＡ-Ｚ](?:\s+[ぁ-んァ-ヶー一-龠a-zA-Zａ-ｚＡ-Ｚ]){1,}/g,
    (chunk) => chunk.replace(/\s+/g, ""),
  );

  normalized = normalized
    .replace(/([¥￥])\s+(\d)/g, "$1$2")
    .replace(/(\d)\s*[,，]\s*(\d)/g, "$1,$2")
    .replace(/(\d)\s+(\d)/g, "$1$2")
    .replace(/[ \t]+/g, " ")
    .trim();

  return normalized;
};

const normalizeOcrText = (raw: string): string =>
  raw
    .normalize("NFKC")
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map(normalizeOcrLine)
    .filter((line) => line.length > 0)
    .join("\n")
    .trim();

const normalizeLine = (line: string): string => line.replace(/\s+/g, " ").replace(/[｜|]/g, " ").trim();

const hasDateLike = (text: string): boolean =>
  /\d{4}[\/\-年]\d{1,2}[\/\-月]\d{1,2}/.test(text) || /\d{1,2}[\/\-]\d{1,2}[\/\-]\d{1,2,4}/.test(text);

const hasTimeLike = (text: string): boolean => /\b\d{1,2}:\d{2}(?::\d{2})?\b/.test(text);
const hasPhoneLike = (text: string): boolean => /0\d{1,4}-\d{1,4}-\d{3,4}/.test(text);
const hasPostalLike = (text: string): boolean => /〒?\d{3}-\d{4}/.test(text);

const lineHasAny = (line: string, keywords: string[]): boolean =>
  keywords.some((keyword) => line.toLowerCase().includes(keyword.toLowerCase()));

const japaneseRatio = (text: string): number => {
  const chars = Array.from(text);
  if (chars.length === 0) return 0;
  const jaCount = chars.filter((char) => /[ぁ-んァ-ヶ一-龠]/.test(char)).length;
  return jaCount / chars.length;
};

const numberRatio = (text: string): number => {
  const chars = Array.from(text);
  if (chars.length === 0) return 0;
  const numCount = chars.filter((char) => /[0-9]/.test(char)).length;
  return numCount / chars.length;
};

const looksLikeManagementCode = (text: string): boolean => {
  if (/\b(?:no\.?|id)\s*[:：]?\s*[a-z0-9\-]{3,}\b/i.test(text)) return true;
  if (/[A-Z0-9\-]{6,}/.test(text)) return true;
  if (/\d{3,}[-/]\d{2,}/.test(text)) return true;
  return false;
};

const parseAmountTokens = (text: string): NumberToken[] => {
  const tokens: NumberToken[] = [];
  const matches = text.matchAll(/(?:[¥￥]\s*)?(\d{1,3}(?:[,.]\d{3})+|\d{2,7})(?:\s*円)?/g);
  for (const match of matches) {
    const rawDigits = match[1];
    if (!rawDigits) continue;
    const value = Number(rawDigits.replace(/[,.]/g, ""));
    if (!Number.isFinite(value)) continue;
    if (value < 50 || value > 1000000) continue;
    const start = match.index ?? text.indexOf(match[0]);
    const end = start + match[0].length;
    tokens.push({ value, raw: match[0], start, end });
  }
  return tokens;
};

const buildLineEntries = (normalizedText: string): ReceiptOcrLine[] =>
  normalizedText
    .split(/\r?\n/)
    .map(normalizeLine)
    .filter((line) => line.length > 0)
    .map((text, index) => ({ index, text }));

const scoreAmountCandidate = (
  line: ReceiptOcrLine,
  token: NumberToken,
  lineCount: number,
  nearbyText: string,
): { score: number; reason: string[] } => {
  let score = 0;
  const reason: string[] = [];
  const lowerText = nearbyText.toLowerCase();

  if (lineHasAny(lowerText, STRONG_AMOUNT_KEYWORDS)) {
    score += 140;
    reason.push("strong-keyword");
  }
  if (lineHasAny(lowerText, MEDIUM_AMOUNT_KEYWORDS)) {
    score += 70;
    reason.push("medium-keyword");
  }
  if (lineHasAny(lowerText, AMOUNT_EXCLUDE_KEYWORDS)) {
    score -= 150;
    reason.push("exclude-keyword");
  }
  if (hasDateLike(line.text) || hasTimeLike(line.text) || hasPhoneLike(line.text) || hasPostalLike(line.text)) {
    score -= 170;
    reason.push("date-time-phone-like");
  }

  if (/¥|￥|円/.test(line.text)) {
    score += 22;
    reason.push("currency-mark");
  }
  if (token.raw.includes(",")) {
    score += 12;
    reason.push("comma-grouping");
  }
  if (token.start / Math.max(line.text.length, 1) >= 0.55) {
    score += 16;
    reason.push("line-tail");
  }
  if (token.value >= 300 && token.value <= 50000) {
    score += 16;
    reason.push("common-amount-range");
  } else if (token.value < 300) {
    score -= 35;
    reason.push("too-small");
  }
  if (token.raw.startsWith("(") || token.raw.endsWith(")")) {
    score -= 20;
    reason.push("bracketed");
  }

  score += Math.round((line.index / Math.max(lineCount - 1, 1)) * 38);
  reason.push("lower-line-bonus");

  return { score, reason };
};

const collectAmountCandidates = (lines: ReceiptOcrLine[]): AmountCandidate[] => {
  const candidates: AmountCandidate[] = [];
  for (const line of lines) {
    const tokens = parseAmountTokens(line.text);
    if (tokens.length === 0) continue;
    const nearbyText = [lines[line.index - 1]?.text, line.text, lines[line.index + 1]?.text]
      .filter(Boolean)
      .join(" ");
    for (const token of tokens) {
      const scored = scoreAmountCandidate(line, token, lines.length, nearbyText);
      candidates.push({
        value: token.value,
        score: scored.score,
        lineIndex: line.index,
        lineText: line.text,
        matchedText: nearbyText,
        reason: scored.reason,
      });
    }
  }
  return candidates.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return b.value - a.value;
  });
};

const selectAmount = (candidates: AmountCandidate[]): AmountCandidate | null => {
  const best = candidates[0] ?? null;
  if (!best) return null;
  const second = candidates[1] ?? null;
  const scoreGap = second ? best.score - second.score : 999;
  const hasStrongKeyword = best.reason.includes("strong-keyword");

  if (best.score >= 120) return best;
  if (best.score >= 95) return best;
  if (hasStrongKeyword && best.score >= 72) return best;
  if (best.score >= 88 && scoreGap >= 18) return best;
  if (best.score >= 78 && scoreGap >= 28) return best;

  return null;
};

const cleanItemName = (raw: string): string =>
  raw
    .replace(/^[\*\-・\s]+/, "")
    .replace(/^[A-Z0-9]{3,}\s+/, "")
    .replace(/[xX×]\s*\d+\s*$/, "")
    .trim();

const scoreTitleCandidate = (
  line: ReceiptOcrLine,
  title: string,
  hasPriceAtTail: boolean,
): { score: number; reason: string[] } => {
  let score = 0;
  const reason: string[] = [];
  const lowerText = line.text.toLowerCase();
  const jaRatio = japaneseRatio(title);
  const numRatio = numberRatio(title);

  if (lineHasAny(lowerText, TITLE_EXCLUDE_KEYWORDS)) {
    score -= 180;
    reason.push("exclude-keyword");
  }
  if (looksLikeManagementCode(line.text)) {
    score -= 130;
    reason.push("management-code-like");
  }
  if (hasDateLike(line.text) || hasTimeLike(line.text) || hasPhoneLike(line.text) || hasPostalLike(line.text)) {
    score -= 160;
    reason.push("date-time-phone-like");
  }
  if (lineHasAny(lowerText, STORE_HINT_KEYWORDS) && !hasPriceAtTail) {
    score -= 60;
    reason.push("store-info-like");
  }
  if (jaRatio >= 0.45) {
    score += 36;
    reason.push("high-japanese-ratio");
  } else if (jaRatio < 0.2) {
    score -= 60;
    reason.push("low-japanese-ratio");
  }
  if (numRatio >= 0.4) {
    score -= 80;
    reason.push("numeric-heavy");
  }
  if (hasPriceAtTail) {
    score += 30;
    reason.push("price-tail");
  }
  if (title.length >= 3 && title.length <= 22) {
    score += 18;
    reason.push("good-length");
  } else if (title.length > 30 || title.length < 2) {
    score -= 30;
    reason.push("bad-length");
  }
  if (/^[A-Za-z0-9\-\s.,/:]+$/.test(title)) {
    score -= 60;
    reason.push("ascii-heavy");
  }
  return { score, reason };
};

const collectTitleCandidates = (lines: ReceiptOcrLine[]): TitleCandidate[] => {
  const entries: TitleCandidate[] = [];
  for (const line of lines) {
    const hasPriceAtTail = /[¥￥]?\s*\d[\d,.]*\s*(円)?\s*$/.test(line.text);
    const amountMatch = hasPriceAtTail
      ? line.text.match(/^(.*?)(?:\s+[¥￥]?\d[\d,.]*\s*(?:円)?(?:\s*[xX×]\s*\d+)?)$/i)
      : null;
    const rawTitle = amountMatch ? amountMatch[1] : line.text;
    const title = cleanItemName(rawTitle);
    if (title.length < 2) continue;

    const scored = scoreTitleCandidate(line, title, hasPriceAtTail);
    if (scored.score < 0) continue;

    entries.push({
      title,
      score: scored.score,
      lineIndex: line.index,
      lineText: line.text,
      reason: scored.reason,
    });
  }

  return Array.from(new Map(entries.map((entry) => [entry.title, entry])).values()).sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const jaDiff = japaneseRatio(b.title) - japaneseRatio(a.title);
    if (jaDiff !== 0) return jaDiff > 0 ? 1 : -1;
    return a.lineIndex - b.lineIndex;
  });
};

const selectTitle = (candidates: TitleCandidate[]): TitleCandidate | null => {
  const best = candidates[0] ?? null;
  if (!best) return null;
  return best.score >= 62 ? best : null;
};

export type ReceiptOcrSuggestion = {
  title: string | null;
  amount: number | null;
  debug: {
    success: boolean;
    sourceImageIndex: number;
    preprocess: OcrPreprocessDebug;
    rawText: string;
    normalizedText: string;
    lines: ReceiptOcrLine[];
    amountCandidates: AmountCandidate[];
    selectedAmount: number | null;
    selectedAmountScore: number | null;
    titleCandidates: TitleCandidate[];
    selectedTitle: string | null;
    selectedTitleScore: number | null;
  };
};

const ensureNotCanceled = (shouldCancel?: () => boolean) => {
  if (shouldCancel?.()) {
    throw new ReceiptOcrCanceledError();
  }
};

const emitProgress = (
  onProgress: ReadReceiptSuggestionOptions["onProgress"],
  phase: ReceiptOcrPhase,
  progress: number,
) => {
  onProgress?.(phase, Math.min(1, Math.max(0, progress)));
};

export const readReceiptSuggestion = async (
  file: File,
  options?: ReadReceiptSuggestionOptions,
): Promise<ReceiptOcrSuggestion | null> => {
  emitProgress(options?.onProgress, "画像を準備中", 0.08);
  ensureNotCanceled(options?.shouldCancel);
  emitProgress(options?.onProgress, "レシートを検出中", 0.2);
  const preprocess = await preprocessReceiptImage(file);
  ensureNotCanceled(options?.shouldCancel);

  const { recognize } = await import("tesseract.js");
  const result = await recognize(preprocess.input, "jpn+eng", {
    logger: (message) => {
      if (message.status === "recognizing text") {
        emitProgress(options?.onProgress, "文字を読み取り中", 0.35 + message.progress * 0.5);
      }
    },
  });
  ensureNotCanceled(options?.shouldCancel);
  emitProgress(options?.onProgress, "金額を抽出中", 0.92);
  const rawText = result.data?.text?.trim() ?? "";
  const normalizedText = normalizeOcrText(rawText);
  const lines = normalizedText ? buildLineEntries(normalizedText) : [];

  const amountCandidates = collectAmountCandidates(lines);
  const titleCandidates = collectTitleCandidates(lines);
  const selectedAmount = selectAmount(amountCandidates);
  const selectedTitle = selectTitle(titleCandidates);
  const amount = selectedAmount?.value ?? null;
  const title = null;
  const success = amount !== null;
  emitProgress(options?.onProgress, "金額を抽出中", 1);

  return {
    title,
    amount,
    debug: {
      success,
      sourceImageIndex: 0,
      preprocess: preprocess.debug,
      rawText,
      normalizedText,
      lines,
      amountCandidates,
      selectedAmount: amount,
      selectedAmountScore: selectedAmount?.score ?? null,
      titleCandidates,
      selectedTitle: title,
      selectedTitleScore: selectedTitle?.score ?? null,
    },
  };
};
