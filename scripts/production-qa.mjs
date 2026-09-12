import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import net from "node:net";

const cwd = process.cwd();
const baseUrl = (process.env.QA_BASE_URL || "https://bigkinds-qna-chatbot.kpf.axhub.ai").replace(/\/$/, "");
const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const artifactDir = path.join(cwd, "artifacts", "qa", timestamp);
const screenshotAll = process.env.QA_SCREENSHOT_ALL === "1";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function normalizeText(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function findChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    path.join(process.env.LOCALAPPDATA || "", "Google", "Chrome", "Application", "chrome.exe"),
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ].filter(Boolean);
  return candidates.find((candidate) => {
    try {
      return requireExists(candidate);
    } catch {
      return false;
    }
  });
}

function requireExists(candidate) {
  return existsSync(candidate);
}

async function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close(() => resolve(port));
    });
  });
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status} from ${url}`);
  return response.json();
}

async function terminateChrome(child) {
  if (!child?.pid) return;
  if (process.platform === "win32") {
    await new Promise((resolve) => {
      const killer = spawn("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
      killer.once("close", resolve);
      killer.once("error", resolve);
    });
  } else {
    child.kill("SIGKILL");
  }
}

async function removeTempProfile(profile) {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    try {
      await rm(profile, { recursive: true, force: true, maxRetries: 2, retryDelay: 100 });
      return;
    } catch (error) {
      if (attempt === 11) console.warn(`QA_PROFILE_CLEANUP_WARNING ${error instanceof Error ? error.message : String(error)}`);
      else await sleep(250);
    }
  }
}

class CdpPage {
  constructor(ws) {
    this.ws = ws;
    this.nextId = 1;
    this.pending = new Map();
    this.consoleErrors = [];
    this.ws.addEventListener("message", (event) => {
      try {
        const raw = typeof event.data === "string" ? event.data : Buffer.from(event.data).toString();
        const message = JSON.parse(raw);
        if (message.id && this.pending.has(message.id)) {
          const pending = this.pending.get(message.id);
          this.pending.delete(message.id);
          if (message.error) pending.reject(new Error(`${message.error.code}: ${message.error.message}`));
          else pending.resolve(message.result || {});
          return;
        }
        if (message.method === "Runtime.exceptionThrown") {
          this.consoleErrors.push(message.params?.exceptionDetails?.text || "Runtime exception");
        }
        if (message.method === "Runtime.consoleAPICalled" && ["error", "assert"].includes(message.params?.type)) {
          const values = message.params?.args || [];
          this.consoleErrors.push(values.map((item) => item.value ?? item.description ?? "").join(" ") || message.params.type);
        }
        if (message.method === "Log.entryAdded" && message.params?.entry?.level === "error") {
          this.consoleErrors.push(message.params.entry.text || "Browser log error");
        }
      } catch {
        this.consoleErrors.push("Unable to decode CDP message");
      }
    });
  }

  async connect() {
    await new Promise((resolve, reject) => {
      const onOpen = () => { cleanup(); resolve(); };
      const onError = (event) => { cleanup(); reject(new Error(`CDP WebSocket error: ${event?.message || "unknown"}`)); };
      const cleanup = () => {
        this.ws.removeEventListener("open", onOpen);
        this.ws.removeEventListener("error", onError);
      };
      this.ws.addEventListener("open", onOpen);
      this.ws.addEventListener("error", onError);
    });
    await this.send("Runtime.enable");
    await this.send("Log.enable");
    await this.send("Page.enable");
    await this.send("Network.enable");
  }

  send(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate(expression) {
    const result = await this.send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
      userGesture: true,
    });
    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.text || "Runtime evaluation failed");
    }
    return result.result?.value;
  }

  async navigate(url) {
    await this.send("Page.navigate", { url });
    await this.waitFor("document.readyState === 'complete'", 20000, `page load: ${url}`);
  }

  async reload() {
    await this.send("Page.reload", { ignoreCache: true });
    await this.waitFor("document.readyState === 'complete'", 20000, "page reload");
  }

  async waitFor(expression, timeoutMs = 10000, label = expression) {
    const deadline = Date.now() + timeoutMs;
    let lastError;
    while (Date.now() < deadline) {
      try {
        if (await this.evaluate(expression)) return;
      } catch (error) {
        lastError = error;
      }
      await sleep(100);
    }
    throw new Error(`Timed out waiting for ${label}${lastError ? ` (${lastError.message})` : ""}`);
  }

  async click(selector) {
    const encoded = JSON.stringify(selector);
    const clicked = await this.evaluate(`(() => { const element = document.querySelector(${encoded}); if (!element) return false; element.click(); return true; })()`);
    assert.equal(clicked, true, `Element not found: ${selector}`);
  }

  async clickByText(text, { exact = false, timeoutMs = 10000 } = {}) {
    const encoded = JSON.stringify(normalizeText(text));
    const expression = `(() => {
      const wanted = ${encoded};
      const normalize = (value) => String(value || '').replace(/\\s+/g, ' ').trim();
      const candidates = [...document.querySelectorAll('button, a, [role="button"]')];
      const element = candidates.find((candidate) => {
        const value = normalize(candidate.textContent);
        return ${exact ? "value === wanted" : "value === wanted || value.includes(wanted)"};
      });
      if (!element) return false;
      element.click();
      return true;
    })()`;
    await this.waitFor(expression, timeoutMs, `button: ${text}`);
  }

  async setInput(selector, value) {
    const encodedSelector = JSON.stringify(selector);
    const encodedValue = JSON.stringify(value);
    const result = await this.evaluate(`(() => {
      const element = document.querySelector(${encodedSelector});
      if (!element) return false;
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      setter?.call(element, ${encodedValue});
      if (!setter) element.value = ${encodedValue};
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    })()`);
    assert.equal(result, true, `Input not found: ${selector}`);
  }

  async text(selector = "body") {
    return this.evaluate(`document.querySelector(${JSON.stringify(selector)})?.innerText || ''`);
  }

  async count(selector) {
    return this.evaluate(`document.querySelectorAll(${JSON.stringify(selector)}).length`);
  }

  async exists(selector) {
    return this.evaluate(`Boolean(document.querySelector(${JSON.stringify(selector)}))`);
  }

  async latestAssistantText() {
    return this.evaluate(`([...document.querySelectorAll('[data-qa="assistant-message"]')].at(-1)?.innerText || '')`);
  }

  async stubClipboard() {
    await this.evaluate(`(() => {
      window.__QA_CLIPBOARD__ = '';
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText: async (value) => { window.__QA_CLIPBOARD__ = String(value); } },
      });
    })()`);
  }

  async stubWindowOpen() {
    await this.evaluate(`(() => {
      window.__QA_OPENED_URL__ = '';
      window.open = (url) => { window.__QA_OPENED_URL__ = String(url || ''); return null; };
    })()`);
  }

  async globalValue(name) {
    return this.evaluate(`window[${JSON.stringify(name)}] || ''`);
  }

  async screenshot(filePath) {
    const result = await this.send("Page.captureScreenshot", { format: "png" });
    await writeFile(filePath, Buffer.from(result.data, "base64"));
  }

  async close() {
    try { await this.ws.close(); } catch { /* already closed */ }
  }
}

async function launchChrome(chromePath) {
  const port = await freePort();
  const profile = path.join(os.tmpdir(), `bigkinds-production-qa-${process.pid}-${Date.now()}`);
  await mkdir(profile, { recursive: true });
  const args = [
    "--headless=new",
    "--disable-gpu",
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-extensions",
    "--incognito",
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`,
    "about:blank",
  ];
  const child = spawn(chromePath, args, { stdio: "ignore", windowsHide: true });
  const endpoint = `http://127.0.0.1:${port}`;
  let version;
  let lastError;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      version = await fetchJson(`${endpoint}/json/version`);
      break;
    } catch (error) {
      lastError = error;
      if (child.exitCode !== null) break;
      await sleep(100);
    }
  }
  if (!version?.webSocketDebuggerUrl) {
    await terminateChrome(child);
    await removeTempProfile(profile);
    throw new Error(`Chrome CDP endpoint did not start${lastError ? `: ${lastError.message}` : ""}`);
  }
  const targets = await fetchJson(`${endpoint}/json/list`);
  const target = targets.find((item) => item.type === "page") || targets[0];
  if (!target?.webSocketDebuggerUrl) {
    await terminateChrome(child);
    await removeTempProfile(profile);
    throw new Error("Chrome CDP page target was not found");
  }
  const page = new CdpPage(new WebSocket(target.webSocketDebuggerUrl));
  await page.connect();
  return {
    page,
    async close() {
      await page.close();
      await terminateChrome(child);
      await sleep(250);
      await removeTempProfile(profile);
    },
  };
}

