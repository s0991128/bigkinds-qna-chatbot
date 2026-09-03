import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { inflateRawSync } from "node:zlib";

const args = Object.fromEntries(process.argv.slice(2).map((value, index, all) => {
  if (!value.startsWith("--")) return [`_${index}`, value];
  const next = all[index + 1];
  return [value.slice(2), next && !next.startsWith("--") ? next : true];
}));

if (!args.input) {
  console.error("Usage: node scripts/import-qna.mjs --input QNA.xlsx [--output public/data/qna-import.js] [--report work/qna-import-report.json]");
  process.exit(1);
}

const inputPath = resolve(String(args.input));
const outputPath = resolve(String(args.output || "public/data/qna-import.js"));
const reportPath = resolve(String(args.report || "work/qna-import-report.json"));
const includeQuestionBody = Boolean(args["include-question-body"]);

function zipEntries(buffer) {
  let eocd = -1;
  for (let index = buffer.length - 22; index >= Math.max(0, buffer.length - 65558); index -= 1) {
    if (buffer.readUInt32LE(index) === 0x06054b50) { eocd = index; break; }
  }
  if (eocd < 0) throw new Error("입력 파일이 XLSX ZIP 형식이 아닙니다.");
  const count = buffer.readUInt16LE(eocd + 10);
  let cursor = buffer.readUInt32LE(eocd + 16);
  const entries = new Map();
  for (let index = 0; index < count; index += 1) {
    if (buffer.readUInt32LE(cursor) !== 0x02014b50) throw new Error("XLSX 중앙 디렉터리를 읽을 수 없습니다.");
    const method = buffer.readUInt16LE(cursor + 10);
    const compressedSize = buffer.readUInt32LE(cursor + 20);
    const nameLength = buffer.readUInt16LE(cursor + 28);
    const extraLength = buffer.readUInt16LE(cursor + 30);
    const commentLength = buffer.readUInt16LE(cursor + 32);
    const localOffset = buffer.readUInt32LE(cursor + 42);
    const name = buffer.subarray(cursor + 46, cursor + 46 + nameLength).toString("utf8").replaceAll("\\", "/");
    const localNameLength = buffer.readUInt16LE(localOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const compressed = buffer.subarray(dataStart, dataStart + compressedSize);
    entries.set(name, method === 0 ? compressed : method === 8 ? inflateRawSync(compressed) : null);
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

function decodeXml(value = "") {
  return value.replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)));
}

function columnIndex(reference) {
  const letters = reference.match(/^[A-Z]+/)?.[0] || "A";
  return [...letters].reduce((sum, letter) => sum * 26 + letter.charCodeAt(0) - 64, 0) - 1;
}

function parseWorkbook(buffer) {
  const entries = zipEntries(buffer);
  const sharedXml = entries.get("xl/sharedStrings.xml")?.toString("utf8") || "";
  const shared = [...sharedXml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)].map((match) =>
    [...match[1].matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((part) => decodeXml(part[1])).join("")
  );
  const sheetName = [...entries.keys()].filter((name) => /^xl\/worksheets\/sheet\d+\.xml$/.test(name))[0];
  if (!sheetName) throw new Error("XLSX에서 워크시트를 찾지 못했습니다.");
  return [...entries.get(sheetName).toString("utf8").matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)].map((rowMatch) => {
    const row = [];
    for (const cellMatch of rowMatch[1].matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)) {
      const attributes = cellMatch[1];
      const body = cellMatch[2];
      const reference = attributes.match(/\br="([^"]+)"/)?.[1] || "A1";
      const type = attributes.match(/\bt="([^"]+)"/)?.[1] || "";
      const raw = body.match(/<v>([\s\S]*?)<\/v>/)?.[1] ?? "";
      const inline = [...body.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((part) => decodeXml(part[1])).join("");
      row[columnIndex(reference)] = type === "s" ? shared[Number(raw)] || "" : type === "inlineStr" ? inline : decodeXml(raw);
    }
    return row;
  });
}

function clean(value) {
  return String(value || "").replace(/<br\s*\/?\s*>/gi, "\n").replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/\r/g, "")
    .replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

