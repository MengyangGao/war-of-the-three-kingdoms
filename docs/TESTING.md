# 测试说明

## 默认验证

```bash
npm test
```

默认测试依次运行：

1. 结构校验：脚本顺序、武将/技能引用、牌堆字段、牌 ID 和立绘映射。
2. 75 项规则断言：卡牌、技能、牌区事件、判定时序、动作校验和历史缺陷反例。
3. 濒死专项测试。
4. 60 局固定种子的 8 人 AI 对战，检查异常、胜负结束和 130 张实体牌守恒。

常用子命令：

```bash
npm run check          # 仅结构校验
npm run test:unit      # 结构 + 单元 + 濒死
npm run test:sim       # 60 局模拟
npm run test:stress    # 500 局压力模拟
npm run build:single   # 生成并校验无外部应用资源的单文件版
node test/run.js 120 5 42
node test/dump.js 42 8
```

随机模拟不是规则正确性的替代品。发现缺陷后应先用固定场景写断言，再保留触发问题的 seed 做回归。

## 浏览器 UI 测试

建议使用虚拟环境安装开发依赖：

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
playwright install chromium
npm run test:ui
```

UI 测试覆盖真实点击、目标选择、响应、弹窗、战报和移动端布局。若 Playwright 或 Chromium 未安装，测试会明确失败，不应把 Node 规则测试写成“UI 已验证”。

## 提交前清单

- `npm test` 通过。
- 修改 UI 时额外运行 `npm run test:ui`。
- 发布分享版前运行 `npm run build:single`，并确认 `dist/sanfen-tianxia.html` 可独立打开。
- 新卡牌/技能至少包含一个成功场景和一个非法/取消/空区域场景。
- 牌移动只能通过引擎移动 API。
- 新脚本同时加入 `index.html`；若无 DOM 依赖且需要无头测试，再加入 `test/_files.js`。
