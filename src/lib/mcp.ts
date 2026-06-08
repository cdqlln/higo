/* Mock MCP server implementations.
 *
 * In production these tool names route to real Model Context Protocol servers
 * over stdio/SSE. Here we implement deterministic-but-realistic responses
 * locally so the Agent's tool-use loop works end-to-end without network
 * dependencies. The tool *interface* (name + input + output shape) is the
 * same one a real MCP server would expose.
 */

type ToolHandler = (args: Record<string, unknown>) => Promise<unknown>;

const HANDLERS: Record<string, ToolHandler> = {
  "mcp.admin_penalty.search": async (args) => {
    const company = String(args.company ?? "");
    await delay(420);
    return {
      query: company,
      count: 2,
      records: [
        {
          docNo: "深环法罚字〔2025〕XX号",
          date: "2025-03-14",
          authority: "深圳市生态环境局",
          entity: company.includes("海纳") ? "海纳半导体有限公司" : `${company}子公司`,
          relation: "全资子公司",
          cause: "未按规定处置危险废物",
          result: "罚款 ¥48 万,责令整改",
          url: "https://samr.gov.cn/case/2025/sz-eco-0314",
        },
        {
          docNo: "深市监罚字〔2024〕XX号",
          date: "2024-08-02",
          authority: "深圳市市场监督管理局",
          entity: company,
          relation: "本公司",
          cause: "广告宣传含未经审核内容",
          result: "罚款 ¥3.2 万",
          url: "https://samr.gov.cn/case/2024/sz-mr-0802",
        },
      ],
    };
  },

  "mcp.pkulaw.lookup_statute": async (args) => {
    const statute = String(args.statute ?? "");
    const article = String(args.article ?? "");
    await delay(280);
    const examples: Record<string, string> = {
      "公司法|第一百一十五条":
        "公司不得直接或者通过子公司向董事、监事、高级管理人员提供借款。违反前款规定提供借款的,有关董事、监事、高级管理人员应当将所借款项归还公司,给公司造成损失的,应当承担赔偿责任。",
      "民法典|第五百零九条":
        "当事人应当按照约定全面履行自己的义务。当事人应当遵循诚信原则,根据合同的性质、目的和交易习惯履行通知、协助、保密等义务……",
    };
    const key = `${statute}|${article}`;
    return {
      statute,
      article,
      effectiveDate: "2024-07-01",
      text:
        examples[key] ??
        `[${statute}${article}] 法律条文检索完成。该条款规范了相应法律关系,具体内容请参阅法宝原文。`,
      source: "北大法宝",
      url: `https://pkulaw.com/lawid/${encodeURIComponent(statute)}/${encodeURIComponent(article)}`,
    };
  },

  "mcp.samr.lookup_entity": async (args) => {
    const query = String(args.query ?? "");
    await delay(360);
    return {
      query,
      entity: {
        name: query || "深圳市海纳光电股份有限公司",
        uscc: "91440300MA5XXXXXX",
        type: "股份有限公司",
        legalRep: "张××",
        registeredCapital: "8,000 万元",
        establishedAt: "2014-07-21",
        status: "存续",
        scope: "光电设备研发、生产、销售;货物及技术进出口。",
        shareholders: [
          { name: "张××", ratio: 0.38 },
          { name: "深圳市启明创投合伙企业(有限合伙)", ratio: 0.22 },
          { name: "员工持股平台", ratio: 0.12 },
        ],
        subsidiaries: ["海纳半导体有限公司", "海纳精密(东莞)有限公司"],
      },
    };
  },

  "mcp.wkinfo.search_cases": async (args) => {
    const keywords = String(args.keywords ?? "");
    await delay(500);
    return {
      query: keywords,
      total: 7,
      cases: [
        {
          docNo: "(2024)最高法民申XXX号",
          court: "最高人民法院",
          year: 2024,
          summary:
            "目标公司在尽职调查中未如实披露关联方资金占用,投资人主张解除股权转让协议并要求返还投资款,法院支持解除主张。",
          relevance: 0.91,
        },
        {
          docNo: "(2023)粤民终XXX号",
          court: "广东省高级人民法院",
          year: 2023,
          summary:
            "对赌条款与新一轮投资人优先清算权冲突,目标公司未在交割前完成解除,法院认定违约。",
          relevance: 0.84,
        },
      ],
    };
  },

  "skill.contract_review": async (args) => {
    const text = String(args.text ?? "");
    await delay(700);
    return {
      issues: [
        {
          severity: "high",
          clause: "第 4.2 条 · 排他性条款",
          issue: "排他范围未限定地域,可能违反《反垄断法》关于纵向垄断协议之规定。",
          suggestion: "增加地域限定:'限于中华人民共和国境内(不含港澳台)'。",
        },
        {
          severity: "mid",
          clause: "第 7.1 条 · 违约责任",
          issue: "违约金条款仅约定固定金额,未约定上限,可能被认定过高而调整。",
          suggestion: "增加'但以不超过实际损失之 30%' 等条款。",
        },
      ],
      reviewedAt: new Date().toISOString(),
      lengthChars: text.length,
    };
  },

  "skill.sanitize": async (args) => {
    const text = String(args.text ?? "");
    await delay(220);
    let sanitized = text;
    const map: Record<string, string> = {};
    sanitized = sanitized.replace(/[一-鿿]{2,4}(?:律师|总|经理|董事)/g, (m) => {
      const k = `<PERSON_${Object.keys(map).length + 1}>`;
      map[k] = m;
      return k;
    });
    sanitized = sanitized.replace(/¥[\d,\.]+\s?(?:万|亿)?/g, (m) => {
      const k = `<AMOUNT_${Object.keys(map).length + 1}>`;
      map[k] = m;
      return k;
    });
    return { sanitized, mapping: map };
  },

  "skill.browser_fetch": async (args) => {
    const url = String(args.url ?? "");
    await delay(900);
    return {
      url,
      title: `Fetched: ${url}`,
      text: `[模拟环境] 已抓取 ${url} 的主体内容,长度 ~4 KB。生产环境会返回真实 DOM 文本与截图路径。`,
      capturedAt: new Date().toISOString(),
    };
  },
};

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function callTool(
  name: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  const handler = HANDLERS[name];
  if (!handler) {
    return { error: `tool ${name} not registered in local MCP runtime` };
  }
  return handler(args);
}

import { SKILL_CATALOG } from "./skills";

export function listAvailableTools(installedSkillIds: string[]) {
  /* Mirror Claude tool_use shape (Anthropic Messages API) */
  const tools: { name: string; description: string; input_schema: object }[] = [];
  for (const s of SKILL_CATALOG) {
    if (!installedSkillIds.includes(s.id)) continue;
    if (!s.exposes) continue;
    for (const e of s.exposes) {
      tools.push({ name: e.name, description: e.description, input_schema: e.inputSchema });
    }
  }
  return tools;
}

export function describeTool(name: string): string | undefined {
  for (const s of SKILL_CATALOG) {
    if (!s.exposes) continue;
    const hit = s.exposes.find((e) => e.name === name);
    if (hit) return s.name;
  }
  return undefined;
}
