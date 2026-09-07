import { readdir, readFile } from "node:fs/promises";

const dataDir = new URL("../public/data/", import.meta.url);
const names = (await readdir(dataDir)).filter((name) => /^qna-data-\d+\.js$/.test(name));
const rules = {
  email: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g,
  phone: /(?<!\d)0\d{1,2}[- .]?\d{3,4}[- .]?\d{4}(?!\d)/g,
  residentNumber: /(?<!\d)\d{6}[- .]?[1-4]\d{6}(?!\d)/g,
  credential: /(?:authorization\s*[:=]|bearer\s+[A-Za-z0-9._-]{20,}|sk-[A-Za-z0-9_-]{20,})/gi,
  koreanNameWithTitle: /(?<!\[이름\s마스킹\])(?:[가-힣]{2,4})\s*(?:교수님?|선생님?|팀장님?|과장님?|차장님?|부장님?|박사님?)/g,
};

let hasFindings = false;
for (const [name, pattern] of Object.entries(rules)) {
  const files = [];
  let matches = 0;
  for (const file of names) {
    const text = await readFile(new URL(file, dataDir), "utf8");
    const found = text.match(pattern) || [];
    if (found.length) { matches += found.length; files.push(file); }
  }
  console.log(`${name}: matches=${matches} files=${files.length}${files.length ? ` (${files.join(", ")})` : ""}`);
  if (matches > 0) hasFindings = true;
}

if (hasFindings) process.exitCode = 1;
