import { readdir, readFile } from "node:fs/promises";
import vm from "node:vm";
import { applyKnowledgeAuthority } from "./knowledge-authority";
import type { SearchableDocument } from "./search";

let cachedDocuments: Promise<SearchableDocument[]> | undefined;

async function readCanonicalDocuments() {
  const dataDirectory = new URL("../public/data/", import.meta.url);
  const qnaFiles = (await readdir(dataDirectory)).filter((name) => /^qna-data-\d+\.js$/.test(name)).sort();
  const files = ["official-faq.js", "qna-import.js", ...qnaFiles, "knowledge-base.js", "official-intro.js"];
  const sandbox = { window: {} as Record<string, unknown> };
  vm.createContext(sandbox);
  for (const file of files) {
    vm.runInContext(await readFile(new URL(file, dataDirectory), "utf8"), sandbox, { filename: file });
  }
  const knowledgeBase = sandbox.window.BIGKINDS_KNOWLEDGE_BASE as { documents?: SearchableDocument[] } | undefined;
  return (knowledgeBase?.documents || []).map((document) => applyKnowledgeAuthority(document));
}

export function loadTrustedDocuments() {
  cachedDocuments ??= readCanonicalDocuments();
  return cachedDocuments;
}
