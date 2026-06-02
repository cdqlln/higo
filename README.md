AI WorkDeck
===========

法律行业 AI 工作基础设施 · One Deck for All

基于 PDF 产品演示文稿构建的完整 Web 应用,实现 AI WorkDeck 的全部核心场景。

## 技术栈

- **React 19** + **TypeScript** + **Vite 7**
- **Zustand** + **localStorage 持久化**
- **React Router 7**
- **Claude API**(直接浏览器 fetch,可选)
- 无后端依赖,全部数据保存在浏览器本地

## 功能清单

### 启动 · Launch
- 品牌主张 + 最近项目(从真实数据派生)
- 一键创建新项目 / 打开最近项目 / 浏览市场
- 三步进入工作流的视觉说明

### 工作台 · Workspace
- **项目 CRUD** —— 创建(带模态框)、删除、收藏、状态过滤
- 按状态/业务领域筛选
- 关键词全文搜索(项目名 + 客户)

### 项目 IDE · Project
真正可用的集成工作环境:

- **文件树**
  - 文件夹展开/折叠(持久)
  - 右键菜单:新建文件 / 新建子文件夹 / 重命名 / 删除
  - 实时搜索(过滤 + 自动展开匹配项)
  - 已挂载 MCP 切换(每项目独立)
- **多 Tab 编辑器**
  - `contenteditable` 富文本 + execCommand 工具栏(粗体/斜体/下划线/列表/高亮/标题等)
  - 自动保存(600ms debounce)+ 状态指示
  - 切 Tab 不丢内容
- **AI Agent**
  - 真实 Claude API 集成(填入 Key 即用,设置中可测试连通)
  - 无 Key 时降级为结构化演示模式——仍调用本地 MCP,展示完整 tool-use UX
  - 任务分解、工具调用追踪、结果卡片(行政处罚 / 法条 / 工商档案)
  - 「插入到文档」直接写入当前 Tab
  - 斜杠命令(/审阅 /检索 /草拟 /翻译)
  - 对话持久化(每项目独立)
- **日常必备** (Daily Essentials)
  - 剪贴板历史(20 条上限,点击插入)
  - 变量管理({{key}} 即时编辑)
  - 片段管理(带快捷键)
  - 全部持久化、跨项目可用

### 技能市场 · Marketplace
- 14 项目录技能 + 4 个 MCP 服务器
- 按类型 / 来源筛选 + 全文搜索 + 三种排序
- 一键安装 / 卸载(状态持久)
- 卸载 MCP 时自动从所有项目摘除挂载

### MCP / 工具调用
本地实现 6 个 MCP 工具,接口与 Anthropic tool_use 完全一致:

- `mcp.admin_penalty.search` — 行政处罚库检索
- `mcp.pkulaw.lookup_statute` — 北大法宝法条查询
- `mcp.samr.lookup_entity` — SAMR 工商档案
- `mcp.wkinfo.search_cases` — 威科类案检索
- `skill.contract_review` — 合同审阅
- `skill.sanitize` — 数据脱敏
- `skill.browser_fetch` — 浏览器自动化

生产环境中只需把 `lib/mcp.ts` 的 handler 替换为真实 MCP server stdio/SSE 调用即可。

### 设置 · Settings
- API Key + 模型选择 + 连通测试
- 个性化(显示名 / Agent 名)
- 重置为演示数据(开发/演示用)

### 全局
- **⌘K 命令面板** —— 跨项目搜索、跳转、复制片段、导出状态
- Toast 反馈
- 全部状态持久化到 `localStorage` 键 `workdeck-v1`

## 运行

```sh
npm install
npm run dev          # 开发,http://localhost:5173
npm run build        # 生产构建 → dist/
npm run typecheck    # 仅类型检查
```

## 目录结构

```
src/
├── main.tsx                  # 入口
├── App.tsx                   # 路由 + 全局 shell
├── types.ts                  # 全部 domain 类型
├── styles.css                # 视觉系统(深色 + 法律金)
├── store/
│   ├── index.ts              # Zustand store + persist + 全部 actions
│   └── seed.ts               # 初始演示数据
├── lib/
│   ├── claude.ts             # Claude API + tool-use 多轮循环
│   ├── mcp.ts                # 本地 MCP 实现(可替换为远程)
│   ├── skills.ts             # 技能目录
│   └── id.ts                 # uid 生成
├── components/
│   ├── TopNav.tsx
│   ├── CommandPalette.tsx
│   └── Toast.tsx
└── screens/
    ├── Launch.tsx
    ├── Workspace.tsx
    ├── Marketplace.tsx
    ├── Settings.tsx
    └── Project/
        ├── index.tsx         # 三栏布局
        ├── FileTree.tsx
        ├── Editor.tsx
        ├── Agent.tsx
        └── Essentials.tsx
```

## Agent 模式

默认进入"演示模式",通过本地 MCP 数据 + 脚本化回答演示完整工作流(检索 → 工具调用 → 结果卡片 → 插入文档)。

在 **设置 → Claude API** 中填入 `sk-ant-...` 后,Agent 切换为真实 Claude 推理,通过 `tool_use` 协议自动选择工具,执行多轮工具调用循环。MCP handler 在本地执行,但 API 形状与生产 Anthropic SDK 完全一致。

## 数据持久化

所有状态实时写入 `localStorage`,键为 `workdeck-v1`。命令面板支持「复制 localStorage 状态」用于备份。设置页提供「重置为演示数据」。

## 局限(明确说明)

- 真实 MCP server 通过 stdio/SSE 协议;本应用在浏览器中实现 handler 演示行为,接口一致但未联网。
- 没有真正的协作/多用户;实际产品需要后端。
- 编辑器是简化富文本(contenteditable),非完整 Office 套件级别。
