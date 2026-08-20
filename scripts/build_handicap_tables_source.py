from __future__ import annotations

import json
import re
import sys
from pathlib import Path

from pypdf import PdfReader


OUTDOOR_HEADERS = [
    "York",
    "Hereford / Bristol I",
    "Bristol II",
    "Bristol III",
    "Bristol IV",
    "Bristol V",
    "St George",
    "Albion",
    "Windsor",
    "Windsor 50",
    "Windsor 40",
    "Windsor 30",
    "New Western",
    "Long Western",
    "Western",
    "Western 50",
    "Western 40",
    "Western 30",
    "American",
    "St Nicholas",
    "New National",
    "Long National",
    "National",
    "National 50",
    "National 40",
    "National 30",
    "New Warwick",
    "Long Warwick",
    "Warwick",
    "Warwick 50",
    "Warwick 40",
    "Warwick 30",
]

METRIC_HEADERS = [
    "WA 1440 (90m)",
    "WA 1440 (70m) / Metric I",
    "WA 1440 (60m) / Metric II",
    "Metric III",
    "Metric IV",
    "Metric V",
    "Long Metric (Men)",
    "Long Metric (Women) / 1",
    "Long Metric II",
    "Long Metric III",
    "Long Metric IV",
    "Long Metric V",
    "Short Metric",
    "Short Metric I",
    "Short Metric II",
    "Short Metric III",
    "Short Metric IV",
    "Short Metric V",
    "WA Standard Bow",
    "AGB 900-70",
    "WA 900",
    "AGB 900-50",
    "AGB 900-40",
    "AGB 900-30",
    "WA 70m",
    "WA 60m",
    "WA 50m (Barebow) / Metric 122-50",
    "Metric 122-40",
    "Metric 122-30",
    "WA 50m (Compound)",
    "Metric 80-40",
    "Metric 80-30",
]

INDOOR_HEADERS = [
    "Non-Compound Bray I Full size",
    "Non-Compound Bray I Triple",
    "Non-Compound Bray II Full size",
    "Non-Compound Bray II Triple",
    "Non-Compound Portsmouth Full size",
    "Non-Compound Portsmouth Triple",
    "Non-Compound Stafford",
    "Non-Compound WA 18m Full size",
    "Non-Compound WA 18m Triple",
    "Non-Compound WA 18m or Vegas Full size",
    "Non-Compound WA 18m or Vegas Triple",
    "All Bows Worcester Full size",
    "All Bows Worcester 5-spot",
    "All Bows Vegas300 Full size",
    "All Bows Vegas300 Triple",
    "Compound Bray I Full size",
    "Compound Bray I Triple",
    "Compound Bray II Full size",
    "Compound Bray II Triple",
    "Compound Portsmouth Full size",
    "Compound Portsmouth Triple",
    "Compound Stafford",
    "Compound WA 18m Full size",
    "Compound WA 18m Triple",
    "Compound WA 18m or Vegas Full size",
    "Compound WA 18m or Vegas Triple",
]

SHORT_HEADERS = [
    "Two Dozen 122cm Face 100y",
    "Two Dozen 122cm Face 80y",
    "Two Dozen 122cm Face 60y",
    "Two Dozen 122cm Face 50y",
    "Two Dozen 122cm Face 40y",
    "Two Dozen 122cm Face 30y",
    "Two Dozen 122cm Face 20y",
    "Two Dozen 122cm Face 15y",
    "Two Dozen 122cm Face 10y",
    "Three Dozen 122cm Face 90m",
    "Three Dozen 122cm Face 70m",
    "Three Dozen 122cm Face 60m",
    "Three Dozen 122cm Face 50m",
    "Three Dozen 122cm Face 40m",
    "Three Dozen 122cm Face 30m",
    "Three Dozen 122cm Face 20m",
    "Three Dozen 80cm Face 50m",
    "Three Dozen 80cm Face 40m",
    "Three Dozen 80cm Face 30m",
    "Three Dozen 80cm Face 20m",
    "Three Dozen 80cm Face 15m",
    "Three Dozen 80cm Face 10m",
]

