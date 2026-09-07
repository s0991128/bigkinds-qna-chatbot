import { isApiCommercialQuestion, isApiErrorQuestion, isArticleContentQuestion, isBroadServiceQuestion, isChatbotMetaQuestion, isDateQuestion, isEscalationQuestion, isLikelyGeneralKnowledgeQuestion, isSearchUsageQuestion, isUnderspecifiedQuestion } from "./question-intents";
import { decideSearch, type SearchAction } from "./search-decision";
import { searchFaq, type SearchableDocument } from "./search";

export function classifyQuestion(question: string, documents: SearchableDocument[]): SearchAction {
  if (isChatbotMetaQuestion(question) || isDateQuestion(question)) return "ANSWER";
  if (isLikelyGeneralKnowledgeQuestion(question) || isArticleContentQuestion(question)) return "NO_MATCH";
  if (isApiCommercialQuestion(question) || isEscalationQuestion(question)) return "ESCALATE";
  if (isApiErrorQuestion(question)) return "ESCALATE";
  if (isSearchUsageQuestion(question)) return "ANSWER";
  if (isUnderspecifiedQuestion(question)) return "CLARIFY";
  if (isBroadServiceQuestion(question)) return "CLARIFY";
  return decideSearch(question, searchFaq(question, 8, documents)).action;
}
