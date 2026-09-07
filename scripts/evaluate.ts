import { readFile } from "node:fs/promises";
import { loadTrustedDocuments } from "../lib/server-knowledge";
import { classifyQuestion } from "../lib/routing";

type EvaluationCase = { id: string; question: string; expected: string };

const cases = JSON.parse(await readFile(new URL("../tests/eval-cases.json", import.meta.url), "utf8")) as { cases: EvaluationCase[] };
const documents = await loadTrustedDocuments();
const results = cases.cases.map((testCase) => ({ ...testCase, actual: classifyQuestion(testCase.question, documents) }));
const passed = results.filter((result) => result.actual === result.expected);
const byExpected = Object.fromEntries([...new Set(results.map((result) => result.expected))].map((expected) => [expected, {
  total: results.filter((result) => result.expected === expected).length,
  passed: results.filter((result) => result.expected === expected && result.actual === expected).length,
}]));
console.log(JSON.stringify({ total: results.length, passed: passed.length, accuracy: Number((passed.length / results.length).toFixed(3)), byExpected, mismatches: results.filter((result) => result.actual !== result.expected).slice(0, 20) }, null, 2));
if (results.length < 100) process.exit(1);
