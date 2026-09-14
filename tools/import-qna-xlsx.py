#!/usr/bin/env python3
"""Create privacy-safe, review-only Q&A chunks from the official Excel snapshot."""

from __future__ import annotations

import argparse
import html
import json
import re
import unicodedata
from collections import Counter
from datetime import date, datetime
from html.parser import HTMLParser
from pathlib import Path
from typing import Any

from openpyxl import load_workbook


REQUIRED_COLUMNS = ("번호", "제목", "내용", "답변", "답변자", "문의 날짜", "답변 날짜")
EXPECTED_TOTAL = 1419
EXPECTED_ANSWERED = 1413
CHUNK_COUNT = 21
SNAPSHOT_DATE = "2026-09-14"
VERSION = "Q&A답변 목록 2026-09-14"
GENERIC_KEYWORDS = {
    "안녕하세요", "감사합니다", "문의드립니다", "답변드립니다", "빅카인즈운영팀",
    "빅카인즈", "운영팀", "이메일", "전화번호", "마스킹",
}
EMAIL_PATTERN = re.compile(r"[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}", re.IGNORECASE)
PHONE_PATTERN = re.compile(r"(?<!\d)(?:\+82[-.\s]?)?(?:01[016789]|02|0[3-6][1-5])[-.\s]?\d{3,4}[-.\s]?\d{4}(?!\d)")
RRN_PATTERN = re.compile(r"(?<!\d)\d{6}[-\s]?\d{7}(?!\d)")
URL_PATTERN = re.compile(r"(?:https?://|www\.)[^\s<>\]\[\"']+", re.IGNORECASE)
MAILTO_PATTERN = re.compile(r"mailto:[^\s<>\]\[\"']+", re.IGNORECASE)
NAME_WITH_TITLE_PATTERN = re.compile(r"(?<!\[이름\s마스킹\])(?:[가-힣]{2,4})\s*(?:교수님?|선생님?|팀장님?|과장님?|차장님?|부장님?|박사님?)")
BLOCK_TAGS = {"p", "div", "br", "li", "tr", "h1", "h2", "h3", "h4", "h5", "h6", "section", "article", "blockquote"}


class ImportSchemaError(RuntimeError):
    pass


class PlainTextParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.parts: list[str] = []
        self.hidden_depth = 0

    def add_break(self) -> None:
        if self.parts and self.parts[-1] != "\n":
            self.parts.append("\n")

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        tag = tag.lower()
        if tag in {"script", "style"}:
            self.hidden_depth += 1
        elif tag in BLOCK_TAGS:
            self.add_break()

    def handle_startendtag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag.lower() in BLOCK_TAGS:
            self.add_break()

    def handle_endtag(self, tag: str) -> None:
        tag = tag.lower()
        if tag in {"script", "style"} and self.hidden_depth:
            self.hidden_depth -= 1
        elif tag in BLOCK_TAGS:
            self.add_break()

    def handle_data(self, data: str) -> None:
        if not self.hidden_depth:
            self.parts.append(data)

    def text(self) -> str:
        return "".join(self.parts)


def plain_text(value: Any) -> str:
    if value is None:
        return ""
    parser = PlainTextParser()
    parser.feed(str(value))
    parser.close()
    cleaned = html.unescape(parser.text()).replace("\u00a0", " ").replace("\r\n", "\n").replace("\r", "\n")
    cleaned = re.sub(r"<[^>]+>", "", cleaned)
    cleaned = re.sub(r"[ \t]+\n", "\n", cleaned)
    cleaned = re.sub(r"\n[ \t]+", "\n", cleaned)
    cleaned = re.sub(r"\n{3,}", "\n\n", cleaned)
    return cleaned.strip()


def replace_counted(pattern: re.Pattern[str], value: str, replacement: str, stats: Counter[str]) -> str:
    def replace(_: re.Match[str]) -> str:
        stats[replacement] += 1
        return replacement

    return pattern.sub(replace, value)


def sanitize(value: Any, stats: Counter[str]) -> str:
    cleaned = plain_text(value)
    cleaned = replace_counted(MAILTO_PATTERN, cleaned, "[이메일 마스킹]", stats)
    cleaned = replace_counted(URL_PATTERN, cleaned, "[URL]", stats)
    cleaned = replace_counted(RRN_PATTERN, cleaned, "[주민등록번호 마스킹]", stats)
    cleaned = replace_counted(EMAIL_PATTERN, cleaned, "[이메일 마스킹]", stats)
    cleaned = replace_counted(PHONE_PATTERN, cleaned, "[전화번호 마스킹]", stats)
    cleaned = replace_counted(NAME_WITH_TITLE_PATTERN, cleaned, "[이름 마스킹]", stats)
    return cleaned


