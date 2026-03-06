# G4 AI

> Gather the smartest, skip the rest.

G4 AI 是一个 Chrome 插件工作台：把多个海外 AI 网页会话拉到一个独立控制台中并排对比，支持快速新对话、互评、交叉评价与讨论模式。

---

## 当前状态（2026-03-07）

- 品牌已统一为 `G4 AI`
- 稳定模型仅保留 4 个：`Claude`、`ChatGPT`、`Gemini`、`Grok`
- 国内模型链路已移除（避免不稳定）
- 独立控制台窗口可用（不依赖网站 favicon）
- 已完成一轮低延迟优化（并行发送、并行抓取、标签缓存、健康缓存）

---

## 支持平台

- **Claude**（Anthropic）
- **ChatGPT**（OpenAI）
- **Gemini**（Google）
- **Grok**（xAI）

---

## 快速开始（小白版）

### 1）拉代码

```bash
git clone https://github.com/qianzhu18/CrossWise.git
cd CrossWise/AI-CrossTalk
```

### 2）构建前端资源

```bash
cd web
npm install
npm run build
cd ..
```

### 3）加载插件到 Chrome

1. 打开 `chrome://extensions/`
2. 打开右上角「开发者模式」
3. 点击「加载已解压的扩展程序」
4. 选择目录：`CrossWise/AI-CrossTalk/AI-CrossTalk`

### 4）开始使用

1. 点击浏览器插件图标，打开侧边栏
2. 点击「打开控制台」（会弹出独立窗口）
3. 在左侧勾选已连接 AI，输入消息发送

---

## 本地开发命令

在仓库根目录 `CrossWise/AI-CrossTalk`：

```bash
# 前端开发
cd web
npm run dev

# 前端构建（会输出到 AI-CrossTalk/web）
npm run build
```

---

## 性能与稳定性设计

当前版本已做的优化：

- 普通模式多 AI 发送改为并行（非串行）
- 互评 / 交叉 / 刷新流程并行化
- 讨论模式等待窗口从固定 8 秒降到更短策略
- 后台增加 AI 标签缓存，减少全量 tab 扫描
- 内容脚本健康缓存，减少重复 ping
- 请求超时收紧，失败更快返回（避免长时间卡死）

> 注意：网页自动化受目标站点 DOM、网络和账号状态影响，不可能“绝对零延迟”，但当前链路已优先做“快失败 + 并行”。

---

## 项目结构

```text
AI-CrossTalk/
├── AI-CrossTalk/                # Chrome 扩展主体
│   ├── background.js
│   ├── manifest.json
│   ├── content/
│   │   ├── claude.js
│   │   ├── chatgpt.js
│   │   ├── gemini.js
│   │   └── grok.js
│   ├── sidepanel/
│   │   ├── panel.html
│   │   ├── panel.css
│   │   └── panel.js
│   ├── icons/
│   └── web/                     # 构建产物
├── web/                         # React + TS 源码
└── scripts/
    └── generate-g4-icons.mjs
```

---

## 常见问题

### Q1：`fatal: not a git repository`

你不在仓库根目录。先执行：

```bash
cd /Users/mac/Downloads/code/CrossWise/AI-CrossTalk
```

### Q2：`bash` 报错 `.bashrc syntax error`

建议使用 `zsh`，或修复 `.bashrc` 里的错误行后再执行命令。

### Q3：为什么我复制命令会失败？

不要把 Markdown 代码块标记 `````bash` 和 ``` 复制到终端，只复制中间命令内容。

---

## Git 分支与版本

- 稳定分支开发：`feature/g4-ai-v1`
- 稳定标签：`v1.0.0`、`tag/1.0.0`

---

## 开源协议

MIT

---

## 致谢

- 原始灵感项目：`ai-roundtable`
- 当前仓库地址：`https://github.com/qianzhu18/CrossWise`
