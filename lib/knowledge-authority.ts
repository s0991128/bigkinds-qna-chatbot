export type KnowledgeAuthority = "CURRENT_POLICY" | "OFFICIAL_FAQ" | "OFFICIAL_INTRO" | "VERIFIED_QNA" | "HISTORICAL_QNA";
export type KnowledgeStatus = "CURRENT" | "REVIEW_REQUIRED" | "SUPERSEDED";
export type KnowledgeReviewClass = "STATIC_ONLY" | "HUMAN_REVIEWED";

type AuthorityInput = {
  id: string;
  authority?: KnowledgeAuthority;
  status?: KnowledgeStatus;
  reviewClass?: KnowledgeReviewClass;
  reviewedAt?: string;
  requiresReview?: boolean;
};

export function applyKnowledgeAuthority<T extends AuthorityInput>(document: T): T {
  const authority = document.id.startsWith("qna-")
    ? (document.authority === "VERIFIED_QNA" && document.reviewedAt ? "VERIFIED_QNA" : "HISTORICAL_QNA")
    : document.id.startsWith("official-faq-")
      ? "OFFICIAL_FAQ"
      : document.id.startsWith("bigkinds-intro-")
        ? "OFFICIAL_INTRO"
        : document.authority || "CURRENT_POLICY";
  const explicitlyReviewedQna = authority === "VERIFIED_QNA" && Boolean(document.reviewedAt);
  const status = document.status === "SUPERSEDED"
    ? "SUPERSEDED"
    : explicitlyReviewedQna
      ? "CURRENT"
      : authority === "HISTORICAL_QNA" || document.requiresReview || document.reviewClass === "STATIC_ONLY"
        ? "REVIEW_REQUIRED"
        : document.status || "CURRENT";
  const reviewClass = explicitlyReviewedQna || (authority !== "HISTORICAL_QNA" && !document.requiresReview && document.reviewClass !== "STATIC_ONLY")
    ? "HUMAN_REVIEWED"
    : "STATIC_ONLY";
  return { ...document, authority, status, reviewClass, requiresReview: status === "REVIEW_REQUIRED" };
}

export function isPrimaryAnswerDocument(document: AuthorityInput) {
  return document.status === "CURRENT"
    && document.reviewClass === "HUMAN_REVIEWED"
    && (document.authority === "CURRENT_POLICY" || document.authority === "OFFICIAL_FAQ" || document.authority === "OFFICIAL_INTRO" || (document.authority === "VERIFIED_QNA" && Boolean(document.reviewedAt)));
}
