import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

async function render(path = "/") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request(`http://localhost${path}`, { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the BIGKinds chatbot shell", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /빅카인즈 이용 도우미/);
  assert.match(html, /<strong>23<\/strong><span>공식 FAQ/);
  assert.match(html, /필요한 답부터 찾으세요/);
  assert.match(html, /저장된 공식 문서를 기준으로 안내합니다/);
  assert.match(html, /로그인 없이 공식 안내/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape|react-loading-skeleton/i);
});

test("embed route renders the same chatbot without demo chrome", async () => {
  const response = await render("/?embed=1");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /빅카인즈 이용 도우미/);
  assert.match(html, /dataScriptPaths|BIG KINDS|빅카인즈 이용/);
});

test("upstream source snapshot and widget assets are present", async () => {
  await Promise.all([
    access(new URL("../public/data/knowledge-base.js", import.meta.url)),
    access(new URL("../public/data/official-faq.js", import.meta.url)),
    access(new URL("../public/data/qna-data-21.js", import.meta.url)),
    access(new URL("../public/bigkinds-chatbot.js", import.meta.url)),
    access(new URL("../upstream-source/README.md", import.meta.url)),
  ]);

  const script = await readFile(new URL("../public/bigkinds-chatbot.js", import.meta.url), "utf8");
  assert.match(script, /chatbotUrl/);
  assert.match(script, /bigkinds-chatbot-close/);
  assert.match(script, /bigkinds-chatbot-context/);
  assert.match(script, /bigkinds-chatbot-action/);
});

test("Service Copilot modules and policy safeguards are present", async () => {
  const [context, builder, diagnostic, answer, feedback, intents, authority, privacy, decision] = await Promise.all([
    readFile(new URL("../lib/page-context.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/search-query-builder.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/diagnostic-flows.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/answer-model.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/feedback.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/question-intents.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/knowledge-authority.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/privacy.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/search-decision.ts", import.meta.url), "utf8"),
  ]);
  assert.match(context, /NEWS_SEARCH/);
  assert.match(context, /OPEN_API/);
  assert.match(builder, /AND/);
  assert.match(builder, /NOT/);
  assert.match(diagnostic, /SEARCH_NO_RESULT/);
  assert.match(diagnostic, /DOWNLOAD_PROBLEM/);
  assert.match(answer, /AnswerViewModel/);
  assert.match(feedback, /질문 원문은 저장하지 않습니다/);
  assert.match(intents, /detectSearchExpressionIntent/);
  assert.match(intents, /todayInKorea/);
  assert.match(intents, /isKnowledgeDocumentsQuestion/);
  assert.match(intents, /isLikelyGeneralKnowledgeQuestion/);
  assert.match(intents, /isArticleContentQuestion/);
  assert.match(intents, /isQnaRankingQuestion/);
  assert.match(intents, /isSearchUsageQuestion/);
  assert.match(authority, /HISTORICAL_QNA/);
  assert.match(privacy, /shouldSendToLlm/);
  assert.match(decision, /CLARIFY/);
});
