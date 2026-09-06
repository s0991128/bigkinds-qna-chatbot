import { readdir, readFile } from "node:fs/promises";

const dataDir = new URL("../public/data/", import.meta.url);
const names = (await readdir(dataDir)).filter((name) => /^qna-data-\d+\.js$/.test(name));
const rules = {
  email: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g,
  phone: /(?<!\d)0\d{1,2}[- .]?\d{3,4}[- .]?\d{4}(?!\d)/g,
  residentNumber: /(?<!\d)\d{6}[- .]?[1-4]\d{6}(?!\d)/g,
  credential: /(?:api[_ -]?key|authorization\s*[:=]|bearer\s+[A-Za-z0-9._-]{12,})/gi,
};

for (const [name, pattern] of Object.entries(rules)) {
  const files = [];
  let matches = 0;
  for (const file of names) {
    const text = await readFile(new URL(file, dataDir), "utf8");
    const found = text.match(pattern) || [];
    if (found.length) { matches += found.length; files.push(file); }
  }
  console.log(`${name}: matches=${matches} files=${files.length}${files.length ? ` (${files.join(", ")})` : ""}`);
}