def as_date(value: Any, field: str, source_number: int) -> str:
    if isinstance(value, datetime):
        return value.date().isoformat()
    if isinstance(value, date):
        return value.isoformat()
    if isinstance(value, str):
        normalized = value.strip()
        for format_string in ("%Y-%m-%d", "%Y.%m.%d", "%Y/%m/%d", "%Y-%m-%d %H:%M:%S"):
            try:
                return datetime.strptime(normalized, format_string).date().isoformat()
            except ValueError:
                continue
    raise ImportSchemaError(f"IMPORT_DATE_ERROR: 번호 {source_number}의 {field} 값을 읽을 수 없습니다.")


def as_number(value: Any) -> int:
    if isinstance(value, int):
        return value
    if isinstance(value, float) and value.is_integer():
        return int(value)
    if isinstance(value, str) and value.strip().isdigit():
        return int(value.strip())
    raise ImportSchemaError(f"IMPORT_SCHEMA_ERROR: 번호 값이 올바르지 않습니다: {value!r}")


def keywords_from(title: str, content: str) -> list[str]:
    normalized = unicodedata.normalize("NFKC", f"{title}\n{content}").casefold()
    tokens = re.sub(r"[^0-9a-z가-힣]+", " ", normalized).split()
    result: list[str] = []
    for token in tokens:
        if len(token) < 2 or token in GENERIC_KEYWORDS or token in result:
            continue
        result.append(token)
        if len(result) == 100:
            break
    return result or ["운영지원"]


def build_document(row: tuple[Any, ...], columns: dict[str, int], stats: Counter[str]) -> dict[str, Any]:
    source_number = as_number(row[columns["번호"]])
    title = sanitize(row[columns["제목"]], stats)
    content = sanitize(row[columns["내용"]], stats)
    raw_answer = row[columns["답변"]]
    has_official_answer = bool(str(raw_answer).strip()) if raw_answer is not None else False
    question_date = as_date(row[columns["문의 날짜"]], "문의 날짜", source_number)

    if not title:
        raise ImportSchemaError(f"IMPORT_SCHEMA_ERROR: 번호 {source_number}의 제목이 비어 있습니다.")

    if has_official_answer:
        answer = sanitize(raw_answer, stats)
        if not answer:
            raise ImportSchemaError(f"IMPORT_SCHEMA_ERROR: 번호 {source_number}의 답변이 HTML 정리 후 비어 있습니다.")
        effective_date = as_date(row[columns["답변 날짜"]], "답변 날짜", source_number)
        source = {
            "label": "빅카인즈 운영지원 Q&A 공식 답변",
            "pages": f"원문 번호 {source_number} · 답변일 {effective_date}",
        }
        answer_mode = "INTERNAL_REFERENCE"
    else:
        answer = "현재 이 문의에는 공식 답변이 등록되어 있지 않습니다."
        effective_date = question_date
        source = {
            "label": "빅카인즈 운영지원 Q&A 미답변 문의",
            "pages": f"원문 번호 {source_number} · 문의일 {question_date}",
        }
        answer_mode = "HANDOFF_ONLY"

    document: dict[str, Any] = {
        "id": f"qna-official-{source_number:04d}",
        "category": "운영지원 Q&A",
        "title": title,
        "questions": [item for item in (title, content) if item],
        "keywords": keywords_from(title, content),
        "answer": answer,
        "effectiveDate": effective_date,
        "source": source,
        "sourceType": "OFFICIAL_QNA",
        "authority": "VERIFIED_QNA",
        "status": "REVIEW_REQUIRED",
        "requiresReview": True,
        "answerMode": answer_mode,
        "version": VERSION,
        "hasOfficialAnswer": has_official_answer,
    }
    if not has_official_answer:
        document["alwaysEscalate"] = True
    return document


