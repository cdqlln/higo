/* Initial demo data — loaded on first run so the app feels populated. */

import type {
  ClipboardItem,
  Project,
  SettingsState,
  SnippetItem,
  TreeNode,
  VariableItem,
} from "../types";
import { uid } from "../lib/id";

const now = Date.now;

function file(name: string, content = "", icon?: string): TreeNode {
  return { id: uid("f"), type: "file", name, content, icon, updatedAt: now() };
}
function folder(name: string, children: TreeNode[], open = true): TreeNode {
  return {
    id: uid("d"),
    type: "folder",
    name,
    children,
    open,
    updatedAt: now(),
  };
}

const DD_REPORT_HTML = `
<h1>深圳市海纳光电股份有限公司</h1>
<h2 class="doc-subtitle">法律尽职调查报告(初稿)</h2>
<p class="doc-meta">编号:KW-2026-DD-0517 · 经办律师:陈律师、王律师 · 二〇二六年五月二十二日</p>
<h3>一、调查概述</h3>
<p>受 <mark>深圳创新投资集团有限公司</mark>(以下简称"<b>委托方</b>")委托,本所就其拟收购深圳市海纳光电股份有限公司(以下简称"<b>目标公司</b>")<span style="color:#8a5a0a;font-weight:600;">不超过 60%</span> 股权事宜,对目标公司进行法律尽职调查,并出具本报告。</p>
<p>本所律师于二〇二六年四月十五日至五月十八日期间,依据《中华人民共和国公司法》《中华人民共和国证券法》<sup class="cite">[1]</sup> 及其他相关法律法规,对目标公司的设立与存续、股权结构、重大资产、重大合同、对外担保、诉讼仲裁等事项进行了调查。</p>
<h3>二、目标公司基本情况</h3>
<table>
  <tbody>
    <tr><th>项目</th><th>内容</th></tr>
    <tr><td>公司名称</td><td>深圳市海纳光电股份有限公司</td></tr>
    <tr><td>统一社会信用代码</td><td>91440300MA5XXXXXX</td></tr>
    <tr><td>注册资本</td><td>人民币 8,000 万元</td></tr>
    <tr><td>法定代表人</td><td>张××</td></tr>
    <tr><td>成立日期</td><td>2014 年 7 月 21 日</td></tr>
  </tbody>
</table>
<h3>三、重大法律风险提示</h3>
<p><b>风险 1(高)</b>——关联方资金占用:经核查 2024 年度审计报告,目标公司向其控股股东实际控制人 <mark>提供资金 ¥3,200 万</mark>,占其净资产 12.4%,可能违反《公司法》第一百一十五条之规定。</p>
<p><b>风险 2(中)</b>——对赌条款冲突:目标公司与前轮投资人之 SPA 中存在对赌回购条款,与本次交易拟设之优先清算权存在冲突,建议在交割前完成解除或重组。</p>
<p><b>风险 3(中)</b>——知识产权权属:核心专利 ZL2019xxxxxx.x 之发明人之一在 2023 年离职,需获得其书面权属确认。</p>
<p>(本报告由 AI WorkDeck 协作完成,继续编辑可呼出右侧 Agent 自动补全。)</p>
`;

const SPA_HTML = `
<h1>股权转让协议(SPA · 草稿 v3)</h1>
<p class="doc-meta">本协议于二〇二六年五月二十二日由下列各方签订:</p>
<p><b>转让方:</b>张××(身份证号:XXXXXXXXXXXXXXXXXX)</p>
<p><b>受让方:</b>深圳创新投资集团有限公司</p>
<p><b>目标公司:</b>深圳市海纳光电股份有限公司</p>
<h3>第一条 · 标的</h3>
<p>转让方同意按本协议约定向受让方转让其所持有目标公司 <b>60%</b> 股权,对应认缴出资额人民币 <b>4,800 万元</b>。</p>
<h3>第二条 · 价款及支付</h3>
<p>本次股权转让价款总额为人民币 <b>__________</b> 元(大写:__________)。受让方应在交割日起 5 个工作日内将首期款 70% 汇入下列指定账户。</p>
<h3>第三条 · 陈述与保证</h3>
<p>转让方陈述并保证:(一) 目标公司合法存续……</p>
`;

