# 三分天下 · 风云牌局

一款原创视觉、纯前端、离线可玩的三国题材策略卡牌游戏。无需账号、服务器或构建工具，直接打开 `index.html` 即可开始。

> 本项目不隶属于或代表任何商业桌游、电子游戏及其权利人；不使用第三方游戏的标志、界面截图、卡面或音频。三国历史人物与历史题材不等于任何特定商业品牌授权。

## 开始游戏

直接双击 `index.html`，或在项目目录启动任意静态文件服务器：

```bash
python -m http.server 8765
```

随后打开 `http://127.0.0.1:8765/`。选择 3–8 人与武将后开始身份演武。点击手牌或技能进入操作状态，选择合法目标，再通过底部指令栏确认或取消；右键或触屏长按卡牌可查看详情。

## 体验特点

- 独立规则引擎：规则层不依赖 DOM，可在 Node.js 中进行确定性测试和整局模拟。
- 清晰的操作闭环：浏览、选牌、选目标、确认、结算具有不同视觉状态和文字说明。
- 六阶段轨道：准备、判定、摸牌、出牌、弃牌、结束始终可见。
- 响应式牌桌：桌面完整展示座次，窄屏采用可横向浏览的对手带与固定指令栏。
- 离线演出：SVG 卡牌图标、CSS 纹理与 WebAudio 音效均由代码生成。
- 可审计资产：24 张历史画像逐项记录来源、许可、哈希和署名要求。

## 资产与许可

- 23 张历史画像为 Public Domain；孙尚香画像为 CC BY-SA 4.0，作者为 Wang Hui 王翙（1736–1795）。
- 完整逐项账本见 [`assets/ATTRIBUTION.md`](assets/ATTRIBUTION.md)，机器可读账本为 `assets/ATTRIBUTION.json`。
- 开放资产准入、修改和分发规则见 [`docs/ASSET_POLICY.md`](docs/ASSET_POLICY.md)。
- 联网复核并刷新账本：`npm run audit:assets:write`（需要 `requirements.txt` 中的 Pillow）。
- 项目代码本身尚未声明开源许可证；第三方资产许可不自动适用于项目代码。

## 结构

```text
index.html                 语义化页面壳与经典脚本装配
css/style.css              设计令牌、组件状态、响应式和减少动效模式
assets/generals/           经审计的历史人物画像
assets/ATTRIBUTION.*       人类/机器可读的资产账本
js/00-core.js              常量、工具、确定性随机数
js/10-cards.js             卡牌数据与牌堆
js/15-art.js               程序化 SVG 与人物图像映射
js/30-cardeffects.js       出牌合法性与牌效果
js/40-engine.js            玩家、回合、伤害、濒死、判定与胜负
js/50-skills.js            技能实现
js/55-generals.js          武将数据
js/60-ai.js                AI 决策
js/65-presentation.js      无 DOM 的展示层状态投影
js/70-ui.js                UI 组件、视图渲染和人类代理
js/72-sound.js             WebAudio 程序化声音
js/75-anim.js              动画时间线
js/76-seating.js           对手座次信息带
js/77-state.js             交互状态分发
js/80-main.js              大厅与游戏启动装配
test/                      结构、单元、模拟与浏览器测试
tools/audit_assets.py      Wikimedia Commons 许可审计
```

规则引擎与展示层的边界、状态不变量及扩展方式见 [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)；新版体验规格见 [`docs/REDESIGN.md`](docs/REDESIGN.md)，同类项目与标准调研见 [`docs/RESEARCH.md`](docs/RESEARCH.md)。

## 质量检查

```bash
npm run check              # 脚本顺序、数据引用、牌堆、画像和资产账本
npm test                   # 75 项规则断言、濒死测试、60 局 8 人模拟
npm run test:stress        # 500 局 8 人压力模拟
npm run audit:assets       # 联网复核 Wikimedia Commons 当前元数据
```

浏览器自动化测试需要 `requirements.txt` 与 Chromium：

```bash
pip install -r requirements.txt
playwright install chromium
npm run test:ui
```

提交前检查清单和已知边界见 [`docs/TESTING.md`](docs/TESTING.md) 与 [`docs/AUDIT.md`](docs/AUDIT.md)。

## 开发约定

- 规则状态只能由 Engine / Effects / Skills 修改；动画和 DOM 不得决定伤害、牌权或胜负。
- UI 先呈现合法性与下一步，再接受操作；不得以静默失败代替解释。
- 新增媒体文件必须先满足开放资产政策并更新账本，不接受来源不明或仅限非商业素材。
- 仍使用经典脚本顺序以支持 `file://`。内部 `SGS` 命名空间是当前兼容接口，不是公开品牌；后续模块化迁移应保持测试始终通过。
