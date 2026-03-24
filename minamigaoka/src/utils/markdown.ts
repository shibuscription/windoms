const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const toSafeUrl = (raw: string): string | null => {
  try {
    const url = new URL(raw);
    if (url.protocol === "http:" || url.protocol === "https:") return url.toString();
    return null;
  } catch {
    return null;
  }
};

const renderInlineMarkdown = (value: string): string => {
  const pattern =
    /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|`([^`]+)`|\*\*([^*]+)\*\*|\*([^*]+)\*|(https?:\/\/[^\s<]+)/g;
  let result = "";
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(value)) !== null) {
    result += escapeHtml(value.slice(lastIndex, match.index));
    if (match[1] && match[2]) {
      const safeUrl = toSafeUrl(match[2]);
      if (safeUrl) {
        result += `<a href="${escapeHtml(safeUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(match[1])}</a>`;
      } else {
        result += escapeHtml(match[0]);
      }
    } else if (match[3]) {
      result += `<code>${escapeHtml(match[3])}</code>`;
    } else if (match[4]) {
      result += `<strong>${escapeHtml(match[4])}</strong>`;
    } else if (match[5]) {
      result += `<em>${escapeHtml(match[5])}</em>`;
    } else if (match[6]) {
      const safeUrl = toSafeUrl(match[6]);
      if (safeUrl) {
        result += `<a href="${escapeHtml(safeUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(match[6])}</a>`;
      } else {
        result += escapeHtml(match[6]);
      }
    }
    lastIndex = pattern.lastIndex;
  }

  result += escapeHtml(value.slice(lastIndex));
  return result;
};

const flushParagraph = (lines: string[], blocks: string[]) => {
  if (lines.length === 0) return;
  blocks.push(`<p>${lines.map((line) => renderInlineMarkdown(line)).join("<br />")}</p>`);
  lines.length = 0;
};

const flushList = (items: string[], blocks: string[]) => {
  if (items.length === 0) return;
  blocks.push(`<ul>${items.map((item) => `<li>${renderInlineMarkdown(item)}</li>`).join("")}</ul>`);
  items.length = 0;
};

const flushQuote = (lines: string[], blocks: string[]) => {
  if (lines.length === 0) return;
  blocks.push(`<blockquote>${lines.map((line) => renderInlineMarkdown(line)).join("<br />")}</blockquote>`);
  lines.length = 0;
};

export const renderMarkdownToHtml = (markdown: string): string => {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const blocks: string[] = [];
  const paragraphLines: string[] = [];
  const listItems: string[] = [];
  const quoteLines: string[] = [];

  for (const line of lines) {
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    const listMatch = line.match(/^\s*[-*]\s+(.+)$/);
    const quoteMatch = line.match(/^\s*>\s?(.*)$/);

    if (!line.trim()) {
      flushParagraph(paragraphLines, blocks);
      flushList(listItems, blocks);
      flushQuote(quoteLines, blocks);
      continue;
    }

    if (headingMatch) {
      flushParagraph(paragraphLines, blocks);
      flushList(listItems, blocks);
      flushQuote(quoteLines, blocks);
      const level = headingMatch[1].length;
      blocks.push(`<h${level}>${renderInlineMarkdown(headingMatch[2])}</h${level}>`);
      continue;
    }

    if (listMatch) {
      flushParagraph(paragraphLines, blocks);
      flushQuote(quoteLines, blocks);
      listItems.push(listMatch[1]);
      continue;
    }

    if (quoteMatch) {
      flushParagraph(paragraphLines, blocks);
      flushList(listItems, blocks);
      quoteLines.push(quoteMatch[1]);
      continue;
    }

    flushList(listItems, blocks);
    flushQuote(quoteLines, blocks);
    paragraphLines.push(line);
  }

  flushParagraph(paragraphLines, blocks);
  flushList(listItems, blocks);
  flushQuote(quoteLines, blocks);
  return blocks.join("\n");
};
