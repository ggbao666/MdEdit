<p align="center">
  <img src="src/assets/mdedit-icon.svg" width="112" height="112" alt="MdEdit 图标" />
</p>

<h1 align="center">MdEdit</h1>

<p align="center">
  简洁、专注、本地优先的 Windows Markdown 桌面编辑器。
</p>

<p align="center">
  <img src="https://img.shields.io/badge/version-1.0.0-50545A" alt="版本 1.0.0" />
  <img src="https://img.shields.io/badge/platform-Windows-0078D4?logo=windows" alt="Windows" />
  <img src="https://img.shields.io/badge/Electron-44-47848F?logo=electron" alt="Electron 44" />
  <img src="https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=20232A" alt="React 19" />
  <img src="https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white" alt="TypeScript 5" />
</p>

MdEdit 使用 Tiptap 提供所见即所得的编辑体验，同时始终以标准 Markdown 文件作为主要存储格式。文档保存在你选择的本地目录中，不依赖云端账户，也不会把内容锁在专有格式里。

## 功能特性

- **本地 Markdown 工作区**：直接打开本地目录，递归读取其中的 Markdown 文档。
- **多目录管理**：可同时挂载多个目录，并在侧栏中按目录和子文件夹分组浏览。
- **完整编辑能力**：支持标题、粗体、斜体、下划线、删除线、高亮、链接、列表、待办事项、引用、代码块、表格和分割线。
- **斜杠命令**：输入 `/` 快速插入标题、列表、代码块、表格等内容。
- **文档操作**：支持搜索、拖拽排序、重命名、创建副本、新建文件夹和带确认提示的永久删除。
- **导入与导出**：可导入 Markdown、纯文本和 ZIP，支持导出当前文档、指定目录或全部文档。
- **图片处理**：支持粘贴和拖入图片，可选择相对路径资源目录或 Base64 内联存储。
- **自动保存**：可启用自动保存并自定义延迟；未落盘文档会保留临时草稿。
- **大纲与统计**：提供标题大纲、字数、字符数和预计阅读时间。
- **主题系统**：内置清新亮色、青墨深色和极简深色主题，也可通过 CSS 添加自定义主题。
- **专注模式**：可隐藏侧栏和辅助界面，减少写作干扰。

## 开始使用

### 环境要求

- Windows 10 或更高版本
- Node.js 20.19+ 或 22.12+
- npm

### 从源码运行

克隆仓库后，在项目目录执行：

```bash
npm ci
npm run dev:all
```

`dev:all` 会同时启动 Vite 开发服务器和 Electron 桌面窗口。

### 构建应用

```bash
# 生成 Windows 安装程序
npm run electron:installer

# 生成 Windows 便携版
npm run electron:portable

# 生成未打包目录，便于本地检查
npm run electron:unpacked
```

构建结果位于 `release/` 目录。

## 常用操作

1. 启动 MdEdit，选择一个包含 Markdown 文件的目录，或新建空白文档。
2. 在侧栏中切换文档；右键目录可新建、导入、导出或在文件管理器中打开。
3. 双击文档标题可重命名，拖拽条目可调整同一目录内的显示顺序。
4. 文档标题与文件名保持同步，保存时会写回对应的 `.md` 文件。
5. 删除磁盘文档前会显示确认弹窗；确认后文件将被永久删除。

## 快捷键

| 操作 | Windows / Linux | macOS |
| --- | --- | --- |
| 保存文档 | `Ctrl + S` | `⌘ + S` |
| 打开工作区目录 | `Ctrl + O` | `⌘ + O` |
| 打开 Markdown 文件 | `Ctrl + Shift + O` | `⌘ + Shift + O` |
| 新建文档 | `Ctrl + Alt + N` | `⌘ + Alt + N` |
| 折叠或展开侧栏 | `Ctrl + \` | `⌘ + \` |
| 打开设置 | `Ctrl + ,` | `⌘ + ,` |
| 打开快捷键面板 | `Ctrl + /` | `⌘ + /` |
| 加粗 / 斜体 / 下划线 | `Ctrl + B / I / U` | `⌘ + B / I / U` |

应用内的快捷键面板包含完整列表，包括块级格式、Markdown 输入规则和斜杠命令操作。

## 图片存储

MdEdit 提供两种图片存储方式：

### 原图与相对路径

图片按原格式写入资源目录，Markdown 中保存相对路径。默认目录模板为 `{name}.assets`，其中 `{name}` 会替换为当前文档名。

```text
示例文档.md
示例文档.assets/截图.png
```

```markdown
![截图](示例文档.assets/截图.png)
```

### Base64 内联

图片直接写入 Markdown，单个文件即可携带全部内容，适合传输，但会明显增加文档体积。

## 自定义主题

在 `src/themes/` 中新增 CSS 文件即可注册主题，无需修改 TypeScript 配置。主题需要提供名称、外观模式和说明等元信息。

详细方式请参阅 [主题开发说明](src/themes/README.md)。

## 可用命令

| 命令 | 说明 |
| --- | --- |
| `npm run dev` | 仅启动 Vite 开发服务器 |
| `npm run dev:all` | 启动 Vite 与 Electron |
| `npm run typecheck` | 执行 TypeScript 类型检查 |
| `npm run build` | 类型检查并构建前端资源 |
| `npm run check:md` | 检查 Markdown 序列化结果 |
| `npm run electron:compile` | 编译 Electron 主进程与预加载脚本 |
| `npm run electron:installer` | 构建 Windows NSIS 安装程序 |
| `npm run electron:portable` | 构建 Windows 便携版 |
| `npm run electron:dist` | 构建配置中的全部 Windows 发布目标 |

## 项目结构

```text
.
├─ build/                 # Windows 应用图标
├─ electron/              # Electron 主进程、IPC 与预加载脚本
├─ scripts/               # 开发、构建和图标生成脚本
├─ src/
│  ├─ assets/             # SVG 图标等静态资源
│  ├─ components/         # 编辑器界面组件
│  ├─ config/             # 应用信息与主题注册
│  ├─ editor/             # Tiptap 扩展和编辑交互
│  ├─ lib/                # Markdown、工作区、资源与 ZIP 逻辑
│  ├─ styles/             # 全局与编辑器样式
│  └─ themes/             # 内置及自定义主题
├─ package.json
└─ vite.config.ts
```

## 技术栈

- [Electron](https://www.electronjs.org/) — 桌面运行环境
- [React](https://react.dev/) — 用户界面
- [Tiptap](https://tiptap.dev/) — 富文本编辑器核心
- [TypeScript](https://www.typescriptlang.org/) — 类型系统
- [Vite](https://vite.dev/) — 开发与构建工具
- [marked](https://marked.js.org/) 与 [Turndown](https://github.com/mixmark-io/turndown) — Markdown 转换
- [fflate](https://github.com/101arrowz/fflate) — ZIP 导入与导出
- [highlight.js](https://highlightjs.org/) — 代码语法高亮

## 数据说明

- 正式文档和图片保存在用户选择的工作区目录中。
- 未保存草稿位于系统临时目录下的 `MdEdit/drafts`。
- 工作区列表保存在 Electron 的用户数据目录中。
- 主题、自动保存、图片模式和文档排序等偏好保存在本地浏览器存储中。

---

<p align="center">用 MdEdit，专注写作，保留纯粹的 Markdown。</p>
