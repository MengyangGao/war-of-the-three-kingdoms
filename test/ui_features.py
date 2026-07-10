#!/usr/bin/env python3
"""Capture screenshots that demonstrate the newer features:
  - battle log with GENERAL names (not 玩家N)
  - the settings modal with SOUND / MUSIC toggles
  - a mobile / responsive layout at a narrow viewport
Also asserts 0 console errors while doing so.
"""
import sys, time, pathlib
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parents[1]

def main():
    errors = []
    out = {}
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": 1400, "height": 900})
        page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        page.on("pageerror", lambda e: errors.append("PAGEERROR: " + str(e)))

        # ---- desktop demo game, let logs accumulate ----
        page.goto((ROOT / "index.html").as_uri() + "?demo=1&pace=0.02")
        page.wait_for_selector("#startBtn", timeout=10000)
        for b in page.query_selector_all("#countSeg button"):
            if b.inner_text().strip() == "8人":
                b.click(); break
        page.click("#startBtn")
        page.wait_for_selector("#table:not(.hidden)", timeout=10000)
        time.sleep(4.0)

        # open the battle log
        page.evaluate("() => document.getElementById('logToggle').click()")
        time.sleep(0.4)
        page.screenshot(path=str(ROOT / "test" / "shot_v4_log.png"))
        # sample a few log lines to prove general names appear
        out["log_sample"] = page.evaluate(
            "() => [...document.querySelectorAll('#log .log-line, #log > div')].slice(-8).map(e=>e.textContent.trim()).filter(Boolean)")
        # close log
        page.evaluate("() => document.getElementById('logToggle').click()")
        time.sleep(0.2)

        # ---- settings modal (sound toggles) ----
        page.evaluate("() => document.getElementById('settingsBtn').click()")
        time.sleep(0.4)
        out["modal_text"] = page.evaluate(
            "() => { const m=document.getElementById('modal'); return m && !m.classList.contains('hidden') ? m.innerText : ''; }")
        page.screenshot(path=str(ROOT / "test" / "shot_v4_settings.png"))
        # dismiss modal
        page.evaluate("() => window.SGS && window.SGS.UI && window.SGS.UI.closeModal && window.SGS.UI.closeModal()")
        time.sleep(0.2)

        # ---- mobile / responsive layout ----
        page.set_viewport_size({"width": 390, "height": 844})
        time.sleep(0.6)
        page.screenshot(path=str(ROOT / "test" / "shot_v4_mobile.png"))

        browser.close()

    print("=== UI FEATURES ===")
    print("log sample:")
    for l in out.get("log_sample", []):
        print("   ", l)
    print("settings modal has 音效/音乐:",
          ("音效" in out.get("modal_text", "")) or ("音乐" in out.get("modal_text", "")) or ("声音" in out.get("modal_text", "")))
    print("console errors:", len(errors))
    for e in errors[:20]:
        print("  ERR:", e)
    ok = not errors and bool(out.get("log_sample"))
    print("RESULT:", "PASS" if ok else "FAIL")
    sys.exit(0 if ok else 1)

if __name__ == "__main__":
    main()
