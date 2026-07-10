#!/usr/bin/env python3
"""Fetch public-domain historical portraits for the generals from Chinese
Wikipedia (pageimages), crop/normalise to a uniform portrait, and save to
assets/generals/<key>.jpg. Generates a tinted SVG-ish placeholder note for
any that fail so the UI can fall back.

Run:  python tools/fetch_generals.py
"""
import io
import json
import pathlib
import time
import urllib.error
import urllib.parse
import urllib.request

from PIL import Image, ImageOps

ROOT = pathlib.Path(__file__).resolve().parents[1]
OUT = ROOT / "assets" / "generals"
OUT.mkdir(parents=True, exist_ok=True)

UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 SanguoshaOfflineAssetFetcher/1.0 (educational, offline game)"

# key -> (primary wiki title, [alt titles])
GENERALS = {
    "caocao":       ("曹操", []),
    "simayi":       ("司马懿", ["晉宣帝"]),
    "xiahoudun":    ("夏侯惇", []),
    "zhangliao":    ("张辽", ["張遼"]),
    "xuchu":        ("许褚", ["許褚"]),
    "guojia":       ("郭嘉", []),
    "zhenji":       ("文昭甄皇后", ["甄氏", "甄宓"]),
    "xiahouyuan":   ("夏侯渊", ["夏侯淵"]),
    "liubei":       ("刘备", ["漢昭烈帝"]),
    "guanyu":       ("关羽", ["關羽"]),
    "zhangfei":     ("张飞", ["張飛"]),
    "zhugeliang":   ("诸葛亮", ["諸葛亮"]),
    "zhaoyun":      ("赵云", ["趙雲"]),
    "machao":       ("马超", ["馬超"]),
    "huangyueying": ("黄月英", ["黃月英"]),
    "sunquan":      ("孙权", ["吳大帝"]),
    "ganning":      ("甘宁", ["甘寧"]),
    "lvmeng":       ("吕蒙", ["呂蒙"]),
    "huanggai":     ("黄盖", ["黃蓋"]),
    "zhouyu":       ("周瑜", []),
    "daqiao":       ("大乔", ["大喬", "二喬"]),
    "luxun":        ("陆逊", ["陸遜"]),
    "sunshangxiang":("孙夫人 (刘备)", ["孫尚香", "孙尚香"]),
    "huatuo":       ("华佗", ["華佗"]),
    "lvbu":         ("吕布", ["呂布"]),
    "diaochan":     ("貂蝉", ["貂蟬"]),
    "huaxiong":     ("华雄", ["華雄"]),
}

def _get(url):
    last = None
    for attempt in range(4):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json,image/*;q=0.9,*/*;q=0.8"})
            with urllib.request.urlopen(req, timeout=20) as r:
                ctype = r.headers.get("Content-Type", "").lower()
                return r.read(), ctype
        except urllib.error.HTTPError as e:
            last = e
            if e.code in (429, 503, 500):
                wait = 4 * (attempt + 1) * (attempt + 1)
                print(f"      throttled ({e.code}), waiting {wait}s ...")
                time.sleep(wait); continue
            raise
        except Exception as e:
            last = e; time.sleep(2.0)
    if last: raise last

def api_image(title):
    q = urllib.parse.urlencode({
        "action": "query", "titles": title, "prop": "pageimages",
        "piprop": "original|thumbnail", "pithumbsize": "600", "format": "json",
        "redirects": "1",
    })
    data = json.loads(_get("https://zh.wikipedia.org/w/api.php?" + q)[0].decode("utf-8"))
    pages = data.get("query", {}).get("pages", {})
    for _, pg in pages.items():
        src = None
        if pg.get("original"): src = pg["original"]["source"]
        elif pg.get("thumbnail"): src = pg["thumbnail"]["source"]
        if src and not src.lower().endswith((".svg",)):
            return src
    return None

def download(url):
    raw, ctype = _get(url)
    if ctype and not (ctype.startswith("image/") or "jpeg" in ctype or "jpg" in ctype or "png" in ctype):
        raise ValueError(f"unexpected Content-Type: {ctype}")
    # validate image header
    if raw[:2] != b"\xff\xd8" and raw[:8] != b"\x89PNG\r\n\x1a\n":
        raise ValueError("downloaded file is not a supported image")
    return raw

def process(raw, key):
    im = Image.open(io.BytesIO(raw)).convert("RGB")
    # target 3:4 portrait
    TW, TH = 360, 480
    im = ImageOps.exif_transpose(im)
    w, h = im.size
    # scale to cover
    scale = max(TW / w, TH / h)
    nw, nh = int(w * scale + 0.5), int(h * scale + 0.5)
    im = im.resize((nw, nh), Image.LANCZOS)
    # crop: center horizontally, bias toward top (faces up high)
    left = (nw - TW) // 2
    top = int((nh - TH) * 0.18)
    im = im.crop((left, top, left + TW, top + TH))
    # subtle bottom gradient for name legibility
    grad = Image.new("L", (1, TH), 0)
    for y in range(TH):
        t = max(0.0, (y - TH * 0.62) / (TH * 0.38))
        grad.putpixel((0, y), int(180 * (t ** 1.4)))
    grad = grad.resize((TW, TH))
    black = Image.new("RGB", (TW, TH), (8, 14, 10))
    im = Image.composite(black, im, grad)
    out_path = OUT / (key + ".jpg")
    tmp_path = OUT / (key + ".jpg.tmp")
    im.save(tmp_path, "JPEG", quality=84)
    tmp_path.replace(out_path)  # atomic on most systems
    return im.size

def main():
    ok, fail = [], []
    manifest = {}
    if (OUT / "manifest.json").exists():
        try: manifest = json.loads((OUT / "manifest.json").read_text(encoding="utf-8"))
        except Exception: manifest = {}
    for key, (title, alts) in GENERALS.items():
        out_path = OUT / (key + ".jpg")
        if out_path.exists() and out_path.stat().st_size > 2000:
            try:
                with Image.open(out_path) as im:
                    im.verify()
                with Image.open(out_path) as im:
                    if key not in manifest:
                        manifest[key] = {"title": title, "src": None, "size": list(im.size)}
                ok.append(key); print(f"  [SKIP] {key} (exists)")
                continue
            except Exception as exc:
                print(f"  [BAD ] {key} (redownload: {exc})")
                out_path.unlink(missing_ok=True)
        # remove stale empty/corrupt file
        if out_path.exists() and out_path.stat().st_size <= 2000:
            out_path.unlink(missing_ok=True)
        src = None; used_title = title
        for t in [title] + alts:
            try:
                src = api_image(t)
            except Exception as e:
                print(f"      api err {t}: {e}"); src = None
            if src:
                used_title = t; break
            time.sleep(1.0)
        if not src:
            fail.append(key); print(f"  [MISS] {key} ({title})"); time.sleep(1.2); continue
        try:
            raw = download(src)
            sz = process(raw, key)
            ok.append(key); manifest[key] = {"title": used_title, "src": src, "size": sz}
            print(f"  [ OK ] {key:14s} <- {used_title}  {sz}")
        except Exception as e:
            fail.append(key); print(f"  [FAIL] {key}: {e}")
            out_path.unlink(missing_ok=True)
        time.sleep(1.3)
    manifest_path = OUT / "manifest.json"
    manifest_tmp = OUT / "manifest.json.tmp"
    manifest_tmp.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    manifest_tmp.replace(manifest_path)
    print(f"\nOK={len(ok)} FAIL={len(fail)}  fail={fail}")

if __name__ == "__main__":
    main()
