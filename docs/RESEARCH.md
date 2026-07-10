# 游戏体验与合规调研

本轮重构不复刻任何商业游戏的美术、文案、界面布局或品牌识别，只提炼已公开的通用交互原则，并优先参考开放源码项目和标准组织。

## 可复用的产品原则

### 状态与阶段必须可读

- [boardgame.io](https://boardgame.io/documentation/) 将可序列化游戏状态、只读上下文、行动和阶段明确分离。项目继续保留无 DOM 的规则引擎，并把“当前玩家、当前阶段、可执行行动”转换为单一界面视图模型。
- 回合阶段以固定轨道呈现，当前阶段始终高亮；关键结算进入可追溯战报，动画只是状态变化的解释层，不控制规则。

### 卡牌操作要有渐进反馈

- [Godot Card Game Framework](https://github.com/db0/godot-card-game-framework) 展示了手牌自动排布、悬停放大、合法区域高亮、拖放、目标连线和大图预览等成熟模式。其代码为 AGPL-3.0，本项目仅参考交互概念，不复制实现或素材。
- 主操作采用“点击卡牌 → 高亮合法目标 → 明确确认/取消”，键盘和触屏都能完成。拖拽只作为增强，不能成为唯一通道。
- 每个状态必须同时有形状、文字或图标反馈，不能只依赖颜色。

### 休闲游戏要降低误触和记忆负担

- W3C 的 [WCAG 2.2 Target Size (Minimum)](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum) 要求交互目标至少达到 24×24 CSS 像素（或满足间距例外）。本项目主要按钮以 44px 为目标。
- 常用动作固定在底部指令栏，危险动作需要明确确认；等待 AI、响应出牌、弃牌和选目标使用不同提示语和视觉状态。
- 战报默认只显示关键事件，详情可展开，避免持续滚动文本争夺注意力。

## 开放项目与素材来源

| 来源 | 许可 | 本项目用途 |
| --- | --- | --- |
| [OpenDuelyst](https://github.com/open-duelyst/duelyst) | CC0-1.0 | 参考开源数字卡牌项目的完整性；不使用名称、标志或品牌元素 |
| [Godot Card Framework](https://godotengine.org/asset-library/asset/3616) | MIT | 参考轻量卡牌 UI 组件边界 |
| [Godot Card Game Framework](https://github.com/db0/godot-card-game-framework) | AGPL-3.0 | 仅参考交互范式，不复制代码 |
| [Kenney UI Pack](https://kenney.nl/assets/ui-pack) | CC0 | 可作为未来通用控件候选；当前版本不引入，优先使用项目自绘 CSS/SVG |
| [Wikimedia Commons](https://commons.wikimedia.org/wiki/Commons:Reusing_content_outside_Wikimedia/licenses/en) | 每个文件独立 | 历史人物画像；逐文件审计并保留署名账本 |

## 品牌与版权边界

- 商业产品的名称、标志、卡面、角色文案和整体视觉识别均不作为素材来源。公开版名称改为“**三分天下 · 风云牌局**”。
- [三国杀用户协议](https://www.sanguosha.cn/index.php/pc/news-detail-445.html) 明确声明其相关著作权、商标等权利归权利人或授权方所有，因此旧名称与宣称“完整复刻”的文案必须移除。
- [CC0 FAQ](https://wiki.creativecommons.org/wiki/CC0_FAQ) 说明 CC0 不处理商标、专利、隐私或人格权。即使开放项目采用 CC0，也不复用其品牌和标志。
- 开放素材遵循 [Creative Commons TASL 署名建议](https://wiki.creativecommons.org/wiki/Best_practices_for_attribution)：标题、作者、来源、许可，并标注修改。
- 默认允许：Public Domain、CC0、CC BY、CC BY-SA；默认拒绝：来源不明、仅限非商业、禁止演绎、抓取自商业游戏截图的素材。CC BY-SA 改编需保持相同许可。

## 对本项目的设计结论

1. 规则引擎不推倒重写，以现有自动化回归为安全边界；重构集中在呈现、交互状态与模块职责。
2. 形成原创“竹简、漆器、纸墨、朱砂”视觉语言，但纹理全部由 CSS/SVG 生成，不扫描或模仿商业卡面。
3. 桌面端采用中心战场、座次环和底部手牌坞；窄屏改为可横向浏览的对手带，不缩小到不可点击。
4. 所有牌局操作都通过统一指令栏说明“正在做什么、还需选择什么、如何退出”。
5. 引入资产清单、许可审计和 Git 里程碑，使视觉更新可追溯、可回滚、可复验。
