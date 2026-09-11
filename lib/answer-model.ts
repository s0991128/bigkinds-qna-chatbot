import { formatAnswer } from "./answer-format";
import type { SearchableDocument } from "./search";
import { getDocumentSourceUrl } from "./source-link";

export type AnswerAction = { type: "OPEN_URL" | "OPEN_QNA" | "OPEN_FAQ" | "OPEN_API" | "COPY_SEARCH_QUERY" | "APPLY_SEARCH_QUERY"; label: string; url?: string; value?: string };
export type AnswerViewModel = {
  summary: string;
  details: string;
  steps: string[];
  cautions: string[];
  actions: AnswerAction[];
  source: { label: string; url?: string; effectiveDate?: string; authority?: string; status?: string };
};

function comparisonKey(value: string) {
  return value
    .toLocaleLowerCase("ko-KR")
    .replace(/[“”‘’'"`.,!?()[\]{}:;·-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function collapseConsecutiveDuplicates(paragraphs: string[]) {
  return paragraphs.filter((paragraph, index) => index === 0 || comparisonKey(paragraph) !== comparisonKey(paragraphs[index - 1]));
}

function isQuestionOrTitle(value: string, item: SearchableDocument) {
  const key = comparisonKey(value);
  if (!key) return false;
  return [item.question, item.title, ...(item.questions ?? [])]
    .filter((candidate): candidate is string => Boolean(candidate?.trim()))
    .some((candidate) => comparisonKey(candidate) === key);
}

function removeLeadingQuestionOrTitle(paragraphs: string[], item: SearchableDocument) {
  if (!paragraphs.length) return paragraphs;
  const lines = paragraphs[0].split("\n").map((line) => line.trim()).filter(Boolean);
  if (!lines.length || !isQuestionOrTitle(lines[0], item)) return paragraphs;
  const remainder = lines.slice(1).join("\n").trim();
  return remainder ? [remainder, ...paragraphs.slice(1)] : paragraphs.slice(1);
}

export function buildAnswerViewModel(item: SearchableDocument): AnswerViewModel {
  const formatted = formatAnswer(item.answer);
  const paragraphs = collapseConsecutiveDuplicates(formatted.split(/\n{2,}/).map((part) => part.trim()).filter(Boolean));
  const summary = item.summary?.trim() || paragraphs[0] || item.question;
  let remaining = paragraphs;
  if (remaining.length && comparisonKey(remaining[0]) === comparisonKey(summary)) remaining = remaining.slice(1);
  remaining = removeLeadingQuestionOrTitle(remaining, item);
  const details = collapseConsecutiveDuplicates(remaining).join("\n\n");
  const derivedSteps = item.steps?.length ? item.steps : remaining.filter((part) => /^\d+\.|^[•·-]/.test(part));
  const cautions = [...new Set([
    ...(item.cautions ?? []),
    ...(item.facts?.filter((fact) => /주의|유의|필요|제한|금지|다만|확인/.test(fact)) ?? []),
  ])];
  return {
    summary,
    details: comparisonKey(details) === comparisonKey(summary) ? "" : details,
    steps: derivedSteps,
    cautions,
    actions: [],
    source: {
      label: item.source?.label || "빅카인즈 공식 자료",
      url: getDocumentSourceUrl(item),
      effectiveDate: item.effectiveDate,
      authority: item.authority,
      status: item.status,
    },
  };
}
