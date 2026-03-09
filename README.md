# G4 AI

> Gather the smartest, skip the rest.

G4 AI 是一个 Chrome / Edge 插件工作台：把多个海外 AI 网页会话拉到一个独立控制台中并排对比，支持普通群发、互评、定向交叉评审和讨论模式。

当前支持：

- Claude
- ChatGPT
- Gemini
- Grok

## 目标安装方式

这个项目现在以“别人不需要跑任何命令，只要从 GitHub 下载现成包并导入浏览器”作为发布标准。

对普通用户来说：

- 不需要 Node.js
- 不需要 `npm install`
- 不需要 `npm run build`
- 不需要本地跑 `localhost`

用户只需要：

1. 从 GitHub Release 下载现成 zip
2. 解压
3. 打开 `chrome://extensions/`
4. 点击 `Load unpacked`
5. 选择解压后的扩展文件夹

## 给普通用户的安装方式

### 第一步：去 GitHub Releases 下载

进入项目的 `Releases` 页面，下载发布资产：

```text
g4-ai-extension-vX.Y.Z.zip
```

这是已经构建好的可安装版本。

不要优先下载下面这两种：

- `Source code (zip)`
- `Source code (tar.gz)`

因为它们是源码归档，不是面向普通用户的推荐安装包。

### 第二步：解压 zip

解压后，你会得到一个文件夹，名称类似：

```text
g4-ai-extension-v1.0.1/
```

这个文件夹里应该直接能看到：

```text
manifest.json
background.js
content/
sidepanel/
icons/
web/
INSTALL.txt
```

只要 `manifest.json` 在这个目录的第一层，就说明你选对了。

### 第三步：在 Chrome / Edge 中导入

1. 打开 `chrome://extensions/`
2. 打开右上角“开发者模式”
3. 点击 `Load unpacked`
4. 选择刚才解压出来的文件夹

导入成功后，扩展列表里会出现 `G4 AI`。

### 第四步：打开 AI 网页并登录

至少打开并登录一个支持的平台：

- `https://claude.ai/`
- `https://chatgpt.com/` 或 `https://chat.openai.com/`
- `https://gemini.google.com/`
- `https://grok.com/` 或 `https://x.ai/`

建议直接进入聊天页，不要只停留在首页或登录中间页。

### 第五步：开始使用

1. 点击浏览器工具栏里的 `G4 AI`
2. 打开侧边栏
3. 在侧边栏里点击“打开控制台”
4. 在控制台勾选 AI，输入问题并发送

## 安装成功的标准

满足下面 4 条，就说明别人电脑上的安装已经成功：

1. 扩展能在 `chrome://extensions/` 里显示
2. 点击扩展图标后，侧边栏可以打开
3. 已登录的 AI 页面在侧边栏中显示为已连接
4. 打开控制台后，可以发送一条测试消息并收到回复

## 最重要的分发原则

如果你要把这个项目发给别人，推荐方式只有一种：

1. 让别人去 GitHub `Releases`
2. 下载发布资产 `g4-ai-extension-vX.Y.Z.zip`
3. 解压后直接 `Load unpacked`

不要再让普通用户执行任何构建命令。

## 如果有人下错了 GitHub 源码包

如果对方下载的是仓库首页的 `Code -> Download ZIP`，或者 Release 页面下方的 `Source code (zip)`，也不是完全不能用，但不推荐作为正式分发方式。

原因是源码包里目录会多一层，普通用户更容易选错目录。

如果对方已经下了源码包，真正需要导入浏览器的仍然是其中这个目录：

```text
AI-CrossTalk/
```

判断标准仍然一样：

- 选中的目录里第一层必须直接看到 `manifest.json`

## 首次使用建议

### 普通模式

1. 在左侧勾选目标 AI
2. 在输入框中输入问题
3. 回车发送
4. 等待各 AI 返回结果

### `/mutual` 互评

`/mutual` 会让当前选中的 AI 互相评审彼此的回答。

示例：

```text
/mutual
```

```text
/mutual 请指出其他回答中的漏洞，并给出你认为更好的版本
```

建议先问一轮，再执行 `/mutual`。

### `/cross` 定向交叉评审

语法：

```text
/cross @目标AI <- @来源AI 补充提示词
```

示例：

```text
/cross @claude <- @chatgpt 请只检查逻辑漏洞，不要重复原答案
```

