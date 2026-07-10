#!/usr/bin/env python3
"""Build a completely self-contained, shareable HTML edition."""

from __future__ import annotations

import argparse
import base64
import json
import pathlib
import re


ROOT = pathlib.Path(__file__).resolve().parents[1]
DEFAULT_OUTPUT = ROOT / "dist" / "sanfen-tianxia.html"
SCRIPT_RE = re.compile(r'<script src="([^"]+)"></script>')


def portrait_payload() -> dict[str, str]:
    manifest = json.loads((ROOT / "assets" / "generals" / "manifest.json").read_text(encoding="utf-8"))
    payload: dict[str, str] = {}
    for key in manifest:
        path = ROOT / "assets" / "generals" / f"{key}.jpg"
        if not path.is_file():
            raise FileNotFoundError(f"missing portrait: {path.relative_to(ROOT)}")
        payload[key] = "data:image/jpeg;base64," + base64.b64encode(path.read_bytes()).decode("ascii")
    return payload


def inline_scripts(html: str) -> str:
    def replace(match: re.Match[str]) -> str:
        relative = match.group(1)
        source = (ROOT / relative).read_text(encoding="utf-8").replace("</script", "<\\/script")
        return f'<script data-source="{relative}">\n{source}\n</script>'

    return SCRIPT_RE.sub(replace, html)


def render() -> str:
    html = (ROOT / "index.html").read_text(encoding="utf-8")
    css = (ROOT / "css" / "style.css").read_text(encoding="utf-8").replace("</style", "<\\/style")
    html = html.replace('<link rel="stylesheet" href="css/style.css" />', f'<style data-source="css/style.css">\n{css}\n</style>')

    portraits = json.dumps(portrait_payload(), ensure_ascii=False, separators=(",", ":"))
    attribution = json.dumps((ROOT / "assets" / "ATTRIBUTION.md").read_text(encoding="utf-8"), ensure_ascii=False)
    embedded = (
        '<script>window.__SFT_PORTRAITS__=' + portraits + ';</script>\n'
        '<script type="application/json" id="embeddedAttribution">' + attribution.replace("</script", "<\\/script") + '</script>'
    )
    html = html.replace('<!-- SINGLE_FILE_ASSETS -->', embedded)
    html = inline_scripts(html)

    forbidden = ['<script src=', 'href="css/', '<img src="assets/']
    leftovers = [needle for needle in forbidden if needle in html]
    if leftovers:
        raise ValueError("standalone output still contains external app assets: " + ", ".join(leftovers))

    return html


def build(output: pathlib.Path) -> None:
    html = render()
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(html, encoding="utf-8")
    size_mib = output.stat().st_size / (1024 * 1024)
    print(f"Built {output.relative_to(ROOT)} ({size_mib:.2f} MiB)")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=pathlib.Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--check", action="store_true", help="fail when the checked-in standalone file is stale")
    args = parser.parse_args()
    output = args.output if args.output.is_absolute() else ROOT / args.output
    if args.check:
        if not output.is_file() or output.read_text(encoding="utf-8") != render():
            print(f"Standalone build is stale: {output.relative_to(ROOT)}")
            return 1
        print(f"Standalone build is current: {output.relative_to(ROOT)}")
    else:
        build(output)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
