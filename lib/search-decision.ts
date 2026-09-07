import { isPrimaryAnswerDocument } from "./knowledge-authority";
import type { SearchResult } from "./search";

export type SearchAction = "ANSWER" | "CLARIFY" | "NO_MATCH" | "ESCALATE";
export type SearchConfidence = "HIGH" | "MEDIUM" | "LOW";
export type SearchDecision = {
  action: SearchAction;
  confidence: SearchConfidence;
  candidates: SearchResult[];
  eligible?: SearchResult;
  reason: string;
};

function decisionConfidence(result: SearchResult | undefined): SearchConfidence {
  if (!result) return "LOW";
  if (result.exactMatch || result.score >= 38 || (result.score >= 26 && (result.matchedTerms?.length || 0) >= 2)) return "HIGH";
  if (result.score >= 12) return "MEDIUM";
  return "LOW";
}

export function decideSearch(query: string, results: SearchResult[]): SearchDecision {
  const candidates = results.filter((result) => result.item.status !== "SUPERSEDED");
  const top = candidates[0];
  // A lower-ranked current document must not silently override a higher-ranked
  // historical or review-required candidate.
  const eligible = top && isPrimaryAnswerDocument(top.item) ? top : undefined;
  const confidence = decisionConfidence(top);
  if (!top || confidence === "LOW") {
    return { action: "NO_MATCH", confidence: "LOW", candidates, reason: "관련 공식 문서를 충분히 식별하지 못했습니다." };
  }
  if (!eligible) {
    if (confidence === "MEDIUM" && !top.item.alwaysEscalate && top.item.authority !== "CURRENT_POLICY") {
      return { action: "CLARIFY", confidence, candidates, reason: "관련 후보는 있지만 현행 답변 근거로 확정하기에는 질문 범위가 넓습니다." };
    }
    return {
      action: top.item.alwaysEscalate || top.item.status === "REVIEW_REQUIRED" || top.item.authority === "HISTORICAL_QNA" || top.item.authority === "CURRENT_POLICY" ? "ESCALATE" : "NO_MATCH",
      confidence,
      candidates,
      reason: "후보 문서는 확인이 필요한 과거 Q&A 또는 정책 자료입니다.",
    };
  }
  if (confidence === "HIGH") return { action: "ANSWER", confidence, candidates, eligible, reason: "현행 공식 문서와 질문의 일치도가 충분합니다." };
  return { action: "CLARIFY", confidence, candidates, eligible, reason: "질문의 범위를 조금 더 좁히면 더 정확하게 안내할 수 있습니다." };
}