async function prepare(page) {
  const cleanUrl = new URL(baseUrl);
  cleanUrl.searchParams.set("qa-run", `${Date.now()}`);
  const storageReset = await page.send("Page.addScriptToEvaluateOnNewDocument", {
    source: "if (location.search.includes('qa-run=')) { localStorage.clear(); sessionStorage.clear(); }",
  });
  await page.navigate(cleanUrl.toString());
  await page.waitFor("document.querySelector('[data-qa-ready=\\\"true\\\"]') !== null", 60000, "initial app readiness");
  if (storageReset.identifier) await page.send("Page.removeScriptToEvaluateOnNewDocument", { identifier: storageReset.identifier });
  if (await page.exists('[data-qa="chat-launcher"]')) {
    await page.click('[data-qa="chat-launcher"]');
  }
  await page.waitFor("document.querySelector('[data-qa=\\\"chat-widget\\\"]') !== null", 10000, "chat widget");
}

async function closeChat(page) {
  if (await page.exists('[data-qa="chat-close"]')) {
    await page.click('[data-qa="chat-close"]');
    await page.waitFor("document.querySelector('[data-qa=\\\"chat-widget\\\"]') === null", 5000, "chat close");
  }
}

async function ask(page, question) {
  const before = await page.count('[data-qa="assistant-message"]');
  await page.setInput('[data-qa="chat-input"]', question);
  await page.click('[data-qa="chat-send"]');
  await page.waitFor(`document.querySelectorAll('[data-qa="assistant-message"]').length > ${before}`, 15000, `answer for ${question}`);
  await page.waitFor(`document.querySelector('[data-qa-ready="true"]') !== null`, 15000, `answer settled for ${question}`);
}

