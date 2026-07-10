#!/usr/bin/env python3
"""Audit bundled portraits against Wikimedia Commons license metadata.

By default the command prints a JSON report. ``--write`` also refreshes the
checked-in attribution inventory after every asset passes the policy.
"""

from __future__ import annotations

import argparse
import hashlib
import html
import json
import pathlib
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

from PIL import Image


ROOT = pathlib.Path(__file__).resolve().parents[1]
ASSET_DIR = ROOT / "assets" / "generals"
MANIFEST_PATH = ASSET_DIR / "manifest.json"
API_URL = "https://commons.wikimedia.org/w/api.php"
USER_AGENT = "war-of-the-three-kingdoms/2.0 (offline open-asset audit)"
ALLOWED_LICENSE_PREFIXES = (
    "public domain",
    "cc0",
    "cc by ",
    "cc by-sa ",
)
REPORT_JSON = ROOT / "assets" / "ATTRIBUTION.json"
REPORT_MARKDOWN = ROOT / "assets" / "ATTRIBUTION.md"


def clean_html(value: str | None) -> str:
    text = html.unescape(value or "")
    text = re.sub(r"<[^>]+>", " ", text)
    return " ".join(text.split())


def metadata_value(metadata: dict, key: str) -> str:
    item = metadata.get(key) or {}
    return clean_html(item.get("value"))


def source_filename(source_url: str) -> str:
    return urllib.parse.unquote(pathlib.PurePosixPath(urllib.parse.urlparse(source_url).path).name)


def request_commons(titles: list[str]) -> dict:
    query = urllib.parse.urlencode(
        {
            "action": "query",
            "format": "json",
            "formatversion": "2",
            "prop": "imageinfo",
            "iiprop": "url|extmetadata",
            "titles": "|".join(f"File:{title}" for title in titles),
            "redirects": "1",
            "maxlag": "5",
        }
    )
    request = urllib.request.Request(f"{API_URL}?{query}", headers={"User-Agent": USER_AGENT})
    payload = None
    for attempt in range(4):
        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                payload = json.load(response)
            break
        except urllib.error.HTTPError as exc:
            if exc.code != 429 or attempt == 3:
                raise
            time.sleep(5 * (attempt + 1))
    if payload is None:
        raise RuntimeError("empty Commons response")
    return payload


def metadata_record(info: dict) -> dict:
    metadata = info.get("extmetadata", {})
    return {
        "file_page": info.get("descriptionurl"),
        "canonical_url": info.get("url"),
        "license": metadata_value(metadata, "LicenseShortName"),
        "license_url": metadata_value(metadata, "LicenseUrl"),
        "artist": metadata_value(metadata, "Artist"),
        "credit": metadata_value(metadata, "Credit"),
        "attribution_required": metadata_value(metadata, "AttributionRequired"),
        "copyrighted": metadata_value(metadata, "Copyrighted"),
    }


def commons_metadata_batch(sources: dict[str, str]) -> dict[str, dict]:
    filenames = {key: source_filename(url) for key, url in sources.items()}
    payload = request_commons(list(filenames.values()))
    query = payload.get("query", {})
    aliases: dict[str, str] = {}
    for item in (query.get("normalized", []) + query.get("redirects", [])):
        aliases[item["from"].removeprefix("File:")] = item["to"].removeprefix("File:")
    records: dict[str, dict] = {}
    for page in query.get("pages", []):
        if page.get("missing") or not page.get("imageinfo"):
            continue
        title = page.get("title", "").removeprefix("File:")
        records[title] = metadata_record(page["imageinfo"][0])
    result: dict[str, dict] = {}
    for key, filename in filenames.items():
        resolved = aliases.get(filename, filename)
        if resolved not in records:
            raise ValueError(f"Commons metadata not found for {filename}")
        result[key] = records[resolved]
    return result


def is_allowed_license(name: str) -> bool:
    normalized = " ".join(name.lower().replace("–", "-").replace("—", "-").split())
    return normalized.startswith(ALLOWED_LICENSE_PREFIXES)


def audit() -> tuple[list[dict], list[str]]:
    manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    report: list[dict] = []
    errors: list[str] = []
    sources = {key: entry.get("src") for key, entry in manifest.items() if entry.get("src")}
    try:
        remote_metadata = commons_metadata_batch(sources)
    except Exception as exc:
        return [], [f"Commons API: {exc}"]
    for key, entry in manifest.items():
        source = entry.get("src")
        asset_path = ASSET_DIR / f"{key}.jpg"
        try:
            if not source:
                raise ValueError("missing source URL")
            if not asset_path.is_file():
                raise ValueError("missing local portrait")
            with Image.open(asset_path) as image:
                size = list(image.size)
            digest = hashlib.sha256(asset_path.read_bytes()).hexdigest()
            license_data = remote_metadata[key]
            allowed = is_allowed_license(license_data["license"])
            if not allowed:
                errors.append(f"{key}: disallowed or unknown license {license_data['license']!r}")
            report.append(
                {
                    "key": key,
                    "local_file": f"assets/generals/{key}.jpg",
                    "source": source,
                    "size": size,
                    "sha256": digest,
                    "allowed": allowed,
                    **license_data,
                }
            )
        except Exception as exc:  # report all assets instead of stopping at the first
            errors.append(f"{key}: {exc}")
            report.append({"key": key, "local_file": str(asset_path.relative_to(ROOT)), "source": source, "allowed": False, "error": str(exc)})
    return report, errors


def markdown_report(report: list[dict]) -> str:
    """Create a human-readable attribution ledger from verified metadata."""
    rows = [
        "# 图像资产来源与许可",
        "",
        "本清单由 `python tools/audit_assets.py --write` 从 Wikimedia Commons 的文件元数据生成。",
        "每次替换或新增图像后都必须重新执行审计；文件页是许可与署名要求的最终依据。",
        "",
        "| 角色 | 本地文件 | 许可 | 作者 / 来源 | 文件页 |",
        "| --- | --- | --- | --- | --- |",
    ]
    manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    for item in report:
        title = manifest[item["key"]].get("title", item["key"])
        artist = (item.get("artist") or item.get("credit") or "来源页未标注").replace("|", "\\|")
        file_page = item.get("file_page") or item["source"]
        rows.append(
            f'| {title} | `{item["local_file"]}` | '
            f'[{item["license"]}]({item.get("license_url") or file_page}) | '
            f'{artist} | [Wikimedia Commons]({file_page}) |'
        )
    rows.extend(
        [
            "",
            "## 使用规则",
            "",
            "- 公有领域图像仍保留来源链接，便于复核出处、人格权或其他地域性限制。",
            "- CC BY / CC BY-SA 图像必须保留作者、文件页、许可链接，并标明修改；CC BY-SA 的改编版本继续使用相同许可。",
            "- 项目名称、标志、商标与角色商品化权不因图像采用开放许可而自动获得授权。",
            "- 卡牌图标、印玺占位图与界面纹理由本项目通过 SVG / CSS 程序化绘制，不引用第三方游戏画面。",
            "",
        ]
    )
    return "\n".join(rows)


def write_reports(report: list[dict]) -> None:
    payload = {"schema_version": 1, "assets": report, "errors": []}
    REPORT_JSON.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    REPORT_MARKDOWN.write_text(markdown_report(report), encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--write", action="store_true", help="refresh assets/ATTRIBUTION.{json,md} after a clean audit")
    args = parser.parse_args()
    report, errors = audit()
    payload = {"schema_version": 1, "assets": report, "errors": errors}
    print(json.dumps(payload, ensure_ascii=False, indent=2))
    if args.write and not errors:
        write_reports(report)
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