function redact(value) {
  return clean(value)
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[이메일 마스킹]")
    .replace(/(?<!\d)(?:01[016789]|02|0[3-6][1-5])-?\d{3,4}-?\d{4}(?!\d)/g, "[전화번호 마스킹]")
    .replace(/(?<!\d)\d{6}-?[1-4]\d{6}(?!\d)/g, "[주민등록번호 마스킹]")
    .replace(/\b(?:api[_ -]?key|access[_ -]?key|인증키)\s*[:=]\s*\S+/gi, "[인증키 마스킹]");
}

function normalizeDate(value) {
  const text = clean(value);
  if (/^\d+(?:\.\d+)?$/.test(text)) {
    const serial = Number(text);
    if (serial > 20000 && serial < 80000) return new Date(Date.UTC(1899, 11, 30) + serial * 86400000).toISOString().slice(0, 10);
  }
  return text;
}

function normalizeHeader(value) { return clean(value).toLowerCase().replace(/[\s_().·\/-]/g, ""); }
function findColumn(headers, aliases) {
  return headers.map(normalizeHeader).findIndex((header) => aliases.some((alias) => {
    const normalized = normalizeHeader(alias);
    return header === normalized || header.includes(normalized);
  }));
}

const rows = parseWorkbook(await readFile(inputPath));
if (rows.length < 2) throw new Error("헤더와 데이터 행이 필요합니다.");
const headers = rows[0].map(clean);
const columns = {
  id: findColumn(headers, ["번호", "no", "id"]),
  category: findColumn(headers, ["구분", "유형", "분류"]),
  title: findColumn(headers, ["제목", "질문제목"]),
  question: findColumn(headers, ["내용", "문의내용", "질문"]),
  answer: findColumn(headers, ["답변", "답변내용", "공식답변"]),
  questionDate: findColumn(headers, ["질문일시", "문의일시"]),
  answerDate: findColumn(headers, ["답변일시"])
};
if (columns.title < 0 || columns.answer < 0) throw new Error(`필수 열을 찾지 못했습니다. 현재 열: ${headers.join(", ")}`);

const imported = [];
const skipped = { unanswered: 0, emptyTitle: 0, duplicate: 0 };
const seen = new Set();
for (const [rowIndex, row] of rows.slice(1).entries()) {
  const title = redact(row[columns.title]);
  const answer = redact(row[columns.answer]);
  if (!title) { skipped.emptyTitle += 1; continue; }
  if (!answer) { skipped.unanswered += 1; continue; }
  const question = columns.question >= 0 ? redact(row[columns.question]) : "";
  const key = `${title}\n${answer}`;
  if (seen.has(key)) { skipped.duplicate += 1; continue; }
  seen.add(key);
  const id = columns.id >= 0 ? clean(row[columns.id]) : String(rowIndex + 2);
  const category = columns.category >= 0 ? redact(row[columns.category]) : "Q&A";
  const date = columns.answerDate >= 0 ? normalizeDate(row[columns.answerDate]) : "";
  imported.push({
    id: `qna-${id || rowIndex + 2}`,
    category: category || "Q&A",
    title,
    questions: includeQuestionBody && question ? [title, question.slice(0, 1200)] : [title],
    keywords: Array.from(new Set(`${title} ${question}`.toLowerCase().match(/[가-힣a-z0-9]+/g)?.filter((word) => word.length > 1) || [])),
    answer,
    effectiveDate: date || "2026-08-25",
    source: { label: "빅카인즈 운영지원 Q&A 공식 답변", pages: date ? `답변일 ${date}` : "답변일 미기재" },
    requiresReview: true
  });
}

await mkdir(dirname(outputPath), { recursive: true });
await mkdir(dirname(reportPath), { recursive: true });
await writeFile(outputPath, `window.BIGKINDS_IMPORTED_QNA = ${JSON.stringify(imported, null, 2)};\n`, "utf8");
await writeFile(reportPath, JSON.stringify({ input: inputPath, headers, columns, totalRows: rows.length - 1, imported: imported.length, skipped, includeQuestionBody }, null, 2), "utf8");
console.log(`Q&A ${imported.length}건 변환 완료: ${outputPath}`);

