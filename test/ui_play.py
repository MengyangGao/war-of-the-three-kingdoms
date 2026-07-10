#!/usr/bin/env python3
"""Drive an actual HUMAN game through the DOM (clicks real cards/targets/
buttons) to exercise the interaction code paths (uiPlay/uiRespond/uiDiscard/
choosePlayers/etc). Verifies no stalls, no console errors, game completes.
"""
import sys, time, pathlib
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parents[1]

def main():
    n = int(sys.argv[1]) if len(sys.argv) > 1 else 5
    pace = sys.argv[2] if len(sys.argv) > 2 else "0.08"
    URL = (ROOT / "index.html").as_uri() + f"?pace={pace}"
    errors = []
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": 1400, "height": 900})
        page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        page.on("pageerror", lambda e: errors.append("PAGEERROR: " + str(e)))

        page.goto(URL)
        page.wait_for_selector("#startBtn", timeout=10000)
        for b in page.query_selector_all("#countSeg button"):
            if b.inner_text().strip() == f"{n}人":
                b.click(); break
        page.click("#startBtn")
        page.wait_for_selector("#table:not(.hidden)", timeout=10000)

        actions = 0
        stalls = 0
        last_sig = None
        deadline = time.time() + 150
        while time.time() < deadline:
            st = page.evaluate("""() => {
                if (window.__gameDone) return {done:true};
                const UI = window.SGS.UI, cur = UI.cur;
                const modalOpen = !document.getElementById('modal').classList.contains('hidden');
                if (modalOpen && UI.modalMandatory) return {modal:true};
                if (!cur) return {wait:true};
                const enabledBtns = [...document.querySelectorAll('#actions .act-btn')].filter(b=>!b.disabled).map(b=>b.textContent);
                return {
                  type: cur.req.type,
                  selCards: document.querySelectorAll('#hand .card.selectable').length,
                  selPlayers: document.querySelectorAll('.player.selectable').length,
                  unselCards: document.querySelectorAll('#hand .card.selectable:not(.selected)').length,
                  unselPlayers: document.querySelectorAll('.player.selectable:not(.selected)').length,
                  selectedCards: UI.selectedCards.length,
                  selectedPlayers: UI.selectedPlayers.length,
                  btns: enabledBtns,
                  overlay: !document.getElementById('overlay').classList.contains('hidden')
                };
            }""")
            if st.get("done") or st.get("overlay"):
                break
            if st.get("modal"):
                # mandatory modal (e.g. 观星) — mark cards then confirm
                for w in page.query_selector_all("#modal .gx-card")[1::2]:
                    try: w.click()
                    except Exception: pass
                btn = page.query_selector("#modal .btn-primary")
                if btn: btn.click()
                actions += 1
                time.sleep(0.05); continue
            if st.get("wait"):
                time.sleep(0.1); continue

            sig = (st["type"], st["selCards"], st["selPlayers"], st["selectedCards"], st["selectedPlayers"], tuple(st["btns"]))
            if sig == last_sig:
                stalls += 1
                if stalls > 40:
                    errors.append("STALL at " + str(st)); break
            else:
                stalls = 0
            last_sig = sig

            t = st["type"]
            def click_btn(text):
                for b in page.query_selector_all("#actions .act-btn"):
                    if not b.is_disabled() and b.inner_text().strip() == text:
                        b.click(); return True
                return False
            def click_first_btn():
                for b in page.query_selector_all("#actions .act-btn"):
                    if not b.is_disabled():
                        b.click(); return True
                return False
            def click_sel_card():
                e = page.query_selector("#hand .card.selectable:not(.selected)") or page.query_selector("#hand .card.selectable")
                if e: e.click(); return True
                return False
            def click_sel_player():
                e = page.query_selector(".player.selectable:not(.selected)") or page.query_selector(".player.selectable")
                if e: e.click(); return True
                return False

            if t in ("respond", "wuxie", "rescue"):
                if st["selCards"] > 0 and (actions % 3 != 0):  # sometimes respond with a card
                    click_sel_card()
                elif not click_btn("放弃"):
                    click_first_btn()
            elif t == "confirm":
                click_first_btn()
            elif t in ("chooseOption", "chooseZoneCard"):
                click_first_btn()
            else:  # play, discard, chooseCards, choosePlayers
                if "确定" in st["btns"]:
                    click_btn("确定")
                elif st["unselPlayers"] > 0:
                    click_sel_player()
                elif st["unselCards"] > 0:
                    click_sel_card()
                elif t == "play":
                    click_btn("结束回合") or click_first_btn()
                else:
                    click_first_btn()
            actions += 1
            time.sleep(0.03)

        info = page.evaluate("""() => {
            const g = window.__game; if(!g) return {noGame:true};
            return {finished:g.finished, winner:g.winners, turns:g.turnCount, deck:g.deck.length, discard:g.discard.length,
                    alive:g.players.filter(p=>p.alive).length, logLen:g.log.length};
        }""")
        page.screenshot(path=str(ROOT / "test" / "shot_play.png"))
        browser.close()

    print("=== UI HUMAN-PLAY ===")
    print("actions performed:", actions)
    print("state:", info)
    print("console errors:", len(errors))
    for e in errors[:20]:
        print("  ERR:", e)
    ok = (not errors) and info.get("finished")
    print("RESULT:", "PASS" if ok else "FAIL")
    sys.exit(0 if ok else 1)

if __name__ == "__main__":
    main()
