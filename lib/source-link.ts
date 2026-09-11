import type { SearchableDocument } from "./search";

export function getDocumentSourceUrl(document: Pick<SearchableDocument, "sourceType" | "source" | "pdfPageStart">) {
  const url = document.source?.url;
  if (!url) return undefined;

  if (document.sourceType === "USER_MANUAL" && document.pdfPageStart) {
    return `${url}#page=${document.pdfPageStart}`;
  }

  return url;
}
