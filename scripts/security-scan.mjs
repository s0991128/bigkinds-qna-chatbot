import { readdir, readFile } from "node:fs/promises";
import vm from "node:vm";

const dataDirectory = new URL("../public/data/", import.meta.url);
const qnaFiles = (await readdir(dataDirectory)).filter((name) => /^qna-data-\d+\.js$/.test(name)).sort();
const sandbox = { window: { BIGKINDS_IMPORTED_QNA: [] } };
vm.createContext(sandbox);
for (const file of qnaFiles) {
  const before = sandbox.window.BIGKINDS_IMPORTED_QNA.length;
  vm.runInContext(await readFile(new URL(file, dataDirectory), "utf8"), sandbox, { filename: file });
  for (const record of sandbox.window.BIGKINDS_IMPORTED_QNA.slice(before)) record.__file = file;
}

const rules = {
  email: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g,
  phone: /(?<!\d)(?:(?:01[016789]|02|0[3-6][1-5])[- .]?\d{3,4}[- .]?\d{4})(?!\d)/g,
  residentNumber: /(?<!\d)\d{6}[- .]?[1-4]\d{6}(?!\d)/g,
  credential: /(?:api[_ -]?key|access[_ -]?key|인증키|authorization\s*[:=]|bearer\s+)[=: ]+(?!\[?[^\]]*마스킹\]?)[A-Za-z0-9._/-]{8,}/gi,
};
const humanReviewPattern = /이름|성명|연락처|소속|학번|계정|아이디|개인정보|저와 관련|삭제해|내부|비공개|대외비|기밀/i;
const findings = [];
const reviewCandidates = [];

function context(value, index) {
  return String(value).slice(Math.max(0, index - 40), index + 100).replace(/\s+/g, " ");
}

for (const record of sandbox.window.BIGKINDS_IMPORTED_QNA) {
  for (const [field, value] of Object.entries(record)) {
    const text = typeof value === "string" ? value : Array.isArray(value) ? value.join("\n") : "";
    if (!text) continue;
    for (const [name, pattern] of Object.entries(rules)) {
      pattern.lastIndex = 0;
      for (const match of text.matchAll(pattern)) {
        findings.push({ type: name, file: record.__file || "qna-data-*.js", id: record.id, field, value: match[0], context: context(text, match.index || 0) });
      }
    }
  }
  const title = String(record.title || "");
  const body = JSON.stringify(record.questions || []);
  if (humanReviewPattern.test(title) || humanReviewPattern.test(body)) {
    reviewCandidates.push({ id: record.id, title, reason: "개인정보·계정·내부정보 가능성이 있는 제목 또는 질문 본문" });
  }
}

console.log(`qnaRecords=${sandbox.window.BIGKINDS_IMPORTED_QNA.length} files=${qnaFiles.length}`);
console.log(`sensitiveFindings=${findings.length}`);
console.log(`humanReviewCandidates=${reviewCandidates.length}`);
if (findings.length) {
  console.error(JSON.stringify({ findings, reviewCandidates }, null, 2));
  process.exit(1);
}
for (const candidate of reviewCandidates.slice(0, 20)) console.log(`review: ${candidate.id} · ${candidate.title} · ${candidate.reason}`);
