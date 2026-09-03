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
  assert.match(html, /공식 FAQ 23건/);
  assert.match(html, /필요한 답부터 찾으세요/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape|react-loading-skeleton/i);
});

test("embed route renders the same chatbot without demo chrome", async () => {
  const response = await render("/?embed=1");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /빅카인즈 이용 도우미/);
  assert.match(html, /dataScriptPaths|공식 FAQ 연결 중|공식 FAQ 23건/);
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
});
