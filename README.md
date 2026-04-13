<p align="center">
  <img src="public/icons/logo.png" width="120" height="120" alt="Fuzzy Translate">
</p>

<h1 align="center">Fuzzy Translate</h1>

<p align="center">
  <strong>Chrome 沉浸式翻译扩展 — 使用你自己的 AI 模型翻译任意网页</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Chrome-Manifest_V3-blue?logo=googlechrome" alt="Manifest V3">
  <img src="https://img.shields.io/badge/TypeScript-5.0+-blue?logo=typescript" alt="TypeScript">
  <img src="https://img.shields.io/badge/Vite-8-646CFF?logo=vite" alt="Vite">
  <img src="https://img.shields.io/badge/License-MIT-green" alt="MIT License">
</p>

---

Fuzzy Translate 是一个 Chrome 浏览器扩展，让你使用自己的 AI 模型 API（OpenAI、DeepSeek、Moonshot、Ollama 等）对网页内容进行沉浸式翻译。翻译内容直接显示在原文下方，保持原始排版样式，支持流式输出和本地缓存。

## 特性

- **全文翻译** — 点击悬浮球或按 `Alt+T`，可见区域段落即时翻译，滚动时自动翻译新内容
- **划词翻译** — 选中文字后点击翻译图标，弹窗显示译文
- **悬浮翻译** — 按住快捷键（默认 Ctrl）悬停段落，即时翻译
- **悬浮球** — 可拖拽的浮动菜单，快速触发全文翻译 / 清除缓存 / 打开设置
- **流式输出** — 译文逐字出现，无需等待完整返回
- **本地缓存** — 翻译结果按段落 hash 缓存到 IndexedDB，重复访问直接显示
- **多服务商** — Provider + Model 两级配置，一个服务商下管理多个模型，快速切换
- **自定义 Prompt** — 可配置 System Prompt、User Prompt、批量翻译 Prompt
- **智能过滤** — 自动识别页面主体内容，跳过导航栏、侧边栏、广告、代码块等
- **SPA 支持** — 单页应用导航时自动清理并重置翻译状态

## 兼容的 API 服务

所有兼容 OpenAI Chat Completions API 格式的服务均可使用：

| 服务商 | 说明 |
|--------|------|
| [OpenAI](https://platform.openai.com/) | GPT-4o、GPT-4o-mini 等 |
| [DeepSeek](https://platform.deepseek.com/) | DeepSeek-V3、DeepSeek-R1 等 |
| [月之暗面](https://platform.moonshot.cn/) | Moonshot-v1 |
| [硅基流动](https://siliconflow.cn/) | 多模型聚合平台 |
| [Ollama](https://ollama.com/) | 本地部署，完全离线 |
| 其他 | 任何兼容 OpenAI 格式的服务 |

## 快速开始

### 环境要求

- [Node.js](https://nodejs.org/) >= 18
- Chrome >= 116

### 构建

```bash
git clone https://github.com/your-username/fuzzy-translate.git
cd fuzzy-translate
npm install
npm run build
```

### 安装到 Chrome

1. 打开 `chrome://extensions/`
2. 开启右上角「开发者模式」
3. 点击「加载已解压的扩展程序」，选择 `dist/` 目录
4. 工具栏出现 Fuzzy Translate 图标即安装成功

### 开发模式

```bash
npm run dev
```

首次仍需在 Chrome 中加载 `dist/` 目录，之后代码修改会通过 Vite HMR 自动生效。

## 配置

首次使用需配置 API 服务商：

1. 点击扩展图标 → 「设置」，或悬浮球 → ⚙️
2. 添加服务商：填写名称、API Endpoint、API Key
3. 在服务商下添加模型名称（如 `gpt-4o-mini`、`deepseek-chat`）
4. 点击模型标签切换当前使用的模型

> API Key 仅存储在本机（`chrome.storage.local`），不会同步到 Google 云端。

## 使用方式

| 功能 | 操作 |
|------|------|
| 全文翻译 | 悬浮球 → 🌐，或按 `Alt+T` |
| 停止翻译 | 悬浮球 → ⏹ |
| 划词翻译 | 选中文字 → 点击 🌐 图标 |
| 悬浮翻译 | 按住 Ctrl（可自定义）+ 鼠标悬停段落 |
| 清除缓存 | 悬浮球 → 🧹 |
| 设置 | 悬浮球 → ⚙️ |

## 项目结构

```
src/
├── background/              # Service Worker
│   ├── sw.ts                # 入口：消息路由、快捷键、定时任务
│   ├── translate-handler.ts # 翻译请求处理（流式 Port 通信）
│   └── cache/               # IndexedDB 缓存（hash + 过期管理）
├── content/                 # Content Script
│   ├── index.ts             # 入口：模式初始化、SPA 导航检测
│   ├── modes/
│   │   ├── full-page.ts     # 全文翻译（IntersectionObserver 按需翻译）
│   │   ├── selection.ts     # 划词翻译（选中 → 图标 → 弹窗）
│   │   └── hover.ts         # 悬浮翻译（快捷键 + 悬停触发）
│   └── dom/
│       ├── paragraph-extractor.ts  # 智能段落提取（主体内容识别）
│       ├── translation-injector.ts # 译文注入 + 生命周期状态
│       ├── selection-popup.ts      # 划词弹窗（Shadow DOM 隔离）
│       └── floating-ball.ts        # 悬浮球（Shadow DOM + 拖拽 + 环形菜单）
├── popup/                   # Popup 面板
├── options/                 # 设置页面（Provider/Model 两级管理）
└── shared/
    ├── api/client.ts        # OpenAI 兼容 API 客户端（SSE 流式 + thinking 过滤）
    ├── config/storage.ts    # 分层存储（local 存密钥，sync 存偏好）
    ├── i18n/language-detect.ts  # 语言检测
    ├── messaging.ts         # Chrome 消息类型
    └── types.ts             # 全局类型定义
```

## 技术栈

- **TypeScript** — 类型安全
- **Vite** + **@crxjs/vite-plugin** — 构建 + HMR 开发体验
- **Chrome Extension Manifest V3** — Service Worker 架构
- **IndexedDB** — 翻译缓存（突破 chrome.storage.local 10MB 限制）
- **Web Crypto API** — SHA-256 段落哈希（零依赖）
- **Shadow DOM** — 划词弹窗和悬浮球的样式隔离
- **IntersectionObserver** — 按需翻译可见区域，节省 API 调用

## 设计要点

| 设计 | 说明 |
|------|------|
| 段落即原子 | 翻译、缓存、显示均以段落为最小单位 |
| 存储分层 | API 密钥 → `local`（不同步）；偏好 → `sync`（跨设备） |
| SW 生命周期 | 每段落独立 Port 连接 + 25s 心跳保活，不惧 MV3 超时 |
| 智能提取 | 优先 `<main>/<article>` 内的语义段落，跳过导航/广告/代码 |
| Thinking 过滤 | 4 层过滤（请求禁用 + Anthropic/DeepSeek/OpenAI 协议 + `<think>` 标签） |

## 许可证

[MIT](LICENSE)
