import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
const intents = await readFile(new URL("../lib/question-intents.ts", import.meta.url), "utf8");
const route = await readFile(new URL("../app/api/chat/route.ts", import.meta.url), "utf8");

test("OPEN API는 검색·LLM보다 먼저 뉴스토어로 안내한다", () => {
  const api = page.indexOf("if (isOpenApiQuestion(cleanQuestion))");
  const search = page.indexOf("const searchHelp =");
  assert.ok(api >= 0 && search > api);
  assert.match(page, /뉴스토어에서 확인해 주세요/);
  assert.match(page, /OPEN_API_PURCHASE_URL/);
});

test("OPEN API 의도에 구매·인증키·호출 표현이 포함된다", () => {
  assert.match(intents, /open\\s\*api/);
  assert.match(intents, /인증키/);
  assert.match(intents, /호출/);
});

test("API 프록시는 클라이언트 답변 본문을 받지 않는다", () => {
  assert.match(route, /sourceIds/);
  assert.doesNotMatch(route, /payload\.sources/);
  assert.match(route, /정본 저장소 연동 후 제공/);
});