function seedProjects(): Project[] {
  const p1: Project = {
    id: "proj-szci-haina",
    name: "深创投 × 海纳光电 · 并购尽调",
    client: "深圳创新投资集团",
    domain: "M&A",
    status: "active",
    progress: 0.42,
    milestones: { done: 5, total: 12 },
    agentTasks: 3,
    team: ["陈", "王", "李"],
    starred: true,
    mountedMcp: ["mcp-pkulaw", "mcp-wkinfo", "mcp-admin-penalty", "mcp-samr"],
    conversation: [],
    fileTree: [
      folder("01_交易文件", [
        file("尽职调查报告.docx", DD_REPORT_HTML, "📄"),
        file("SPA 草稿 v3.docx", SPA_HTML, "📑"),
        file("股东协议.docx", "<h1>股东协议</h1><p>(待起草)</p>", "📄"),
        file("风险评估矩阵.xlsx", "<h1>风险评估矩阵</h1><p>(占位)</p>", "📊"),
      ]),
      folder(
        "02_目标公司资料",
        [
          file("公司章程.pdf", "<h1>公司章程</h1>", "📕"),
          file("最近三年审计报告.pdf", "<h1>2023-2025 审计报告</h1>", "📕"),
          folder("重大合同", [
            file("主要客户合同 · 富士康.pdf", "<h1>合同</h1>", "📕"),
            file("主要客户合同 · 比亚迪.pdf", "<h1>合同</h1>", "📕"),
          ], false),
          folder("诉讼记录", [
            file("(2023)粤民初XXX号.pdf", "", "📕"),
          ], false),
        ],
        true,
      ),
      folder("03_监管沟通", [
        file("反垄断申报材料.docx", "<h1>反垄断申报</h1>"),
      ], false),
      folder("04_内部备忘录", [
        file("交易结构备忘.md", "# 交易结构备忘\n\n- 股权转让 + 后续增资\n- 标的:60%\n"),
      ], false),
      folder("05_AI Agent 工作产物", [
        file(
          "合同审阅_批注.json",
          "<pre>{\n  \"issues\": [\n    {\"severity\": \"high\", \"clause\": \"4.2\"}\n  ]\n}</pre>",
          "🤖",
        ),
        file("关联交易梳理.md", "# 关联交易梳理\n\n(待补充)", "🤖"),
      ]),
    ],
    openFileIds: [],
    activeFileId: null,
    createdAt: now() - 86400000 * 14,
    updatedAt: now() - 60 * 1000 * 3,
  };
  // ensure tabs reflect the first opened file
  const firstFile = (p1.fileTree[0].children?.[0] as TreeNode | undefined)?.id;
  if (firstFile) {
    p1.openFileIds = [
      firstFile,
      p1.fileTree[0].children![1].id,
      p1.fileTree[0].children![3].id,
    ];
    p1.activeFileId = firstFile;
  }

  const p2: Project = {
    id: "proj-kangye-admin",
    name: "某医药公司行政处罚听证",
    client: "康业医药股份",
    domain: "Administrative",
    status: "urgent",
    progress: 0.6,
    milestones: { done: 9, total: 15 },
    agentTasks: 7,
    team: ["陈", "张"],
    starred: false,
    mountedMcp: ["mcp-pkulaw", "mcp-admin-penalty"],
    conversation: [],
    fileTree: [
      folder("01_行政处罚决定书", [
        file("处罚决定书原件.pdf", "", "📕"),
      ]),
      folder("02_听证申请材料", [
        file("听证申请书.docx", "<h1>听证申请书</h1>"),
        file("代理意见.docx", "<h1>代理意见</h1>"),
      ]),
    ],
    openFileIds: [],
    activeFileId: null,
    createdAt: now() - 86400000 * 8,
    updatedAt: now() - 60 * 1000 * 60 * 5,
  };

  const p3: Project = {
    id: "proj-data-compliance",
    name: "跨境数据合规年度评审",
    client: "某互联网集团(欧盟业务)",
    domain: "Compliance",
    status: "draft",
    progress: 0.12,
    milestones: { done: 1, total: 8 },
    agentTasks: 2,
    team: ["陈"],
    starred: false,
    mountedMcp: ["mcp-pkulaw"],
    conversation: [],
    fileTree: [
      folder("01_合规评审", [
        file("评审清单.docx", "<h1>评审清单</h1>"),
      ]),
    ],
    openFileIds: [],
    activeFileId: null,
    createdAt: now() - 86400000 * 30,
    updatedAt: now() - 86400000,
  };

  const p4: Project = {
    id: "proj-siac",
    name: "SIAC 仲裁 · 申请人材料",
    client: "盈泰能源(新加坡)",
    domain: "Arbitration",
    status: "active",
    progress: 0.7,
    milestones: { done: 7, total: 10 },
    agentTasks: 4,
    team: ["陈", "林", "吴"],
    starred: true,
    mountedMcp: ["mcp-wkinfo"],
    conversation: [],
    fileTree: [
      folder("01_仲裁申请书", [
        file("申请书 v2.docx", "<h1>仲裁申请书</h1>"),
      ]),
    ],
    openFileIds: [],
    activeFileId: null,
    createdAt: now() - 86400000 * 60,
    updatedAt: now() - 86400000 * 3,
  };

  return [p1, p2, p3, p4];
}