async function expectIntent(page, intent) {
  await page.waitFor(`document.querySelector('[data-qa="assistant-message"][data-qa-intent="${intent}"]') !== null`, 10000, `intent ${intent}`);
}

async function expectDecisionSource(page, source) {
  await page.waitFor(`([...document.querySelectorAll('[data-qa="assistant-message"]')].at(-1)?.getAttribute('data-qa-decision-source')) === ${JSON.stringify(source)}`, 10000, `decision source ${source}`);
}

async function expectAnswerOrigin(page, origin) {
  await page.waitFor(`([...document.querySelectorAll('[data-qa="assistant-message"]')].at(-1)?.getAttribute('data-qa-answer-origin')) === ${JSON.stringify(origin)}`, 10000, `answer origin ${origin}`);
}

async function expectSearchQuery(page, query) {
  await page.waitFor(`document.querySelector('[data-qa="assistant-message"] .search-query-answer code')?.textContent === ${JSON.stringify(query)}`, 10000, `search query ${query}`);
}

function expectIncludes(text, value, label = value) {
  assert.ok(String(text).includes(value), `${label} was not found in answer`);
}

function expectNotIncludes(text, value, label = value) {
  assert.ok(!String(text).includes(value), `${label} was unexpectedly found in answer`);
}

async function runScenario(page, scenario) {
  const startedAt = Date.now();
  const consoleStart = page.consoleErrors.length;
  const result = { id: scenario.id, name: scenario.name, status: "PASS", durationMs: 0, consoleErrors: [] };
  try {
    await prepare(page);
    await scenario.run(page, result);
  } catch (error) {
    result.status = "FAIL";
    result.error = error instanceof Error ? error.message : String(error);
    await mkdir(artifactDir, { recursive: true });
    result.screenshot = path.join(artifactDir, `${scenario.id}.png`);
    try { await page.screenshot(result.screenshot); } catch (screenshotError) { result.screenshotError = String(screenshotError); }
  }
  result.durationMs = Date.now() - startedAt;
  result.consoleErrors = page.consoleErrors.slice(consoleStart);
  return result;
}

async function runButtonCheck(page, name, run) {
  try {
    await run();
    return { name, status: "PASS" };
  } catch (error) {
    await mkdir(artifactDir, { recursive: true });
    const screenshot = path.join(artifactDir, `button-${name.replace(/[^a-z0-9]+/gi, "-")}.png`);
    try { await page.screenshot(screenshot); } catch { /* report the original failure */ }
    return { name, status: "FAIL", error: error instanceof Error ? error.message : String(error), screenshot };
  }
}

