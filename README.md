# G4 AI

> Gather the smartest, skip the rest.

G4 AI 是一个 Chrome / Edge 插件：把 Claude、ChatGPT、Gemini、Grok 放到一个控制台里并排对比，支持普通提问、互评、交叉评审和讨论模式。

## 安装

普通用户不要跑命令，直接下载 Release 资产：

1. 打开 GitHub `Releases`
2. 下载 `g4-ai-extension-vX.Y.Z.zip`
3. 解压
4. 打开 `chrome://extensions/`
5. 打开“开发者模式”
6. 点击 `Load unpacked`
7. 选择解压后的文件夹

只选这个包：

```text
g4-ai-extension-vX.Y.Z.zip
```

不要选：

- `Source code (zip)`
- `Source code (tar.gz)`

正确导入目录第一层应直接包含：

```text
manifest.json
background.js
content/
sidepanel/
icons/
web/
INSTALL.txt
```

## 使用

1. 先登录至少一个支持的平台
2. 点击浏览器工具栏里的 `G4 AI`
3. 打开侧边栏
4. 点击“打开控制台”

支持平台：

- Claude
- ChatGPT
- Gemini
- Grok

常用功能：

- 普通提问：勾选 AI 后直接发送
- `/mutual`：让当前选中的 AI 互评
- `/cross @A <- @B`：让 A 基于 B 的回答继续分析
- 讨论模式：让 2-4 个 AI 多轮讨论同一主题

## 验收标准

满足下面几条，说明安装成功：

1. 扩展能在 `chrome://extensions/` 中显示
2. 侧边栏能打开
3. 已登录的 AI 在侧边栏中显示为已连接
4. 控制台能打开并收到回复

## 常见问题

### 导入失败

通常是目录选错了。

判断标准只有一个：

- 你选中的文件夹第一层必须直接有 `manifest.json`

### 状态一直是灰色

按顺序检查：

1. 目标网站是否已经打开
2. 是否已经登录
3. 是否已经进入聊天页
4. 是否刷新过该页面
5. 是否同平台开了多个标签页

### 发送失败

优先检查：

1. AI 网页里的输入框和发送按钮是否真的可用
2. 是否存在同平台多个标签页
3. 刷新 AI 页面
4. 刷新扩展

## 发布

仓库已经支持自动打 Release 包。

发布流程：

1. 更新 `AI-CrossTalk/manifest.json` 版本号
2. 如有需要，同步更新 `web/package.json`
3. 提交代码
4. 推送 tag，例如：

```bash
git tag v1.0.2
git push origin v1.0.2
```

GitHub Actions 会自动：

1. 构建前端
2. 生成发布目录
3. 打包 `g4-ai-extension-vX.Y.Z.zip`
4. 上传到 GitHub Release

相关文件：

- `.github/workflows/release-extension.yml`
- `scripts/prepare-release.mjs`

## 开发

只有开发者才需要本地命令：

```bash
git clone https://github.com/qianzhu18/G4-AI.git
cd G4-AI/AI-CrossTalk
cd web
npm install
npm run build
```

开发模式：

```bash
cd web
npm run dev
```

## 开源协议

MIT