function seedClipboard(): ClipboardItem[] {
  return [
    { id: uid("c"), text: "深圳市海纳光电股份有限公司", source: "尽职调查报告", createdAt: now() - 5 * 60000 },
    { id: uid("c"), text: "91440300MA5XXXXXX", source: "工商档案", createdAt: now() - 8 * 60000 },
    { id: uid("c"), text: "《公司法》第一百一十五条", source: "北大法宝", createdAt: now() - 12 * 60000 },
  ];
}

function seedSnippets(): SnippetItem[] {
  return [
    {
      id: uid("s"),
      name: "尽调开篇",
      shortcut: "/dd-intro",
      body:
        "受{{client_full_name}}(以下简称\"委托方\")委托,本所就其拟{{deal_type}}{{target_company}}事宜,出具本{{document_type}}。",
      updatedAt: now(),
    },
    {
      id: uid("s"),
      name: "法条引用",
      shortcut: "/cite",
      body: "依据《{{statute}}》第{{article}}之规定,",
      updatedAt: now(),
    },
    {
      id: uid("s"),
      name: "风险提示前缀",
      shortcut: "/risk",
      body: "**风险（{{level}}）——{{title}}：**",
      updatedAt: now(),
    },
  ];
}

function seedVariables(): VariableItem[] {
  return [
    { id: uid("v"), key: "client_full_name", value: "深圳创新投资集团有限公司" },
    { id: uid("v"), key: "target_company", value: "深圳市海纳光电股份有限公司" },
    { id: uid("v"), key: "deal_type", value: "收购" },
    { id: uid("v"), key: "document_type", value: "法律尽职调查报告" },
    { id: uid("v"), key: "lawyer_name", value: "陈律师" },
    { id: uid("v"), key: "firm_name", value: "King and Wood" },
  ];
}

function seedSettings(): SettingsState {
  return {
    apiKey: "",
    model: "claude-opus-4-7",
    agentName: "项目 Agent",
    agentTitle: "陈律师",
    sidebarCollapsed: false,
  };
}

function seedInstalled(): string[] {
  return [
    "contract-review-pro",
    "mcp-admin-penalty",
    "mcp-pkulaw",
    "mcp-samr",
    "mcp-wkinfo",
    "spa-drafter",
  ];
}

export const SEED = {
  projects: seedProjects,
  clipboard: seedClipboard,
  snippets: seedSnippets,
  variables: seedVariables,
  settings: seedSettings,
  installed: seedInstalled,
};
