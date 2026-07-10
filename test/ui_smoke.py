#!/usr/bin/env python3
"""Smoke-test the browser UI end-to-end via Playwright.

Loads index.html in ?demo=1 (all seats AI-driven), captures console/page
errors, waits for the game to finish, and saves screenshots.
"""
import sys, time, pathlib
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parents[1]
URL = (ROOT / "index.html").as_uri() + "?demo=1&pace=0.02"

def main():
    n = int(sys.argv[1]) if len(sys.argv) > 1 else 8
    errors, warnings = [], []
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": 1400, "height": 900})

        def on_console(msg):
            if msg.type == "error":
                errors.append(msg.text)
            elif msg.type == "warning":
                warnings.append(msg.text)
        page.on("console", on_console)
        page.on("pageerror", lambda e: errors.append("PAGEERROR: " + str(e)))

        page.goto(URL)
        # choose player count then start
        page.wait_for_selector("#startBtn", timeout=10000)
        # pick the requested player count
        for b in page.query_selector_all("#countSeg button"):
            if b.inner_text().strip() == f"{n}人":
                b.click(); break
        page.click("#startBtn")

        # wait for the table to show
        page.wait_for_selector("#table:not(.hidden)", timeout=10000)
        time.sleep(2.0)
        page.screenshot(path=str(ROOT / "test" / "shot_mid.png"))

        # wait until game done (window.__gameDone) or timeout
        done = False
        deadline = time.time() + 90
        while time.time() < deadline:
            try:
                if page.evaluate("window.__gameDone === true"):
                    done = True; break
            except Exception as e:
                errors.append("EVAL: " + str(e))
                break
            time.sleep(0.5)

        # gather some state
        try:
            info = page.evaluate("""() => {
                const g = window.__demoGame;
                if (!g) return {noGame:true};
                return {
                  finished: g.finished, winner: g.winners, turns: g.turnCount,
                  alive: g.players.filter(p=>p.alive).length,
                  players: g.players.length,
                  deck: g.deck.length, discard: g.discard.length,
                  logLen: g.log.length
                };
            }""")
        except Exception as e:
            info = {"evalError": str(e)}

        try:
            page.screenshot(path=str(ROOT / "test" / "shot_end.png"))
        except Exception:
            pass
        browser.close()

    print("=== UI SMOKE ===")
    print("URL:", URL)
    print("game done:", done)
    print("state:", info)
    print("console errors:", len(errors))
    for e in errors[:20]:
        print("  ERR:", e)
    print("console warnings:", len(warnings))
    for w in warnings[:5]:
        print("  WARN:", w)
    ok = done and not errors and not info.get("noGame") and info.get("finished")
    print("RESULT:", "PASS" if ok else "FAIL")
    sys.exit(0 if ok else 1)

if __name__ == "__main__":
    main()
