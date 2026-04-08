const bracketTitlePattern = /^\[(.+)\]$/;
const markdownTitlePattern = /^#{1,6}\s+(.+)$/;

function normalizeTitle(title?: string | null) {
  return title?.trim() || null;
}

function extractTitle(line: string) {
  const trimmed = line.trim();
  const bracketMatch = trimmed.match(bracketTitlePattern);

  if (bracketMatch) {
    return normalizeTitle(bracketMatch[1]);
  }

  const markdownMatch = trimmed.match(markdownTitlePattern);

  if (markdownMatch) {
    return normalizeTitle(markdownMatch[1]);
  }

  return null;
}

function collapseBlankLines(text: string) {
  return text.replace(/\n{3,}/g, '\n\n').trim();
}

function stripLeadingTitle(lines: string[], title: string) {
  const firstLineTitle = extractTitle(lines[0] ?? '');

  if (firstLineTitle !== title) {
    return lines;
  }

  const rest = lines.slice(1);

  if ((rest[0] ?? '').trim().length === 0) {
    return rest.slice(1);
  }

  return rest;
}

export function getSummaryTitle(content: string, title?: string) {
  const normalizedTitle = normalizeTitle(title);

  if (normalizedTitle) {
    return normalizedTitle;
  }

  const firstLine = content.replace(/\r\n/g, '\n').trim().split('\n')[0] ?? '';
  return extractTitle(firstLine);
}

export function formatSummaryContent(content: string, title?: string) {
  const normalizedContent = content.replace(/\r\n/g, '\n').trim();

  if (normalizedContent.length === 0) {
    return '';
  }

  const lines = normalizedContent.split('\n').map((line) => line.trimEnd());
  const existingTitle = extractTitle(lines[0] ?? '');
  const finalTitle = normalizeTitle(title) ?? existingTitle;

  if (!finalTitle) {
    return collapseBlankLines(normalizedContent);
  }

  const contentLines = stripLeadingTitle(lines, finalTitle);
  const body = collapseBlankLines(contentLines.join('\n'));

  if (body.length === 0) {
    return `[${finalTitle}]`;
  }

  return `[${finalTitle}]\n\n${body}`;
}
