import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(new URL("../lib/recommendation-engine.ts", import.meta.url), "utf8");
const output = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const moduleRecord = { exports: {} };
new Function("exports", "module", "require", output)(moduleRecord.exports, moduleRecord, () => ({}));
const engine = moduleRecord.exports;

const document = (id) => ({ id });
const context = (overrides = {}) => ({
  pageType: "HOME",
  loggedIn: null,
  activeMode: null,
  lastIntent: null,
  lastCapabilityId: null,
  searchContextStatus: "EMPTY",
  searchRevision: 0,
  recentRecommendationIds: [],
  ...overrides,
});

test("R01 HOME ranks the four primary entry purposes", () => {
  const result = engine.selectRecommendationBuckets(engine.rankRecommendations(context(), []));
  assert.deepEqual(result.primary.slice(0, 4).map((item) => item.candidate.id), ["news-find", "search-build", "feature-recommendation", "article-lookup"]);
});

test("R02 NEWS_SEARCH favors search build, refinement, and diagnosis", () => {
  const result = engine.rankRecommendations(context({ pageType: "NEWS_SEARCH", searchContextStatus: "ACTIVE", searchRevision: 1, lastIntent: "SEARCH_UPDATE" }), [document("manual-search-basic"), document("manual-download"), document("manual-search-operators")]);
  const ids = result.slice(0, 5).map((item) => item.candidate.id);
  assert.ok(ids.includes("search-build"));
  assert.ok(ids.includes("search-refine"));
  assert.ok(ids.includes("search-diagnosis"));
});

test("R03-R05 page context selects analysis, membership, and archive candidates", () => {
  const visualization = engine.rankRecommendations(context({ pageType: "VISUALIZATION" }), [document("manual-network-analysis"), document("manual-related-words"), document("manual-keyword-trend"), document("manual-report-create")]);
  const membership = engine.rankRecommendations(context({ pageType: "MEMBERSHIP" }), [document("support-member-policy"), document("manual-service-overview"), document("support-profile-edit")]);
  const archive = engine.rankRecommendations(context({ pageType: "OLD_NEWSPAPER" }), [document("manual-old-newspaper")]);
  assert.equal(visualization[0].candidate.id, "network-analysis");
  assert.equal(membership[0].candidate.id, "email-auth");
  assert.equal(archive[0].candidate.id, "old-newspaper-guide");
});

test("R06 active search context raises refinement", () => {
  const result = engine.rankRecommendations(context({ pageType: "NEWS_SEARCH", searchContextStatus: "ACTIVE", searchRevision: 2, lastIntent: "SEARCH_NEW" }), [document("manual-search-basic")]);
  assert.equal(result[0].candidate.id, "search-refine");
  assert.ok(result[0].reasons.includes("ACTIVE_SEARCH_CONTEXT"));
});

test("R07 recent recommendation receives a repetition penalty", () => {
  const fresh = engine.rankRecommendations(context({ pageType: "HOME" }), []);
  const repeated = engine.rankRecommendations(context({ pageType: "HOME", recentRecommendationIds: [fresh[0].candidate.id] }), []);
  assert.notEqual(repeated[0].candidate.id, fresh[0].candidate.id);
  assert.ok(repeated.some((item) => item.candidate.id === fresh[0].candidate.id && item.reasons.includes("REPEATED_IMMEDIATELY")));
});

test("R08 unavailable official source removes the candidate", () => {
  const result = engine.rankRecommendations(context({ pageType: "VISUALIZATION" }), []);
  assert.equal(result.some((item) => item.candidate.id === "network-analysis"), false);
});

test("R09 high-confidence deterministic ranking does not require rerank", () => {
  const highConfidenceContext = context({ pageType: "HOME", lastIntent: "SERVICE_OVERVIEW" });
  const result = engine.rankRecommendations(highConfidenceContext, []);
  assert.equal(engine.isGeminiRerankEligible(result, highConfidenceContext), false);
});

test("R10 low-confidence or tied recommendations can be reranked", () => {
  const lowConfidenceContext = context({ pageType: "UNKNOWN", lastIntent: "FEATURE_RECOMMENDATION" });
  const result = engine.rankRecommendations(lowConfidenceContext, []);
  assert.equal(engine.isGeminiRerankEligible(result, lowConfidenceContext), true);
});

test("R11 deterministic ranking remains the fallback when Gemini is unavailable", () => {
  const result = engine.rankRecommendations(context({ pageType: "VISUALIZATION" }), [document("manual-keyword-trend")]);
  assert.ok(result.length > 0);
  assert.equal(result.every((item) => item.source === "CONTEXT_RULE"), true);
});

test("R12 invalid rerank candidate IDs are removed and capped", () => {
  const result = engine.rankRecommendations(context({ pageType: "HOME" }), []);
  const ids = engine.validateRerankedRecommendationIds(["not-in-catalog", result[1].candidate.id, result[0].candidate.id, result[2].candidate.id, result[3].candidate.id], result, 3);
  assert.deepEqual(ids, [result[1].candidate.id, result[0].candidate.id, result[2].candidate.id]);
  assert.equal(engine.applyRerankedRecommendationIds(result, ids)[0].source, "LLM_RERANK");
});
