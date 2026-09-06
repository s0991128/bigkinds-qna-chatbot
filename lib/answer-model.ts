import { formatAnswer } from "./answer-format";
import type { SearchableDocument } from "./search";

export type AnswerAction = { type: "OPEN_URL" | "OPEN_QNA" | "OPEN_FAQ" | "OPEN_API" | "COPY_SEARCH_QUERY" | "APPLY_SEARCH_QUERY"; label: string; url?: string; value?: string };
export type AnswerViewModel = {
  summary: string;
  details: string;
  steps: string[];
  cautions: string[];
  actions: AnswerAction[];
  source: { label: string; url?: string; effectiveDate?: string; authority?: string; status?: string };
};

export function buildAnswerViewModel(item: SearchableDocument): AnswerViewModel {
  const paragraphs = formatAnswer(item.answer).split(/\n{2,}/).map((part) => part.trim()).filter(Boolean);
  const summary = paragraphs[0] || item.question;
  const derivedSteps = item.steps?.length ? item.steps : paragraphs.slice(1).filter((part) => /^\d+\.|^[•·-]/.test(part));
  const cautions = item.facts?.filter((fact) => /주의|유의|필요|제한|금지|다만|확인/.test(fact)) ?? [];
  return {
    summary,
    details: formatAnswer(item.answer),
    steps: derivedSteps,
    cautions,
    actions: [],
    source: {
      label: item.source?.label || "빅카인즈 공식 자료",
      url: item.source?.url,
      effectiveDate: item.effectiveDate,
      authority: item.authority,
      status: item.status,
    },
  };
}
