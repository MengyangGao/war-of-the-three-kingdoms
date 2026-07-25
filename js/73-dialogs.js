/* ===========================================================================
 * 三分天下 · 弹窗、图鉴、详情与设置
 * ========================================================================== */
(function (root) {
  'use strict';
  var SGS = root.SGS = root.SGS || {};
  var UI = SGS.UI;
  if (!UI || typeof document === 'undefined') return;
  var $ = function (id) { return document.getElementById(id); };
  function el(tag, cls, txt) { var node = document.createElement(tag); if (cls) node.className = cls; if (txt != null) node.textContent = txt; return node; }
  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }
  var modalTitleId = 0;
  function focusableNodes(box) {
    return Array.prototype.filter.call(box.querySelectorAll('button,a[href],input,select,textarea,[tabindex]:not([tabindex="-1"])'), function (node) {
      return !node.disabled && node.getAttribute('aria-hidden') !== 'true';
    });
  }
  function restoreModalFocus() {
    var previous = UI._modalReturnFocus;
    UI._modalReturnFocus = null;
    if (previous && document.contains(previous) && previous.focus) previous.focus();
  }
  function modalKeydown(event) {
    var modal = $('modal');
    if (!modal || modal.classList.contains('hidden')) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      UI.closeModal();
      return;
    }
    if (event.key !== 'Tab') return;
    var nodes = focusableNodes(modal.querySelector('.modal-box'));
    if (!nodes.length) return;
    var first = nodes[0], last = nodes[nodes.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault(); last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault(); first.focus();
    }
  }
  /* ============================ Modals & detail views ============================ */
  UI.openModal = function (buildFn) {
    UI.modalMandatory = false;
    UI._modalReturnFocus = document.activeElement;
    var m = $('modal'); m.classList.remove('hidden');
    var box = m.querySelector('.modal-box'); clear(box);
    var x = el('button', 'close-x', '✕'); x.type = 'button'; x.setAttribute('aria-label', '关闭弹窗'); x.onclick = UI.closeModal; box.appendChild(x);
    buildFn(box);
    var title = box.querySelector('h2');
    if (title) {
      title.id = 'modalTitle' + (++modalTitleId);
      m.setAttribute('aria-labelledby', title.id);
    } else {
      m.setAttribute('aria-label', '详情');
    }
    m.onclick = function (e) { if (e.target === m) UI.closeModal(); };
    m.onkeydown = modalKeydown;
    x.focus();
  };
  UI.closeModal = function () {
    if (UI.modalMandatory) return;
    var modal = $('modal');
    modal.classList.add('hidden');
    modal.onkeydown = null;
    restoreModalFocus();
  };
  UI.closeModalForce = function () {
    UI.modalMandatory = false;
    var modal = $('modal');
    modal.classList.add('hidden');
    modal.onkeydown = null;
    restoreModalFocus();
  };

  UI.skillRows = function (gen, container) {
    var isLord = false;
    var names = (gen.skills || []).slice();
    (gen.lordSkills || []).forEach(function (n) { names.push(n); });
    names.forEach(function (n) {
      var sk = SGS.SKILLS[n]; if (!sk) return;
      var row = el('div', 'skill');
      row.appendChild(el('div', 'sname', sk.cn + (sk.lord ? '（主公技）' : '')));
      row.appendChild(el('div', 'sdesc', sk.desc || ''));
      container.appendChild(row);
    });
  };

  UI.generalDetail = function (pOrGen) {
    var gen = pOrGen.general ? pOrGen.general : pOrGen;
    var player = pOrGen.general ? pOrGen : null;
    if (!gen) return;
    UI.openModal(function (box) {
      box.appendChild(el('h2', null, gen.cn + ' · ' + (gen.title || '')));
      var wrap = el('div', 'gd');
      var por = el('div', 'portrait');
      UI.portraitInto(por, gen);
      wrap.appendChild(por);
      var meta = el('div', 'meta');
      var natName = SGS.NATIONS[gen.nation] ? SGS.NATIONS[gen.nation].cn : '';
      var r1 = el('div', 'row'); r1.innerHTML = '国别：<b>' + natName + '</b>　性别：<b>' + (gen.gender === 'male' ? '男' : '女') + '</b>　勾玉（体力上限）：<b>' + gen.hp + '</b>';
      meta.appendChild(r1);
      if (player) {
        var r2 = el('div', 'row');
        r2.innerHTML = '身份：<b>' + UI.roleLabel(player).t + '</b>　当前体力：<b>' + Math.max(0, player.hp) + '/' + player.maxHp + '</b>　手牌：<b>' + player.hand.length + '</b>';
        meta.appendChild(r2);
        var hp = el('div', 'hpline'); hp.appendChild(UI.hpEl(player)); meta.appendChild(hp);
        // equipment
        var eqs = [];
        for (var k in player.equips) if (player.equips[k]) eqs.push(SGS.cardLabel(player.equips[k]));
        if (eqs.length) { var re = el('div', 'row'); re.innerHTML = '装备：<b>' + eqs.join('，') + '</b>'; meta.appendChild(re); }
      }
      meta.appendChild(el('div', 'row', '技能：'));
      UI.skillRows(gen, meta);
      wrap.appendChild(meta);
      box.appendChild(wrap);
    });
  };

  UI.skillDetail = function (sk) {
    if (typeof sk === 'string') sk = SGS.SKILLS[sk];
    if (!sk) return;
    UI.openModal(function (box) {
      box.appendChild(el('h2', null, sk.cn + (sk.lord ? '（主公技）' : '') + ' · 技能'));
      var d = el('div', 'gd');
      var info = el('div', 'meta');
      info.appendChild(el('div', 'sdesc', sk.desc || ''));
      d.appendChild(info);
      box.appendChild(d);
    });
  };

  UI.cardDetail = function (card) {
    UI.openModal(function (box) {
      box.appendChild(el('h2', null, '卡牌详情'));
      var wrap = el('div', 'cd');
      var big = el('div', 'bigcard'); big.appendChild(UI.cardEl(card, { noDetail: true }));
      wrap.appendChild(big);
      var info = el('div', 'info');
      info.appendChild(el('div', 't', card.cn + (SGS.SUITS[card.suit] ? ('　' + SGS.SUITS[card.suit].symbol + SGS.rankName(card.rank)) : '')));
      var typ = card.type === 'equip' ? ('装备牌 · ' + ({ weapon: '武器', armor: '防具', offhorse: '进攻坐骑（-1）', defhorse: '防御坐骑（+1）' }[card.subtype] || '')) :
        card.type === 'trick' ? ('锦囊牌 · ' + (card.subtype === 'delay' ? '延时类' : '即时类')) : '基本牌';
      info.appendChild(el('div', 'k', typ + (card.range ? ('　攻击范围 ' + card.range) : '')));
      var tpl = SGS.CARD_DB[card.name];
      info.appendChild(el('div', 'd', (tpl && tpl.desc) || card.desc || ''));
      wrap.appendChild(info);
      box.appendChild(wrap);
    });
  };

  /* ============================ Encyclopedia (图鉴) ============================ */
  UI.encyclopedia = function (tab) {
    tab = tab || 'generals';
    UI.openModal(function (box) {
      box.appendChild(el('h2', null, '图鉴'));
      var tabs = el('div', 'tabs');
      var bG = el('button', tab === 'generals' ? 'on' : '', '武将（' + SGS.generalList().length + '）');
      var bC = el('button', tab === 'cards' ? 'on' : '', '卡牌');
      bG.onclick = function () { UI.closeModal(); UI.encyclopedia('generals'); };
      bC.onclick = function () { UI.closeModal(); UI.encyclopedia('cards'); };
      tabs.appendChild(bG); tabs.appendChild(bC); box.appendChild(tabs);
      var body = el('div');
      if (tab === 'generals') UI.buildGenEncy(body); else UI.buildCardEncy(body);
      box.appendChild(body);
    });
  };
  UI.buildGenEncy = function (body) {
    var grid = el('div', 'ency-grid');
    var byNation = { wei: [], shu: [], wu: [], qun: [] };
    SGS.generalList().forEach(function (g) { (byNation[g.nation] || (byNation[g.nation] = [])).push(g); });
    ['wei', 'shu', 'wu', 'qun'].forEach(function (nat) {
      var list = byNation[nat] || []; if (!list.length) return;
      body.appendChild(el('div', 'ency-cat', SGS.NATIONS[nat].cn + ' 势力（' + list.length + '）'));
      var g2 = el('div', 'ency-grid');
      list.forEach(function (g) {
        var cell = el('button', 'ency-gen');
        cell.type = 'button';
        var th = el('div', 'th');
        UI.setPortrait(th, g, false);
        cell.appendChild(th);
        cell.appendChild(el('div', 'nm', g.cn));
        cell.appendChild(el('div', 'nt', g.title || ''));
        cell.onclick = function () { UI.closeModal(); UI.generalDetail(g); };
        g2.appendChild(cell);
      });
      body.appendChild(g2);
    });
  };
  UI.buildCardEncy = function (body) {
    var cats = [
      { t: '基本牌', names: ['sha', 'shan', 'tao', 'jiu'] },
      { t: '装备 · 武器', names: ['zhugeliannu', 'cixiongjian', 'qinggangjian', 'hanbingjian', 'qinglongyanyuedao', 'zhangbashemao', 'guanshifu', 'fangtianhuaji', 'qilingong'] },
      { t: '装备 · 防具', names: ['bagua', 'renwang', 'tengjia'] },
      { t: '装备 · 坐骑', names: ['chitu', 'dayuan', 'zixing', 'dilu', 'jueying', 'zhuahuangfeidian'] },
      { t: '锦囊 · 即时', names: ['wuzhongshengyou', 'guohechaiqiao', 'shunshouqianyang', 'juedou', 'jiedaosharen', 'huogong', 'tiesuolianhuan', 'wuxiekeji', 'wugufengdeng', 'taoyuanjieyi', 'nanmanruqin', 'wanjianqifa'] },
      { t: '锦囊 · 延时', names: ['lebusishu', 'bingliangcunduan', 'shandian'] }
    ];
    cats.forEach(function (cat) {
      body.appendChild(el('div', 'ency-cat', cat.t));
      var row = el('div', 'ency-cards');
      cat.names.forEach(function (nm) {
        var tpl = SGS.CARD_DB[nm]; if (!tpl) return;
        var card = { name: nm, cn: tpl.cn, type: tpl.type, subtype: tpl.subtype, suit: 'spade', rank: 1, element: 'normal', range: tpl.range, desc: tpl.desc };
        var ce = UI.cardEl(card, { mini: true, noDetail: true });
        ce.style.cursor = 'pointer';
        ce.onclick = function () { UI.closeModal(); UI.cardDetail(card); };
        row.appendChild(ce);
      });
      body.appendChild(row);
    });
  };

  UI.assetCredits = function () {
    UI.openModal(function (box) {
      box.appendChild(el('div', 'panel-kicker', '开放资产账本'));
      box.appendChild(el('h2', null, '来源与许可'));
      box.appendChild(el('p', 'license-copy', '24 张历史画像均来自 Wikimedia Commons 并经过许可审计：23 张为公有领域，孙尚香画像为 CC BY-SA 4.0，作者 Wang Hui 王翙（1736–1795）。卡牌图标、界面纹理与音效由本项目代码生成。'));
      var embedded = document.getElementById('embeddedAttribution');
      if (embedded) {
        var pre = el('pre', 'embedded-ledger');
        try { pre.textContent = JSON.parse(embedded.textContent); } catch (e) { pre.textContent = embedded.textContent; }
        box.appendChild(pre);
        return;
      }
      var links = el('div', 'license-links');
      var ledger = document.createElement('a'); ledger.href = 'assets/ATTRIBUTION.md'; ledger.textContent = '查看完整资产账本'; ledger.target = '_blank'; ledger.rel = 'noopener';
      var policy = document.createElement('a'); policy.href = 'docs/ASSET_POLICY.md'; policy.textContent = '查看开放资产政策'; policy.target = '_blank'; policy.rel = 'noopener';
      links.appendChild(ledger); links.appendChild(policy); box.appendChild(links);
    });
  };

  /* ============================ Settings ============================ */
  UI.settings = function () {
    UI.openModal(function (box) {
      box.appendChild(el('h2', null, '设置'));
      var row = el('div', 'set-row');
      row.appendChild(el('label', null, '游戏节奏'));
      var rng = document.createElement('input'); rng.type = 'range'; rng.min = '0.2'; rng.max = '1.8'; rng.step = '0.1';
      rng.value = String(SGS.PACE == null ? 0.8 : SGS.PACE);
      var val = el('span', null, '');
      function upd() { var v = parseFloat(rng.value); if (SGS.setPace) SGS.setPace(v); else { SGS.PACE = v; if (SGS.Anim) SGS.Anim.PACE = v; save('pace', v); } val.textContent = v <= 0.5 ? '快' : v >= 1.3 ? '慢' : '适中'; }
      rng.oninput = upd; upd();
      row.appendChild(rng); row.appendChild(val);
      box.appendChild(row);

      if (SGS.Sound) {
        var s = SGS.Sound;
        // sfx toggle
        var r2 = el('div', 'set-row'); r2.appendChild(el('label', null, '音效'));
        var b2 = el('button', 'btn-ghost', s.sfxOn ? '开' : '关');
        b2.onclick = function () { s.setSfx(!s.sfxOn); b2.textContent = s.sfxOn ? '开' : '关'; if (s.sfxOn) { s.init(); s.play('click'); } };
        r2.appendChild(b2); box.appendChild(r2);
        // music toggle
        var r3 = el('div', 'set-row'); r3.appendChild(el('label', null, '背景音乐'));
        var b3 = el('button', 'btn-ghost', s.musicOn ? '开' : '关');
        b3.onclick = function () { s.setMusic(!s.musicOn); b3.textContent = s.musicOn ? '开' : '关'; };
        r3.appendChild(b3); box.appendChild(r3);
        // volume
        var r4 = el('div', 'set-row'); r4.appendChild(el('label', null, '音量'));
        var vr = document.createElement('input'); vr.type = 'range'; vr.min = '0'; vr.max = '1'; vr.step = '0.05'; vr.value = String(s.volume);
        vr.oninput = function () { s.init(); s.setVolume(parseFloat(vr.value)); };
        r4.appendChild(vr); box.appendChild(r4);
      }

      box.appendChild(el('div', 'set-row', '距离：角色左上角显示“你 → 对方”的真实距离；绿色“可攻击”表示不超过当前攻击范围。悬停可查看双向距离，坐骑和技能可能使两个方向不同。'));
      box.appendChild(el('div', 'set-row', '互动：角色画像上方最多保留五条最近事件摘要，悬停摘要可查看完整的攻击、救援、技能或计策记录。'));
      box.appendChild(el('div', 'set-row', '操作：右键（触屏长按）任意卡牌查看详情；点击角色查看武将资料与技能。'));
      var credits = el('button', 'btn-ghost', '图像来源与许可');
      credits.onclick = function () { UI.closeModal(); UI.assetCredits(); };
      box.appendChild(credits);
      var restart = el('button', 'btn-ghost', '重新开始（回到选将）');
      restart.onclick = function () { location.href = location.pathname; };
      box.appendChild(restart);
    });
  };
  function save(key, v) { try { localStorage.setItem('sft_' + key, JSON.stringify(v)); } catch (e) {} }

})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
