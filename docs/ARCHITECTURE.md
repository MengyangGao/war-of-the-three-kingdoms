# 架构说明

## 设计目标

项目保持“无需构建、可直接用 `file://` 打开”的约束，因此使用按顺序加载的经典脚本，而不是 ES Modules 或打包器。所有模块只向全局 `SGS` 命名空间公开稳定接口；核心引擎不访问 DOM，可以在 Node VM 中运行。

## 加载与依赖方向

```text
00-core / 10-cards
        ↓
30-cardeffects ←→ 40-engine ←→ 50-skills
        ↓              ↓
      60-ai        55-generals
        ↓              ↓
70-ui / 72-sound / 75-anim / 76-table / 77-state
                       ↓
                    80-main
```

- `00-core.js`：常量、随机数和无状态工具。
- `10-cards.js`：卡牌模板、牌堆和虚拟牌工厂，不包含结算逻辑。
- `30-cardeffects.js`：出牌合法性、响应、武器、锦囊和延时锦囊。
- `40-engine.js`：玩家、牌区移动、事件、伤害、濒死、回合和胜负。
- `50-skills.js`：技能声明及其钩子。技能通过事件修改结算上下文，不直接驱动 UI。
- `55-generals.js`：武将数据；只引用技能键。
- `60-ai.js`：对 `game.ask()` 请求做决策，不直接修改游戏状态。
- `70-ui.js`：浏览器渲染和 HumanAgent；只把合法选择返回引擎。
- `75-anim.js`：串行动画队列。动画失败会记录错误并释放队列，不阻塞规则结算。
- `77-state.js`：卡牌/目标选择状态，不包含规则判断。
- `80-main.js`：唯一装配入口。

`index.html` 与 `test/_files.js` 的加载顺序由 `test/validate.js` 自动核对。

## 核心不变量

### 卡牌区域

每张实体牌在任意时刻只能位于一个实体区域：牌堆、弃牌堆、某角色的手牌/装备/判定区。虚拟牌只引用组成它的实体子牌。所有跨角色移动应经过以下 API：

- `game.toDiscard(cards)`
- `game.discardCards(player, cards)`
- `game.gainCards(player, cards)`
- `game.equipCard(player, card)`
- `game.placeJudgeCard(player, card)`

这些 API 统一发出 `loseCardZone`，避免【连营】【枭姬】因调用路径不同而漏触发或重复触发。不要在效果代码中同时手动 `splice` 区域并 `push` 到另一区域。

正在结算的牌会登记在 `game.resolvingCards`。弃牌堆重洗时会排除它们，防止一张锦囊在自身结算期间被洗回并摸到。

### 选择边界

Agent 返回值是不可信输入。`game.ask()` 会规范化选项、卡牌和角色；`SGS.validatePlayAction()` 会再次验证出牌是否仍在当前合法选项中。效果函数仍需检查目标是否存活，因为异步结算可能使先前合法的目标失效。

### 判定时序

1. `judgeCard`：鬼才等改判技能修改 `forceCard`。
2. 引擎确定最终判定牌。
3. `judgeResult`：天妒等取得最终生效的判定牌。
4. 未被取得的判定牌进入弃牌堆。

不要把“改判”和“取得判定牌”注册在同一个事件上。

## 扩展约定

新增卡牌时：

1. 在 `CARD_DB` 添加元数据并在牌堆中放入实体牌。
2. 在 `buildCardOption()`/`buildTrickOption()`声明合法目标。
3. 在 `SGS.TRICKS` 或对应基本牌结算中实现效果。
4. 补一个规则反例测试，并确保随机对战牌数守恒。

新增技能时：

1. 在 `SGS.SKILLS` 注册唯一键。
2. 只使用文档顶部列出的钩子。
3. 主动技能通过 `active()` 声明候选与费用，通过 `onActivate()`结算。
4. AI 行为放入 `aiPlay()`，HumanAgent 交互留在通用 UI 流程；确需特殊表单时再扩展 `UI.beginSkill()`。

## 规则口径

这是一个原创视觉的离线单机实现，以项目内卡牌和技能描述为可执行规则口径，不宣称兼容或代表任何商业游戏、扩展包或线上平台。新增规则前应先写明本项目的设计口径，并把预期行为加入测试。
