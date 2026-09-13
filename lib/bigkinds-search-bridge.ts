import type { LookupStrategy } from "./article-lookup-strategy";

/**
 * BIGKinds 검색 화면으로 전달할 수 있는 최소 검색 상태입니다.
 * providerCodes는 BIGKinds의 공식 providers.do 응답에 있는 값만 사용합니다.
 */
export type BigKindsSearchTransfer = {
  query: string;
  startDate?: string | null;
  endDate?: string | null;
  providerNames?: string[];
  providerCodes?: string[];
};

/** BIGKinds 공식 언론사 제공자 코드(2026-09 providers.do 기준). */
export const BIGKINDS_PROVIDER_CODE_BY_NAME: Readonly<Record<string, string>> = {
  경향신문: "01100101",
  동아일보: "01100401",
  조선일보: "01100801",
  중앙일보: "01100901",
  한겨레: "01101001",
  매일경제: "02100101",
  한국경제: "02100601",
};

// 짧은 이름을 사용하는 기존 호출부와의 호환 alias입니다.
export const BIGKINDS_PROVIDER_CODES = BIGKINDS_PROVIDER_CODE_BY_NAME;

function normalizeProviderName(value: string) {
  return value.trim().replace(/\s+/g, "");
}

/**
 * 사용자에게 표시된 언론사명을 공식 제공자 코드로 변환합니다.
 * 매핑되지 않은 분류명(예: 경제신문)은 추측하지 않고 제외합니다.
 */
export function resolveProviderCodes(providerNames: string[] = []) {
  return [...new Set(providerNames
    .map(normalizeProviderName)
    .map((name) => BIGKINDS_PROVIDER_CODE_BY_NAME[name])
    .filter((code): code is string => Boolean(code)))];
}

export function createSearchTransfer(strategy: Pick<LookupStrategy, "query" | "dateFrom" | "dateTo" | "media">): BigKindsSearchTransfer {
  const providerNames = strategy.media?.filter(Boolean) || [];
  return {
    query: strategy.query,
    startDate: strategy.dateFrom || "",
    endDate: strategy.dateTo || "",
    providerNames,
    providerCodes: resolveProviderCodes(providerNames),
  };
}

/**
 * BIGKinds 공식 검색 화면의 jsonSearchParam POST 계약을 생성합니다.
 * 문자열을 받는 호환 경로도 유지해 일반 검색 버튼의 기존 동작을 보존합니다.
 */
export function buildBigKindsSearchPayload(input: BigKindsSearchTransfer | string) {
  const transfer: BigKindsSearchTransfer = typeof input === "string" ? { query: input } : input;
  const providerCodes = transfer.providerCodes?.filter(Boolean).length
    ? [...new Set(transfer.providerCodes.filter(Boolean))]
    : resolveProviderCodes(transfer.providerNames || []);
  return {
    indexName: "news",
    searchKey: transfer.query.trim(),
    searchKeys: [{}],
    searchFilterType: "1",
    searchScopeType: "1",
    searchSortType: "date",
    sortMethod: "date",
    startDate: transfer.startDate || "",
    endDate: transfer.endDate || "",
    providerCodes,
    categoryCodes: [],
    incidentCodes: [],
    dateCodes: [],
  };
}
