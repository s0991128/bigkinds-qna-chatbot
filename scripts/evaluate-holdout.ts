import { readFile } from "node:fs/promises";
import { loadTrustedDocuments } from "../lib/server-knowledge";
import { classifyQuestion } from "../lib/routing";
import { decideSearch } from "../lib/search-decision";
import { searchFaq } from "../lib/search";

type HoldoutCase = {
  id: string;
  question: string;
  expectedAction: string;
  relevantIds?: string[];
  outOfScope?: boolean;
  policyCritical?: boolean;
};

const payload = JSON.parse(await readFile(new URL("../tests/holdout-eval.json", import.meta.url), "utf8")) as { cases: HoldoutCase[] };
const documents = await loadTrustedDocuments();
const results = payload.cases.map((testCase) => {
  const candidates = searchFaq(testCase.question, 8, documents);
  const decision = decideSearch(testCase.question, candidates);
  const actualAction = classifyQuestion(testCase.question, documents);
  const topIds = candidates.slice(0, 3).map((candidate) => candidate.item.id);
  const relevant = testCase.relevantIds ?? [];
  return {
    ...testCase,
    actualAction,
    decision: decision.action,
    top1: relevant.length > 0 && topIds[0] !== undefined && relevant.includes(topIds[0]),
    top3: relevant.length > 0 && relevant.some((id) => topIds.includes(id)),
    falseDirectAnswer: testCase.expectedAction !== "ANSWER" && actualAction === "ANSWER",
    outOfScopeFalseAnswer: Boolean(testCase.outOfScope && actualAction === "ANSWER"),
    policyCriticalWrong: Boolean(testCase.policyCritical && actualAction !== testCase.expectedAction),
  };
});
const relevantCases = results.filter((result) => (result.relevantIds ?? []).length > 0);
const top1 = relevantCases.filter((result) => result.top1).length;
const top3 = relevantCases.filter((result) => result.top3).length;
const routingPassed = results.filter((result) => result.actualAction === result.expectedAction).length;
const report = {
  total: results.length,
  routingAccuracy: Number((routingPassed / results.length).toFixed(3)),
  top1DocumentAccuracy: relevantCases.length ? Number((top1 / relevantCases.length).toFixed(3)) : null,
  top3Recall: relevantCases.length ? Number((top3 / relevantCases.length).toFixed(3)) : null,
  falseDirectAnswerCount: results.filter((result) => result.falseDirectAnswer).length,
  outOfScopeFalseAnswerCount: results.filter((result) => result.outOfScopeFalseAnswer).length,
  policyCriticalWrongAnswerCount: results.filter((result) => result.policyCriticalWrong).length,
  mismatches: results.filter((result) => result.actualAction !== result.expectedAction).map(({ id, question, expectedAction, actualAction, decision }) => ({ id, question, expectedAction, actualAction, decision })),
};
console.log(JSON.stringify(report, null, 2));