def load_rows(path: Path) -> tuple[list[tuple[Any, ...]], dict[str, int]]:
    workbook = load_workbook(path, read_only=True, data_only=True)
    worksheet = workbook[workbook.sheetnames[0]]
    values = worksheet.iter_rows(values_only=True)
    try:
        header = next(values)
    except StopIteration as error:
        raise ImportSchemaError("IMPORT_SCHEMA_ERROR: 헤더가 없습니다.") from error
    columns = {str(value).strip(): index for index, value in enumerate(header) if value is not None}
    missing = [column for column in REQUIRED_COLUMNS if column not in columns]
    if missing:
        raise ImportSchemaError(f"IMPORT_SCHEMA_ERROR: 필수 컬럼 누락: {', '.join(missing)}")
    return [row for row in values if any(value is not None for value in row)], columns


def validate_source_rows(rows: list[tuple[Any, ...]], columns: dict[str, int]) -> None:
    numbers = [as_number(row[columns["번호"]]) for row in rows]
    duplicates = sorted(number for number, count in Counter(numbers).items() if count > 1)
    if len(rows) != EXPECTED_TOTAL:
        raise ImportSchemaError(f"IMPORT_SCHEMA_ERROR: 전체 row {len(rows)}건, 기대값 {EXPECTED_TOTAL}건")
    if duplicates:
        raise ImportSchemaError(f"IMPORT_SCHEMA_ERROR: duplicate 번호 {duplicates[:10]}")
    if numbers != list(range(1, EXPECTED_TOTAL + 1)):
        raise ImportSchemaError("IMPORT_SCHEMA_ERROR: 번호 범위가 1~1419 연속값이 아닙니다.")


def chunked(documents: list[dict[str, Any]]) -> list[list[dict[str, Any]]]:
    base, remainder = divmod(len(documents), CHUNK_COUNT)
    chunks: list[list[dict[str, Any]]] = []
    cursor = 0
    for index in range(CHUNK_COUNT):
        size = base + (1 if index < remainder else 0)
        chunks.append(documents[cursor:cursor + size])
        cursor += size
    return chunks


def write_if_changed(path: Path, content: str) -> None:
    if path.exists() and path.read_text(encoding="utf-8") == content:
        return
    path.write_text(content, encoding="utf-8", newline="\n")


def write_output(output_dir: Path, documents: list[dict[str, Any]]) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)
    metadata = {
        "snapshotDate": SNAPSHOT_DATE,
        "total": EXPECTED_TOTAL,
        "answered": EXPECTED_ANSWERED,
        "unanswered": EXPECTED_TOTAL - EXPECTED_ANSWERED,
        "source": "Q&A답변 목록",
    }
    write_if_changed(
        output_dir / "qna-import.js",
        "window.BIGKINDS_IMPORTED_QNA = [];\n\nwindow.BIGKINDS_IMPORTED_QNA_META = "
        + json.dumps(metadata, ensure_ascii=False, indent=2)
        + ";\n",
    )
    for index, chunk in enumerate(chunked(documents), start=1):
        content = "window.BIGKINDS_IMPORTED_QNA.push(..." + json.dumps(chunk, ensure_ascii=False, indent=2) + ");\n"
        write_if_changed(output_dir / f"qna-data-{index:02d}.js", content)


def main() -> None:
    repository = Path(__file__).resolve().parents[1]
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, default=repository / "imports" / "Q&A답변 목록(2).xlsx")
    parser.add_argument("--output-dir", type=Path, default=repository / "public" / "data")
    arguments = parser.parse_args()

    if not arguments.input.is_file():
        raise ImportSchemaError(f"IMPORT_SCHEMA_ERROR: 입력 파일이 없습니다: {arguments.input}")

    rows, columns = load_rows(arguments.input)
    validate_source_rows(rows, columns)
    stats: Counter[str] = Counter()
    documents = [build_document(row, columns, stats) for row in rows]
    documents.sort(key=lambda document: document["id"])
    answered = sum(document["hasOfficialAnswer"] for document in documents)
    if answered != EXPECTED_ANSWERED:
        raise ImportSchemaError(f"IMPORT_SCHEMA_ERROR: 공식 답변 {answered}건, 기대값 {EXPECTED_ANSWERED}건")
    write_output(arguments.output_dir, documents)
    print(json.dumps({
        "documents": len(documents),
        "answered": answered,
        "unanswered": len(documents) - answered,
        "chunks": CHUNK_COUNT,
        "htmlRemoved": "validated in output",
        "emailMasked": stats["[이메일 마스킹]"],
        "phoneMasked": stats["[전화번호 마스킹]"],
        "rrnMasked": stats["[주민등록번호 마스킹]"],
        "nameMasked": stats["[이름 마스킹]"],
        "urlsMasked": stats["[URL]"],
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