async function main() {
  const chromePath = findChrome();
  if (!chromePath) {
    console.log("QA_SKIPPED_CHROME_NOT_FOUND");
    process.exitCode = 2;
    return;
  }
  await mkdir(artifactDir, { recursive: true });
  const report = {
    generatedAt: new Date().toISOString(),
    chromePath,
    cdp: "Node built-in WebSocket",
    baseUrl,
    scenarios: [],
    buttons: [],
    pages: [],
    consoleErrors: [],
  };
  let browser;
  try {
    browser = await launchChrome(chromePath);
    const page = browser.page;
    const scenarios = [
      { id: "S01", name: "service overview", run: async (p) => { await ask(p, "빅카인즈가 뭐야?"); await expectIntent(p, "SERVICE_OVERVIEW"); } },
      { id: "S02", name: "service coverage and old newspaper", run: async (p, result) => { await ask(p, "1990년대 이전 뉴스도 검색되나요?"); await expectIntent(p, "SERVICE_FACT"); const text = await p.latestAssistantText(); expectIncludes(text, "1990"); expectIncludes(text, "고신문"); result.answer = text; } },
      { id: "S03", name: "multi-turn search update", run: async (p, result) => { await ask(p, "인공지능과 반도체를 모두 포함한 검색식을 만들어줘"); await expectIntent(p, "SEARCH_NEW"); const first = await p.latestAssistantText(); expectIncludes(first, "인공지능 AND 반도체"); expectNotIncludes(first, "AND 모두"); await ask(p, "전기차도 추가해줘"); await expectIntent(p, "SEARCH_UPDATE"); const second = await p.latestAssistantText(); expectIncludes(second, "인공지능"); expectIncludes(second, "반도체"); expectIncludes(second, "전기차"); result.query = second; } },
      { id: "S04", name: "search result diagnosis", run: async (p) => { await ask(p, "검색결과가 너무 많아"); await expectIntent(p, "SEARCH_RESULT_DIAGNOSIS"); } },
      { id: "S05", name: "network analysis recommendation", run: async (p) => { await ask(p, "기업들이 함께 등장하는 관계를 보고 싶어"); await expectIntent(p, "FEATURE_RECOMMENDATION"); await p.waitFor("document.querySelector('[data-qa-capability=\\\"NETWORK_ANALYSIS\\\"]') !== null", 10000, "network analysis capability"); } },
      { id: "S06", name: "historical article lookup", run: async (p) => { await ask(p, "1997년 7월 신문에 실린 수상자 명단을 찾고 싶어"); await expectIntent(p, "HISTORICAL_ARTICLE_LOOKUP"); await p.waitFor("document.querySelector('[data-qa=\\\"lookup-case\\\"]') !== null", 10000, "lookup case"); await p.clickByText("이 조건으로 찾기", { exact: true }); await p.waitFor("document.querySelector('[data-qa=\\\"lookup-strategies\\\"]') !== null", 10000, "lookup strategies"); } },
      { id: "S07", name: "multi-issue search support", run: async (p) => { await ask(p, "검색결과가 0건이고 검색기간도 선택할 수 없어요"); await expectIntent(p, "SUPPORT_TRIAGE"); const issues = await p.evaluate("document.querySelector('[data-qa=\\\"support-case\\\"]')?.getAttribute('data-qa-support-issues') || ''"); expectIncludes(issues, "SEARCH_NO_RESULT"); expectIncludes(issues, "SEARCH_FILTER_PROBLEM"); } },
      { id: "S08", name: "membership email support", run: async (p) => { await ask(p, "가입 이메일을 잘못 입력해서 인증메일을 못 받고 있어요"); await expectIntent(p, "SUPPORT_TRIAGE"); const issues = await p.evaluate("document.querySelector('[data-qa=\\\"support-case\\\"]')?.getAttribute('data-qa-support-issues') || ''"); expectIncludes(issues, "MEMBERSHIP_EMAIL_PROBLEM"); } },
      { id: "S09", name: "audio support", run: async (p) => { await ask(p, "뉴스 듣기 버튼을 누르면 오류가 납니다"); await expectIntent(p, "SUPPORT_TRIAGE"); const issues = await p.evaluate("document.querySelector('[data-qa=\\\"support-case\\\"]')?.getAttribute('data-qa-support-issues') || ''"); expectIncludes(issues, "AUDIO_PLAYBACK_PROBLEM"); expectNotIncludes(await p.latestAssistantText(), "캐시"); } },
      { id: "S10", name: "license policy handoff", run: async (p) => { await ask(p, "AI로 기사 요약을 만들어 유료회원에게 제공해도 되나요?"); await expectIntent(p, "SUPPORT_TRIAGE"); const issues = await p.evaluate("document.querySelector('[data-qa=\\\"support-case\\\"]')?.getAttribute('data-qa-support-issues') || ''"); expectIncludes(issues, "RIGHTS_LICENSE"); const text = await p.latestAssistantText(); ["허용됩니다", "이용 가능합니다", "무료입니다"].forEach((term) => expectNotIncludes(text, term)); await p.stubWindowOpen(); await p.clickByText("공식 문의하기", { exact: true }); await p.waitFor("window.__QA_OPENED_URL__ !== ''", 5000, "official inquiry action"); } },
      { id: "S11", name: "research policy handoff", run: async (p) => { await ask(p, "비영리 연구용으로 다운로드한 기사를 Python으로 분석해도 되나요?"); await expectIntent(p, "SUPPORT_TRIAGE"); const issues = await p.evaluate("document.querySelector('[data-qa=\\\"support-case\\\"]')?.getAttribute('data-qa-support-issues') || ''"); expectIncludes(issues, "RIGHTS_RESEARCH"); const text = await p.latestAssistantText(); ["허용됩니다", "이용 가능합니다", "무료입니다"].forEach((term) => expectNotIncludes(text, term)); } },
      { id: "S12", name: "open api redirect", run: async (p) => { await ask(p, "OPEN API 데이터를 외부 AI에 보내도 되나요?"); await expectIntent(p, "OPEN_API_REDIRECT"); await p.stubWindowOpen(); await p.clickByText("뉴스토어 OPEN API 확인"); const opened = await p.globalValue("__QA_OPENED_URL__"); assert.match(opened, /^https?:\/\//, "OPEN API action did not open an official URL"); } },
      { id: "S13", name: "article unsupported", run: async (p) => { await ask(p, "이 기사 요약해줘"); await expectIntent(p, "ARTICLE_UNSUPPORTED"); assert.equal(await p.exists(".search-query-answer"), false, "unsupported article request produced a search query"); } },
      { id: "S14", name: "out of scope", run: async (p) => { await ask(p, "오늘 날씨 어때?"); await expectIntent(p, "OUT_OF_SCOPE"); } },
      { id: "S15", name: "search usage guide", run: async (p) => { await ask(p, "검색식 사용법을 알려줘"); await expectIntent(p, "SERVICE_GUIDE"); const text = await p.latestAssistantText(); ["AND", "OR", "NOT"].forEach((term) => expectIncludes(text, term)); assert.equal(await p.exists(".search-query-answer"), false, "search usage guide produced a search query"); } },
      { id: "S16", name: "grammatical stop words", run: async (p) => { await ask(p, "공공기관 지방이전에 관한 뉴스 찾고 싶어요"); await expectIntent(p, "SEARCH_NEW"); const text = await p.latestAssistantText(); expectIncludes(text, "공공기관 AND 지방이전"); expectNotIncludes(text, "관한"); } },
      { id: "S17", name: "keyword trend recommendation", run: async (p) => { await ask(p, "빅카인즈에 대한 보도량 추이를 살펴보고 싶어요"); await expectIntent(p, "FEATURE_RECOMMENDATION"); await p.waitFor("document.querySelector('[data-qa-capability=\\\"KEYWORD_TREND\\\"]') !== null", 10000, "keyword trend capability"); assert.equal(await p.exists(".search-query-answer"), false, "keyword trend request produced a search query"); } },
      { id: "S18", name: "exact historical lookup regression", run: async (p) => { await ask(p, "1997년 7월경 매일경제에 실린 아시아나 직원의 노동부 장관 표창 명단을 찾고 싶어요."); await expectIntent(p, "HISTORICAL_ARTICLE_LOOKUP"); await p.waitFor("document.querySelector('[data-qa=\\\"lookup-case\\\"]')?.getAttribute('data-qa-ready') === 'true'", 10000, "historical lookup ready"); await p.waitFor("document.querySelector('[data-qa=\\\"chat-input\\\"]')?.disabled === false", 5000, "historical lookup input enabled"); } },
      { id: "S19", name: "manual source link", run: async (p) => { await ask(p, "고신문은 어떻게 이용하나요?"); await expectIntent(p, "SERVICE_GUIDE"); await p.stubWindowOpen(); await p.clickByText("매뉴얼 근거 보기", { exact: true }); const opened = await p.globalValue("__QA_OPENED_URL__"); assert.match(opened, /\/manual\/.*%EB%B9%85%EC%B9%B4%EC%9D%B8%EC%A6%88_%EC%82%AC%EC%9A%A9%EC%9E%90%EB%A7%A4%EB%89%B4%EC%96%BC\.pdf#page=33$/); } },
      { id: "S20", name: "full-text download fact", run: async (p, result) => { await ask(p, "기사 전체 다운로드는 가능한가요?"); await expectIntent(p, "SERVICE_FACT"); await expectDecisionSource(p, "DETERMINISTIC"); const text = await p.latestAssistantText(); expectIncludes(text, "본문 전체"); expectIncludes(text, "별도"); expectNotIncludes(text, "다운로드 문제를"); result.answer = text; } },
      { id: "S21", name: "search result Excel guidance", run: async (p) => { await ask(p, "검색결과를 엑셀로 다운로드하려면 어떻게 하나요?"); await expectIntent(p, "SERVICE_GUIDE"); const text = await p.latestAssistantText(); expectIncludes(text, "다운로드"); expectIncludes(text, "분석"); expectNotIncludes(text, "다운로드 문제를"); } },
      { id: "S22", name: "download button location guidance", run: async (p) => { await ask(p, "다운로드 버튼은 어디 있나요?"); await expectIntent(p, "SERVICE_GUIDE"); expectNotIncludes(await p.latestAssistantText(), "다운로드 문제를"); } },
      { id: "S23", name: "missing download button support", run: async (p) => { await ask(p, "다운로드 버튼이 안 보여요"); await expectIntent(p, "SUPPORT_TRIAGE"); await expectDecisionSource(p, "DETERMINISTIC"); const issues = await p.evaluate("document.querySelector('[data-qa=\"support-case\"]')?.getAttribute('data-qa-support-issues') || ''"); expectIncludes(issues, "DOWNLOAD_PROBLEM"); } },
      { id: "S24", name: "policy question hard handoff", run: async (p) => { await ask(p, "기사 원문을 다운로드해서 유료회원에게 제공해도 되나요?"); await expectIntent(p, "SUPPORT_TRIAGE"); await expectDecisionSource(p, "HARD_RULE"); const text = await p.latestAssistantText(); ["허용됩니다", "이용 가능합니다", "무료입니다"].forEach((term) => expectNotIncludes(text, term)); } },
      { id: "S25", name: "audio usage guidance", run: async (p) => { await ask(p, "뉴스 듣기는 어디서 이용하나요?"); await expectIntent(p, "SERVICE_GUIDE"); const issues = await p.evaluate("document.querySelector('[data-qa=\"support-case\"]')?.getAttribute('data-qa-support-issues') || ''"); expectNotIncludes(issues, "AUDIO_PLAYBACK_PROBLEM"); } },
      { id: "S26", name: "internal engine provenance with official source", run: async (p) => { await ask(p, "검색식 사용법을 알려줘"); await expectIntent(p, "SERVICE_GUIDE"); await expectAnswerOrigin(p, "INTERNAL_ENGINE"); await p.waitFor("([...document.querySelectorAll('[data-qa=\"assistant-message\"]')].at(-1)?.querySelector('.answer-origin-badge')?.textContent || '').includes('공식 근거·내부엔진')", 10000, "grounded internal provenance badge"); } },
      { id: "S27", name: "internal engine provenance without matched source", run: async (p) => { await ask(p, "AI 반도체 관련 기사를 찾고 싶어요"); await expectIntent(p, "SEARCH_NEW"); await expectAnswerOrigin(p, "INTERNAL_ENGINE"); await p.waitFor("([...document.querySelectorAll('[data-qa=\"assistant-message\"]')].at(-1)?.querySelector('.answer-origin-badge')?.textContent || '').includes('내부엔진')", 10000, "internal provenance badge"); } },
      { id: "S28", name: "official grounded document count", run: async (p) => { await p.waitFor("document.querySelector('[data-qa=\"grounded-document-count\"] strong')?.textContent === '67'", 15000, "official grounded document count 67"); } },
      { id: "S29", name: "semantic route remains internal answer", run: async (p) => { await ask(p, "기업들이 같이 나오는 흐름 같은 걸 보고 싶은데 검색을 해야 하는지 분석을 해야 하는지 모르겠어요"); await expectAnswerOrigin(p, "INTERNAL_ENGINE"); } },
      { id: "PC01", name: "platform context removes BIGKinds", run: async (p) => { await ask(p, "빅카인즈에서 이재명 관련된 기사를 찾고 싶어"); await expectIntent(p, "SEARCH_NEW"); await expectSearchQuery(p, "이재명"); expectNotIncludes(await p.latestAssistantText(), "빅카인즈 AND"); } },
      { id: "PC02", name: "platform context supports spaced brand", run: async (p) => { await ask(p, "BIG KINDS에서 이재명 기사를 찾아줘"); await expectIntent(p, "SEARCH_NEW"); await expectSearchQuery(p, "이재명"); } },
      { id: "PC03", name: "platform context through phrase", run: async (p) => { await ask(p, "빅카인즈를 통해 이재명 기사를 검색해줘"); await expectIntent(p, "SEARCH_NEW"); await expectSearchQuery(p, "이재명"); } },
      { id: "PC04", name: "BIGKinds as search topic is preserved", run: async (p) => { await ask(p, "빅카인즈 관련 기사를 찾아줘"); await expectIntent(p, "SEARCH_NEW"); await expectSearchQuery(p, "빅카인즈"); } },
      { id: "PC05", name: "BIGKinds trend topic recommends keyword trend", run: async (p) => { await ask(p, "빅카인즈에 대한 보도량 추이를 보고 싶어요"); await expectIntent(p, "FEATURE_RECOMMENDATION"); await p.waitFor("document.querySelector('[data-qa-capability=\"KEYWORD_TREND\"]') !== null", 10000, "keyword trend capability"); await p.waitFor("document.querySelector('[data-qa=\"assistant-recommendation-card\"]') !== null", 10000, "recommendation card"); } },
      { id: "PC06", name: "platform phrase and topic preserve one BIGKinds term", run: async (p) => { await ask(p, "빅카인즈에서 빅카인즈 관련 기사를 찾아줘"); await expectIntent(p, "SEARCH_NEW"); await expectSearchQuery(p, "빅카인즈"); } },
      { id: "UX01", name: "standalone shell uses launcher instead of hero search", run: async (p) => { await closeChat(p); assert.equal(await p.exists('[data-qa="hero-question-input"]'), false, "standalone hero input should be absent"); assert.equal(await p.exists('[data-qa="quick-start"]'), false, "standalone quick start should be absent"); assert.equal(await p.exists('[data-qa="hero-open-chat"]'), true, "hero open-chat CTA is missing"); assert.equal(await p.exists('[data-qa="chat-launcher"]'), true, "floating launcher is missing"); } },
      { id: "UX02", name: "session teaser can be dismissed", run: async (p) => { await closeChat(p); await p.waitFor("document.querySelector('[data-qa=\"chat-teaser\"]') !== null", 3000, "session teaser"); const teaserText = await p.text('[data-qa="chat-teaser"]'); expectIncludes(teaserText, "사용 중 불편한 점이 있나요?", "teaser title"); expectIncludes(teaserText, "빠르게 답변 받을 수 있어요", "teaser subtitle"); await p.click('[data-qa="chat-teaser-close"]'); await p.waitFor("document.querySelector('[data-qa=\"chat-teaser\"]') === null", 3000, "teaser dismissed"); } },
      { id: "UX03", name: "page context updates recommendations", run: async (p) => { await p.evaluate("window.postMessage({ type: 'bigkinds-chatbot-context', context: { pathname: '/v2/news/search.do', pageType: 'NEWS_SEARCH' } }, '*')"); await p.waitFor("document.querySelector('.context-note')?.textContent.includes('뉴스 검색')", 5000, "news search context"); await p.waitFor("document.querySelector('[data-qa=\"purpose-primary-item\"]') !== null", 5000, "contextual primary recommendations"); } },
      { id: "UX04", name: "purpose panel has primary and secondary actions", run: async (p) => { await p.waitFor("document.querySelectorAll('[data-qa=\"purpose-primary-item\"]').length === 4", 10000, "four primary purposes"); await p.waitFor("document.querySelectorAll('[data-qa=\"purpose-secondary\"] button').length === 3", 10000, "three secondary actions"); } },
      { id: "UX05", name: "feature recommendation card has provenance", run: async (p) => { await ask(p, "빅카인즈에 대한 보도량 추이를 보고 싶어요"); await expectIntent(p, "FEATURE_RECOMMENDATION"); await p.waitFor("document.querySelector('[data-qa=\"assistant-recommendation-card\"]') !== null", 10000, "recommendation card"); await p.waitFor("document.querySelector('[data-qa=\"assistant-recommendation-card\"]')?.getAttribute('data-qa-recommendation-source') === 'CONTEXT_RULE'", 10000, "recommendation provenance"); } },
      { id: "UX06", name: "clarification card", run: async (p) => { await ask(p, "기업도 보고 싶어요"); await expectIntent(p, "CLARIFY"); await p.waitFor("document.querySelector('[data-qa=\"clarification-card\"]') !== null", 10000, "clarification card"); } },
      { id: "UX07", name: "provenance badge class", run: async (p) => { await ask(p, "검색식과 연산자는 어떻게 쓰나요?"); await expectAnswerOrigin(p, "INTERNAL_ENGINE"); await p.waitFor("[...document.querySelectorAll('[data-qa=\"assistant-message\"]')].at(-1)?.querySelector('.answer-origin-badge.engine-origin') !== null", 10000, "engine provenance class"); } },
      { id: "UX08", name: "embedded mode has no standalone hero", run: async (p) => { await p.navigate(`${baseUrl}/?embed=1&qa-run=${Date.now()}`); await p.waitFor("document.querySelector('[data-qa-ready=\"true\"]') !== null", 60000, "embedded readiness"); assert.equal(await p.exists('[data-qa="hero-question-input"]'), false, "embedded hero should be absent"); assert.equal(await p.exists('[data-qa="quick-start"]'), false, "embedded quick start should be absent"); assert.equal(await p.exists('[data-qa="metric-faq"]'), false, "embedded metrics should be absent"); assert.equal(await p.exists('[data-qa="kpf-footer"]'), false, "embedded footer should be absent"); assert.equal(await p.exists('[data-qa="chat-teaser"]'), false, "embedded teaser should be absent"); } },
    ];
    for (const scenario of scenarios) {
      const result = await runScenario(page, scenario);
      report.scenarios.push(result);
      if (screenshotAll && result.status === "PASS") {
        result.screenshot = path.join(artifactDir, `${scenario.id}.png`);
        await page.screenshot(result.screenshot);
      }
    }

    report.buttons.push(await runButtonCheck(page, "purpose-menu", async () => {
      await prepare(page);
      if (await page.exists('[data-qa="purpose-menu"]')) await page.click('[data-qa="purpose-toggle"]');
      await page.waitFor("document.querySelector('[data-qa=\\\"purpose-menu\\\"]') === null", 5000, "purpose menu close");
      await page.click('[data-qa="purpose-toggle"]');
      await page.waitFor("document.querySelector('[data-qa=\\\"purpose-menu\\\"]') !== null", 5000, "purpose menu");
    }));
    report.buttons.push(await runButtonCheck(page, "query-actions", async () => {
      await prepare(page);
      await ask(page, "AI 반도체 관련 기사를 찾고 싶어요");
      await page.stubClipboard();
      await page.clickByText("검색식 복사", { exact: true });
      await page.waitFor("window.__QA_CLIPBOARD__ !== ''", 5000, "query clipboard");
      await page.clickByText("조건 수정", { exact: true });
      await page.waitFor("document.querySelector('[data-qa=\\\"query-builder\\\"]') !== null", 5000, "query builder");
      await page.stubWindowOpen();
      await page.clickByText("뉴스검색 화면 열기", { exact: true });
      await page.waitFor("window.__QA_OPENED_URL__ !== ''", 5000, "news search action");
    }));
    report.buttons.push(await runButtonCheck(page, "lookup-actions", async () => {
      await prepare(page);
      await ask(page, "1997년 7월 신문에 실린 수상자 명단을 찾고 싶어");
      await page.clickByText("이 조건으로 찾기", { exact: true });
      await page.clickByText("이 전략 사용", { exact: true });
      await page.clickByText("찾지 못했어요", { exact: true });
      await page.clickByText("문의 회신 초안", { exact: true });
      await page.waitFor("document.querySelector('.lookup-reply-draft') !== null", 5000, "lookup reply draft");
    }));
    report.buttons.push(await runButtonCheck(page, "support-actions", async () => {
      await prepare(page);
      await ask(page, "AI로 기사 요약을 만들어 유료회원에게 제공해도 되나요?");
      await page.stubWindowOpen();
      await page.clickByText("공식 문의하기", { exact: true });
      await page.waitFor("window.__QA_OPENED_URL__ !== ''", 5000, "support inquiry action");
      await page.stubClipboard();
      await page.clickByText("문의내용 복사", { exact: true });
      await page.waitFor("window.__QA_CLIPBOARD__ !== ''", 5000, "support clipboard");
    }));

    const pageScenario = await runButtonCheck(page, "history-and-reopen", async () => {
      await prepare(page);
      await ask(page, "AI 반도체 관련 기사를 찾고 싶어요");
      await page.click('[data-qa="chat-close"]');
      await page.waitFor("document.querySelector('[data-qa=\\\"chat-widget\\\"]') === null", 5000, "chat close");
      await page.click('[data-qa="chat-launcher"]');
      await page.waitFor("document.querySelector('[data-qa=\\\"chat-widget\\\"]') !== null", 5000, "chat reopen");
      await page.waitFor("document.querySelector('[data-qa-ready=\\\"true\\\"]') !== null && document.querySelector('[data-qa=\\\"chat-input\\\"]')?.disabled === false", 5000, "reopened chat readiness");
      await ask(page, "주가는 빼줘");
      const reopenedText = await page.text('[data-qa="conversation"]');
      expectIncludes(reopenedText, "AI");
      expectIncludes(reopenedText, "NOT 주가");
      await page.navigate(`${baseUrl}/history`);
      await page.waitFor("document.readyState === 'complete'", 10000, "history page");
      await page.evaluate("document.querySelectorAll('details').forEach((item) => { item.open = true; })");
      const historyText = await page.text("body");
      expectIncludes(historyText, "AI 반도체 관련 기사를 찾고 싶어요");
      expectIncludes(historyText, "주가는 빼줘");
      report.pages.push({ name: "history", status: "PASS" });
    });
    report.buttons.push(pageScenario);

    const mobileCheck = await runButtonCheck(page, "mobile-400x800", async () => {
      await page.send("Emulation.setDeviceMetricsOverride", { width: 400, height: 800, deviceScaleFactor: 1, mobile: false });
      await prepare(page);
      const metrics = await page.evaluate(`({ width: window.innerWidth, scrollWidth: document.documentElement.scrollWidth, input: document.querySelector('[data-qa="chat-input"]')?.getBoundingClientRect().toJSON() })`);
      assert.ok(metrics.scrollWidth <= metrics.width + 1, `horizontal overflow: ${metrics.scrollWidth} > ${metrics.width}`);
      assert.ok(metrics.input && metrics.input.right <= metrics.width + 1, "chat input is outside the mobile viewport");
      await page.navigate(`${baseUrl}/history`);
      const historyMetrics = await page.evaluate(`({ width: window.innerWidth, scrollWidth: document.documentElement.scrollWidth })`);
      assert.ok(historyMetrics.scrollWidth <= historyMetrics.width + 1, "history page has horizontal overflow");
      report.pages.push({ name: "history at 400x800", status: "PASS" });
    });
    report.buttons.push(mobileCheck);
    report.consoleErrors = [...new Set(page.consoleErrors)];
  } catch (error) {
    report.environmentError = error instanceof Error ? error.message : String(error);
  } finally {
    if (browser) await browser.close();
  }

  const failCount = report.scenarios.filter((item) => item.status === "FAIL").length
    + report.buttons.filter((item) => item.status === "FAIL").length;
  const passCount = report.scenarios.filter((item) => item.status === "PASS").length
    + report.buttons.filter((item) => item.status === "PASS").length;
  report.summary = { scenarios: report.scenarios.length, pass: passCount, fail: failCount, warn: 0 };
  const markdown = [
    "# Production Synthetic QA Report",
    "",
    `- Generated: ${report.generatedAt}`,
    `- Chrome: ${report.chromePath}`,
    `- CDP: ${report.cdp}`,
    `- Base URL: ${report.baseUrl}`,
    `- Scenarios: ${report.summary.scenarios}`,
    `- PASS: ${report.summary.pass}`,
    `- FAIL: ${report.summary.fail}`,
    `- WARN: 0`,
    `- Console errors: ${report.consoleErrors.length}`,
    "",
    "## Scenarios",
    "",
    "| ID | Scenario | Status | Duration | Error |",
    "| --- | --- | --- | ---: | --- |",
    ...report.scenarios.map((item) => `| ${item.id} | ${item.name} | ${item.status} | ${item.durationMs}ms | ${item.error || ""} |`),
    "",
    "## Buttons and pages",
    "",
    ...report.buttons.map((item) => `- ${item.name}: ${item.status}${item.error ? ` (${item.error})` : ""}`),
    ...report.pages.map((item) => `- ${item.name}: ${item.status}`),
    "",
    "## Failure artifacts",
    "",
    ...report.scenarios.filter((item) => item.screenshot).map((item) => `- ${item.id}: ${item.screenshot}`),
    ...report.buttons.filter((item) => item.screenshot).map((item) => `- ${item.name}: ${item.screenshot}`),
  ].join("\n");
  await writeFile(path.join(artifactDir, "report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(path.join(artifactDir, "report.md"), `${markdown}\n`, "utf8");
  console.log(`QA_REPORT ${path.join(artifactDir, "report.md")}`);
  console.log(JSON.stringify(report.summary));
  if (report.environmentError) {
    console.error(`QA_ENVIRONMENT_ERROR ${report.environmentError}`);
    process.exitCode = 2;
  } else if (failCount > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(`QA_ENVIRONMENT_ERROR ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 2;
});