多目标示例：

```text
/cross @claude @gemini <- @chatgpt 请分别给出批判性改写
```

### 讨论模式

讨论模式适合 2 到 4 个 AI 围绕同一主题多轮交流、互相回应、最后生成总结。

## 常见问题

### 1）为什么我已经下载 zip 了，Chrome 还是导入失败？

最常见原因是你选错了目录。

Chrome 要求你选中的文件夹第一层就直接包含：

```text
manifest.json
```

如果 `manifest.json` 还在更深一层，继续进入那一层再选。

### 2）为什么插件装上了，但 AI 状态一直是灰色？

按顺序检查：

1. 目标网站是否已经打开
2. 是否已经登录
3. 当前页面是否是真正聊天页
4. 是否刷新过该 AI 页面
5. 是否同平台开了多个标签页

建议每个平台只保留一个聊天标签页，否则容易出现状态判断或发送异常。

### 3）控制台能打开，但发消息失败

这类问题通常来自目标网站页面结构变化、页面不在正确聊天状态，或者同平台开了多个标签页。

先尝试：

1. 刷新目标 AI 页面
2. 确认该网页中的输入框和发送按钮可正常使用
3. 关闭同平台多余标签页
4. 回到 `chrome://extensions/` 刷新扩展

### 4）这个项目是不是已经可以“零命令安装”？

对普通用户来说，是的。

前提是你下载的是 GitHub Release 里的现成发布包，而不是自己从源码重新构建。

## 给维护者的发布流程

这个仓库已经补上了“发布 Release 资产”的自动流程。

发布时建议这样做：

1. 更新 [`AI-CrossTalk/manifest.json`](AI-CrossTalk/manifest.json) 中的版本号
2. 如有需要，同步更新 [`web/package.json`](web/package.json) 中的版本号
3. 提交代码
4. 创建并推送 tag，例如：

```bash
git tag v1.0.1
git push origin v1.0.1
```

推送 tag 后，GitHub Actions 会自动完成：

1. 安装 `web` 依赖
2. 构建前端产物到扩展目录
3. 生成发布目录
4. 打包成：

```text
g4-ai-extension-v1.0.1.zip
```

5. 上传到对应的 GitHub Release

相关文件：

- `.github/workflows/release-extension.yml`
- `scripts/prepare-release.mjs`

### Release 资产里是什么

Release zip 解压后，得到的是一个已经构建好的扩展目录：

```text
g4-ai-extension-vX.Y.Z/
├── manifest.json
├── background.js
├── content/
├── sidepanel/
├── icons/
├── web/
└── INSTALL.txt
```

这个目录就是给最终用户 `Load unpacked` 用的。

## 从源码开发（仅开发者）

只有在下面这些情况下，才需要本地命令：

- 你要改前端界面
- 你要改内容脚本
- 你要重新生成一个新版本

### 环境

- Node.js 18+（建议）
- npm

### 本地构建

```bash
git clone https://github.com/qianzhu18/G4-AI.git
cd G4-AI/AI-CrossTalk
cd web
npm install
npm run build
cd ..
```

构建产物会输出到：

```text
AI-CrossTalk/web/
```

浏览器真正要加载的目录仍然是：

```text
AI-CrossTalk/
```

### 本地开发模式

```bash
cd web
npm install
npm run dev
```

这属于开发调试模式，不是普通用户安装时走的路径。

在这个模式下：

- 你可能需要使用扩展里的 `Extension ID`
- 你可能需要使用 6 位配对码
- 这些都只和开发调试有关

## 项目结构

```text
AI-CrossTalk/
├── AI-CrossTalk/                 # Chrome 扩展主体，也是浏览器实际加载的目录
│   ├── manifest.json
│   ├── background.js
│   ├── content/
│   ├── sidepanel/
│   ├── icons/
│   └── web/                     # 已构建的控制台前端
├── web/                         # React + TS 源码
├── scripts/
│   ├── generate-g4-icons.mjs
│   └── prepare-release.mjs
└── .github/workflows/
    └── release-extension.yml
```

## 当前限制

- 目前仍然是“下载 zip 后手动 `Load unpacked`”的安装方式
- 还没有上架 Chrome Web Store
- 功能依赖目标 AI 网站页面结构，站点改版后可能需要适配
- 不同地区网络、账号状态、订阅方案可能影响使用效果

## 开源协议

MIT