FAMILY_SPECS = [
    {
        "familyKey": "outdoor-rounds",
        "familyTitle": "Outdoor Rounds",
        "description": "Archery GB outdoor handicap tables from the May 2025 release.",
        "tableKeyPrefix": "outdoor-round",
        "pageNumbers": [2, 3],
        "headers": OUTDOOR_HEADERS,
        "splitRowPairs": False,
    },
    {
        "familyKey": "metric-rounds",
        "familyTitle": "Metric Rounds",
        "description": "Metric handicap tables from the May 2025 release.",
        "tableKeyPrefix": "metric-round",
        "pageNumbers": [4, 5],
        "headers": METRIC_HEADERS,
        "splitRowPairs": False,
    },
    {
        "familyKey": "indoor-rounds",
        "familyTitle": "Indoor Rounds",
        "description": "Indoor handicap tables grouped by bow type.",
        "tableKeyPrefix": "indoor-round",
        "pageNumbers": [6, 7],
        "headers": INDOOR_HEADERS,
        "splitRowPairs": True,
    },
    {
        "familyKey": "short-rounds",
        "familyTitle": "2 and 3 Dozen Handicaps",
        "description": "Two-dozen and three-dozen handicap tables.",
        "tableKeyPrefix": "short-round",
        "pageNumbers": [8, 9],
        "headers": SHORT_HEADERS,
        "splitRowPairs": False,
    },
    {
        "familyKey": "outdoor-allowances",
        "familyTitle": "Allowance for Outdoor Rounds",
        "description": "Allowance tables for outdoor rounds.",
        "tableKeyPrefix": "outdoor-allowance",
        "pageNumbers": [10, 11],
        "headers": OUTDOOR_HEADERS,
        "splitRowPairs": False,
    },
    {
        "familyKey": "metric-allowances",
        "familyTitle": "Allowance for Metric Rounds",
        "description": "Allowance tables for metric rounds.",
        "tableKeyPrefix": "metric-allowance",
        "pageNumbers": [12, 13],
        "headers": METRIC_HEADERS,
        "splitRowPairs": False,
    },
    {
        "familyKey": "indoor-allowances",
        "familyTitle": "Allowance for Indoor Rounds",
        "description": "Allowance tables for indoor rounds grouped by bow type.",
        "tableKeyPrefix": "indoor-allowance",
        "pageNumbers": [14, 15],
        "headers": INDOOR_HEADERS,
        "splitRowPairs": True,
    },
]


def slugify(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    return slug or "table"


def normalize_lines(text: str) -> list[str]:
    return [line.strip() for line in text.splitlines() if line.strip()]


def extract_rows(text: str, table_count: int, split_row_pairs: bool) -> list[dict[str, int]]:
    lines = normalize_lines(text)
    rows: list[dict[str, int]] = []
    index = 0

    while index < len(lines):
        line = lines[index]
        if not re.match(r"^\d+", line):
            index += 1
            continue

        values = [int(value) for value in re.findall(r"\d+", line)]

        if split_row_pairs and len(values) == 2 and index + 1 < len(lines):
            next_values = [int(value) for value in re.findall(r"\d+", lines[index + 1])]
            merged_values = [values[0], values[1], *next_values]
            expected_length = table_count + 2
            if len(merged_values) == expected_length:
                values = merged_values
                index += 2
            else:
                index += 1
                continue
        else:
            index += 1

        expected_length = table_count + 2
        if len(values) != expected_length:
            continue

        handicap_start = values[0]
        handicap_end = values[-1]
        if handicap_start != handicap_end:
            continue

        rows.append({
            "handicapValue": handicap_start,
            "scores": values[1:-1],
        })

    return rows


def build_family(reader: PdfReader, spec: dict[str, object]) -> dict[str, object]:
    headers = spec["headers"]
    assert isinstance(headers, list)
    table_count = len(headers)
    all_rows: list[dict[str, int]] = []

    for page_number in spec["pageNumbers"]:
        assert isinstance(page_number, int)
        page_text = reader.pages[page_number - 1].extract_text() or ""
        all_rows.extend(
            extract_rows(
                page_text,
                table_count=table_count,
                split_row_pairs=bool(spec["splitRowPairs"]),
            )
        )

    rows_by_table = [[] for _ in range(table_count)]
    for row in all_rows:
        for column_index, score in enumerate(row["scores"]):
            rows_by_table[column_index].append({
                "handicapValue": row["handicapValue"],
                "referenceScore": score,
            })

    tables = []
    for index, title in enumerate(headers):
        tables.append({
            "tableKey": f"{spec['tableKeyPrefix']}-{slugify(title)}",
            "title": title,
            "displayOrder": index,
            "rows": rows_by_table[index],
        })

    return {
        "familyKey": spec["familyKey"],
        "familyTitle": spec["familyTitle"],
        "description": spec["description"],
        "tables": tables,
    }


def build_source(pdf_path: Path) -> dict[str, object]:
    reader = PdfReader(str(pdf_path))
    return {
        "sourceDocument": pdf_path.name,
        "sourceTitle": "Archery GB Handicap Tables",
        "sourceRevision": "released-may-2025",
        "families": [build_family(reader, spec) for spec in FAMILY_SPECS],
    }


def main() -> int:
    if len(sys.argv) != 3:
        print(
            "Usage: python scripts/build_handicap_tables_source.py <input-pdf> <output-json>",
            file=sys.stderr,
        )
        return 1

    input_pdf = Path(sys.argv[1])
    output_json = Path(sys.argv[2])

    if not input_pdf.exists():
        print(f"Input PDF not found: {input_pdf}", file=sys.stderr)
        return 1

    source = build_source(input_pdf)
    output_json.parent.mkdir(parents=True, exist_ok=True)
    output_json.write_text(json.dumps(source, indent=2), encoding="utf-8")
    print(f"Wrote {output_json}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
