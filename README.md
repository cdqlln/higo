AI WorkDeck · Prototype
=======================

法律行业 AI 工作基础设施 · One Deck for All

基于产品演示文稿构建的交互式 Web 原型,展示 AI WorkDeck 的四个核心场景:

- **启动 (Launch)** — 三步进入工作流的入口、最近项目、产品愿景
- **工作台 (Workspace)** — 律师个人工作台,按案件组织的活跃项目网格
- **项目 (Project)** — IDE 式集成环境:文件树 + Office 编辑器 + AI Agent + 日常必备
- **技能市场 (Marketplace)** — 插件、MCP 服务器、可复用 AI 技能

## 运行

直接在浏览器中打开 `index.html` 即可,无构建步骤。

```sh
python3 -m http.server 8000
# 然后访问 http://localhost:8000
```

## 文件结构

- `index.html` — 所有四个场景的单页面应用
- `styles.css` — 视觉系统(深色 + 法律金)
- `app.js` — 屏幕切换、文件树、Agent 对话等交互
