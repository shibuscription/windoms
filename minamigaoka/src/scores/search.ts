import type { Score } from "../types";

const hiraToKatakana = (value: string): string =>
  value.replace(/[\u3041-\u3096]/g, (char) =>
    String.fromCharCode(char.charCodeAt(0) + 0x60),
  );

export const normalizeScoreSearchText = (value: string): string =>
  hiraToKatakana(value.normalize("NFKC")).toLowerCase().trim();

export const tokenizeScoreSearch = (value: string): string[] =>
  normalizeScoreSearchText(value)
    .split(/\s+/)
    .filter(Boolean);

export const buildScoreSearchHaystack = (score: Pick<Score, "title" | "publisher" | "productCode" | "note">): string =>
  normalizeScoreSearchText(
    [score.title, score.publisher, score.productCode, score.note]
      .filter(Boolean)
      .join(" "),
  );

export const scoreMatchesQuery = (
  score: Pick<Score, "title" | "publisher" | "productCode" | "note">,
  query: string,
): boolean => {
  const tokens = tokenizeScoreSearch(query);
  if (tokens.length === 0) return true;
  const haystack = buildScoreSearchHaystack(score);
  return tokens.every((token) => haystack.includes(token));
};
