import { useEffect, useRef, useState } from "react";
import { useStore } from "../../store";
import { runAgent } from "../../lib/claude";
import { callTool, describeTool, listAvailableTools } from "../../lib/mcp";
import { skillById } from "../../lib/skills";
import { uid } from "../../lib/id";
import type { AgentMessage, Project, ToolCall } from "../../types";

const SLASH_COMMANDS = [
  { cmd: "/审阅", prompt: "请使用 skill.contract_review 审阅当前文档的合同部分,输出 issues 列表。" },
  { cmd: "/检索", prompt: "请检索目标公司的工商档案与行政处罚记录。" },
  { cmd: "/草拟", prompt: "请草拟一段法律风险提示,使用 /risk 片段格式。" },
  { cmd: "/翻译", prompt: "请将选中内容翻译为英文,保留条款编号与法律术语。" },
];

const SYSTEM_PROMPT = `你是 AI WorkDeck 中的"项目 Agent"——为律师服务的法律工作 AI。

工作准则:
- 使用书面汉语作答;术语精准、措辞严谨。
- 充分利用已挂载的 MCP 工具(如行政处罚库、北大法宝、SAMR、威科)。
- 输出结构化:先给结论,再给依据与引用;长内容用清单和小标题。
- 当用户需要写入文档时,在回复末尾用 HTML 输出供前端插入。`;

export default function Agent({ project }: { project: Project }) {
  const settings = useStore((s) => s.settings);
  const installed = useStore((s) => s.installedSkills);
  const appendMessage = useStore((s) => s.appendMessage);
  const updateMessage = useStore((s) => s.updateMessage);
  const upsertToolCall = useStore((s) => s.upsertToolCall);
  const clearConversation = useStore((s) => s.clearConversation);
  const pushToast = useStore((s) => s.pushToast);

  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const convEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll on conv change
  useEffect(() => {
    convEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [project.conversation.length, project.conversation[project.conversation.length - 1]?.toolCalls?.length]);

  // Listen for agent-prompt events from the Editor (AI 续写 / 改写 / 检索 buttons)
  useEffect(() => {
    function onPrompt(ev: Event) {
      const e = ev as CustomEvent<{ projectId: string; prompt: string }>;
      if (e.detail.projectId === project.id) {
        void send(e.detail.prompt);
      }
    }
    window.addEventListener("workdeck:agent-prompt", onPrompt as EventListener);
    return () =>
      window.removeEventListener("workdeck:agent-prompt", onPrompt as EventListener);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id, project.mountedMcp]);

  async function send(text: string) {
    if (!text.trim() || busy) return;
    setBusy(true);
    setInput("");

    const userMsg: AgentMessage = {
      id: uid("m"),
      role: "user",
      content: text.trim(),
      createdAt: Date.now(),
    };
    appendMessage(project.id, userMsg);

    const assistantMsg: AgentMessage = {
      id: uid("m"),
      role: "assistant",
      content: "",
      pending: true,
      toolCalls: [],
      createdAt: Date.now(),
    };
    appendMessage(project.id, assistantMsg);

    try {
      if (settings.apiKey.trim()) {
        await streamFromClaude(text.trim(), assistantMsg.id);
      } else {
        await streamFromDemo(text.trim(), assistantMsg.id);
      }
    } catch (e) {
      updateMessage(project.id, assistantMsg.id, {
        content:
          "❗ " + (e as Error).message + "\n\n(检查设置中的 API Key,或保持留空以使用演示模式)",
        pending: false,
      });
    } finally {
      setBusy(false);
    }
  }

  async function streamFromClaude(text: string, assistantId: string) {
    // Tools = only those exposed by skills installed AND mounted on this project
    const allowedMcp = installed.filter(
      (id) => project.mountedMcp.includes(id) || !id.startsWith("mcp-"),
    );
    const tools = listAvailableTools(allowedMcp);

    // Build conversation context from prior messages
    const messages = project.conversation
      .filter((m) => !m.pending && (m.role === "user" || m.role === "assistant"))
      .map((m) => ({
        role: m.role as "user" | "assistant",
        content: [{ type: "text" as const, text: m.content }],
      }));
    messages.push({ role: "user", content: [{ type: "text", text }] });

    let accumulated = "";
    for await (const ev of runAgent({
      apiKey: settings.apiKey,
      model: settings.model,
      system: SYSTEM_PROMPT,
      messages,
      tools,
    })) {
      if (ev.type === "text_delta") {
        accumulated += ev.text;
        updateMessage(project.id, assistantId, { content: accumulated });
      } else if (ev.type === "tool_use") {
        upsertToolCall(project.id, assistantId, {
          id: ev.toolUseId!,
          name: ev.toolName!,
          args: ev.toolInput ?? {},
          status: "running",
          label: describeTool(ev.toolName!) ?? ev.toolName!,
        });
      } else if (ev.type === "tool_result") {
        upsertToolCall(project.id, assistantId, {
          id: ev.toolUseId!,
          name: ev.toolName!,
          args: {},
          result: ev.toolResult,
          status: "done",
          ms: ev.toolMs,
          label: describeTool(ev.toolName!) ?? ev.toolName!,
        });
      } else if (ev.type === "message_stop") {
        updateMessage(project.id, assistantId, { pending: false });
      } else if (ev.type === "error") {
        updateMessage(project.id, assistantId, {
          content: "❗ " + ev.error,
          pending: false,
        });
      }
    }
  }

  /* Demo mode (no API key): structured scripted agent that still uses tools. */
  async function streamFromDemo(text: string, assistantId: string) {
    const lower = text.toLowerCase();
    const wantsPenalty = /处罚|penalty|admin/.test(lower) || /处罚/.test(text);
    const wantsStatute = /法条|条|公司法|法宝|statute/.test(text);
    const wantsEntity = /工商|samr|股东|档案/.test(text);
    const wantsReview = /审阅|review|审查/.test(text);
    const wantsRewrite = text.startsWith("请改写") || /改写/.test(text);
    const wantsContinue = /续写|继续|结尾/.test(text);

    const toolCalls: { name: string; args: Record<string, unknown> }[] = [];
    if (wantsPenalty)
      toolCalls.push({
        name: "mcp.admin_penalty.search",
        args: { company: "深圳市海纳光电", includeRelated: true, yearFrom: 2023, yearTo: 2026 },
      });
    if (wantsStatute)
      toolCalls.push({
        name: "mcp.pkulaw.lookup_statute",
        args: { statute: "公司法", article: "第一百一十五条" },
      });
    if (wantsEntity)
      toolCalls.push({ name: "mcp.samr.lookup_entity", args: { query: "深圳市海纳光电股份有限公司" } });
    if (wantsReview)
      toolCalls.push({ name: "skill.contract_review", args: { text: "合同片段(模拟)", jurisdiction: "PRC" } });

    let intro = "";
    let conclusion = "";
    let htmlForDoc: string | null = null;

    if (wantsPenalty) {
      intro = "正在检索行政处罚记录…";
      conclusion =
        '**检索完成。** 共发现 2 条记录(2025-03 子公司环保违规 ¥48 万;2024-08 本公司广告违规 ¥3.2 万),点击下方“插入到文档”按钮即可写入。';
      htmlForDoc =
        `<h3>三-补 · 行政处罚记录补充披露</h3>` +
        `<p>经检索全国市场监管行政处罚公示库,目标公司及其全资子公司在 2023–2026 期间存在以下行政处罚:</p>` +
        `<ul>` +
        `<li><b>2025-03-14 · 深圳市生态环境局</b> ——海纳半导体(全资子公司),未按规定处置危险废物,罚款 ¥48 万,责令整改。</li>` +
        `<li><b>2024-08-02 · 深圳市市场监督管理局</b> ——本公司,广告宣传含未经审核内容,罚款 ¥3.2 万。</li>` +
        `</ul>`;
    } else if (wantsStatute) {
      intro = "正在查阅北大法宝条款…";
      conclusion = "已附上《公司法》第一百一十五条全文与引用。";
    } else if (wantsEntity) {
      intro = "正在拉取 SAMR 工商档案…";
      conclusion = "已拉取目标公司基本信息与股东结构,详见上述工具结果。";
    } else if (wantsReview) {
      intro = "正在调用合同审阅技能…";
      conclusion = "审阅完成,2 条主要 issues:排他范围未限地域(高);违约金未限上限(中)。";
    } else if (wantsRewrite) {
      conclusion = `**改写结果:**\n\n${text.replace(/^请改写[^：:]*[：:]?\s*/, "")
        .split(/\n+/)
        .map((s) => "“" + s.trim() + "”——拟修订为:" + reword(s.trim()))
        .join("\n\n")}`;
    } else if (wantsContinue) {
      conclusion =
        "已基于上下文续写一段,可直接插入文档:";
      htmlForDoc =
        `<p>综上所述,本所建议委托方在交割前要求目标公司就上述风险事项提供书面承诺与连带责任安排,并在交易文件中设定专项赔偿条款,以充分保护委托方利益。</p>`;
    } else {
      conclusion =
        "已收到任务。在演示模式下,Agent 通过结构化模板与本地 MCP 模拟数据回应;在设置中填入 Anthropic API Key 后,将切换为真实 Claude 推理。";
    }

    // Show intro
    if (intro) {
      updateMessage(project.id, assistantId, { content: intro });
      await sleep(300);
    }
    // Execute tools sequentially with status updates
    for (const tc of toolCalls) {
      const id = uid("tc");
      upsertToolCall(project.id, assistantId, {
        id,
        name: tc.name,
        args: tc.args,
        status: "running",
        label: describeTool(tc.name) ?? tc.name,
      });
      const t0 = performance.now();
      const result = await callTool(tc.name, tc.args);
      const ms = Math.round(performance.now() - t0);
      upsertToolCall(project.id, assistantId, {
        id,
        name: tc.name,
        args: tc.args,
        result,
        status: "done",
        ms,
        label: describeTool(tc.name) ?? tc.name,
      });
    }
    updateMessage(project.id, assistantId, {
      content: conclusion + (htmlForDoc ? `\n\n[__INSERT_HTML__]${htmlForDoc}[__/INSERT_HTML__]` : ""),
      pending: false,
    });
  }

  function reword(s: string): string {
    if (!s) return "(无内容)";
    return s
      .replace(/我们/g, "本所")
      .replace(/会/g, "将")
      .replace(/(?:很|非常)/g, "")
      .replace(/。$/g, "。") + (s.endsWith("。") ? "" : "。");
  }

  function sleep(ms: number) {
    return new Promise((r) => setTimeout(r, ms));
  }

  function insertToDoc(html: string) {
    window.dispatchEvent(
      new CustomEvent("workdeck:insert", { detail: { projectId: project.id, html } }),
    );
    pushToast("已插入到文档", "ok");
  }

  return (
    <aside className="ide-agent">
      <div className="ag-header">
        <div className="ag-title">
          <div className="ag-avatar">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M12 2L2 7l10 5 10-5-10-5z" />
              <path d="M2 17l10 5 10-5" />
              <path d="M2 12l10 5 10-5" />
            </svg>
          </div>
          <div>
            <div className="ag-name">{settings.agentName}</div>
            <div className="ag-status">
              <span className="ag-dot" />
              {settings.apiKey ? "Claude · 在线" : "演示模式 · 离线"} · 已读取{" "}
              {countFiles(project.fileTree)} 文件
            </div>
          </div>
        </div>
        <button
          className="ag-collapse"
          title="清空对话"
          onClick={() => {
            if (confirm("清空当前项目的对话?")) clearConversation(project.id);
          }}
        >
          ⨯
        </button>
      </div>

      <div className="ag-context">
        <div className="ag-ctx-label">当前上下文</div>
        {project.activeFileId && (
          <div className="ag-ctx-row">
            <span className="ctx-tag">@文件</span>
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {findFileName(project.fileTree, project.activeFileId)}
            </span>
          </div>
        )}
        <div className="ag-ctx-row">
          <span className="ctx-tag">@MCP</span>
          <span>
            {project.mountedMcp.length === 0
              ? "(无)"
              : project.mountedMcp
                  .map((id) => skillById(id)?.name)
                  .filter(Boolean)
                  .join("、")}
          </span>
        </div>
      </div>

      <div className="ag-conv">
        {project.conversation.length === 0 && (
          <div className="ag-empty">
            <div className="ag-empty-title">开始一个新对话</div>
            <div className="ag-empty-sub">用 / 触发斜杠命令,或直接描述任务</div>
            <div className="ag-empty-grid">
              <button onClick={() => send("帮我核查海纳光电及其子公司在过去三年内的所有行政处罚记录,并补充到尽调报告的风险提示部分。")}>
                核查行政处罚
              </button>
              <button onClick={() => send("梳理目标公司前三大客户合同中的不利变更条款。")}>
                梳理合同条款
              </button>
              <button onClick={() => send("请使用 skill.contract_review 工具审阅当前文档的合同部分。")}>
                合同审阅 Pro
              </button>
              <button onClick={() => send("查《公司法》第一百一十五条全文。")}>
                查法条
              </button>
            </div>
          </div>
        )}

        {project.conversation.map((m) => (
          <Message
            key={m.id}
            m={m}
            onInsertHtml={(html) => insertToDoc(html)}
          />
        ))}
        <div ref={convEndRef} />
      </div>

      <div className="ag-input">
        <div className="ag-input-chips">
          {SLASH_COMMANDS.map((s) => (
            <button key={s.cmd} className="ag-chip" onClick={() => send(s.prompt)}>
              {s.cmd}
            </button>
          ))}
        </div>
        <div className="ag-input-box">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="向 Agent 描述任务,可 @文件、@MCP、@技能… (⏎ 发送 · ⇧⏎ 换行)"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send(input);
              }
            }}
            disabled={busy}
          />
          <div className="ag-input-foot">
            <div className="ag-input-meta">
              <span className="ag-model">
                {settings.apiKey ? `Claude · ${settings.model}` : "演示模式"}
              </span>
            </div>
            <button className="ag-send" onClick={() => send(input)} disabled={busy || !input.trim()}>
              {busy ? "运行中…" : "发送 ⏎"}
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
}

function Message({
  m,
  onInsertHtml,
}: {
  m: AgentMessage;
  onInsertHtml: (html: string) => void;
}) {
  // Extract [__INSERT_HTML__]...[__/INSERT_HTML__] payload for "insert to doc"
  const insertMatch = m.content.match(/\[__INSERT_HTML__\]([\s\S]+?)\[__\/INSERT_HTML__\]/);
  const visibleText = m.content.replace(/\[__INSERT_HTML__\][\s\S]+?\[__\/INSERT_HTML__\]/, "").trim();

  return (
    <div className={"ag-msg " + m.role}>
      <div className="ag-bubble">
        {m.role === "assistant" && m.toolCalls && m.toolCalls.length > 0 && (
          <div className="agent-plan">
            <div className="plan-head">
              <span className="plan-icon">⚙</span> 任务分解({m.toolCalls.length} 步)
            </div>
            <ol className="plan-list">
              {m.toolCalls.map((tc) => (
                <li key={tc.id} className={tc.status === "done" ? "done" : "running"}>
                  <span className={"step-dot" + (tc.status !== "done" ? " pulse" : "")} />
                  <span>
                    调用 <b>{tc.label}</b>{" "}
                    <code className="step-code">{tc.name}</code>
                  </span>
                  <span className="step-meta">
                    {tc.status === "done" ? `✓ ${tc.ms}ms` : "⏳"}
                  </span>
                </li>
              ))}
            </ol>
            {m.toolCalls.map((tc) => {
              if (tc.status !== "done" || !tc.result) return null;
              if (tc.name.startsWith("mcp.admin_penalty"))
                return <PenaltyCards key={tc.id + "-cards"} result={tc.result} onInsert={onInsertHtml} />;
              if (tc.name.startsWith("mcp.pkulaw"))
                return <StatuteCard key={tc.id + "-statute"} result={tc.result} />;
              if (tc.name.startsWith("mcp.samr"))
                return <EntityCard key={tc.id + "-entity"} result={tc.result} />;
              return null;
            })}
          </div>
        )}
        {visibleText && <div className="ag-text">{renderMarkdownLite(visibleText)}</div>}
        {insertMatch && (
          <div className="ag-insert-row">
            <button
              className="ag-insert-btn"
              onClick={() => onInsertHtml(insertMatch[1])}
            >
              插入到文档 ›
            </button>
            <span className="ag-insert-hint">将上述内容写入当前打开的文档</span>
          </div>
        )}
        {m.pending && !visibleText && (m.toolCalls?.length ?? 0) === 0 && (
          <div className="ag-typing">
            <span /> <span /> <span />
          </div>
        )}
      </div>
    </div>
  );
}

function PenaltyCards({
  result,
  onInsert,
}: {
  result: unknown;
  onInsert: (html: string) => void;
}) {
  const r = result as {
    records: { docNo: string; date: string; authority: string; entity: string; cause: string; result: string; relation: string }[];
  };
  return (
    <div>
      {r.records.map((rec, i) => (
        <div key={i} className="ag-card">
          <div className="ag-card-h">
            <span className="ag-card-tag tag-warn">行政处罚</span>
            <span className="ag-card-meta">{rec.date} · {rec.authority}</span>
          </div>
          <div className="ag-card-b">
            <b>当事人:</b>{rec.entity}({rec.relation})<br />
            <b>事由:</b>{rec.cause}<br />
            <b>结果:</b>{rec.result}<br />
            <b>文号:</b>{rec.docNo}
          </div>
          <div className="ag-card-f">
            <button
              className="card-link"
              onClick={() =>
                onInsert(
                  `<p><b>${rec.date} · ${rec.authority}</b> ——${rec.entity}(${rec.relation}),${rec.cause}。${rec.result}。文号:${rec.docNo}。</p>`,
                )
              }
            >
              插入到文档
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

function StatuteCard({ result }: { result: unknown }) {
  const r = result as { statute: string; article: string; text: string; source: string };
  return (
    <div className="ag-card">
      <div className="ag-card-h">
        <span className="ag-card-tag tag-info">法条</span>
        <span className="ag-card-meta">{r.source}</span>
      </div>
      <div className="ag-card-b">
        <b>《{r.statute}》{r.article}</b>
        <br />
        {r.text}
      </div>
    </div>
  );
}

function EntityCard({ result }: { result: unknown }) {
  const r = result as {
    entity: { name: string; uscc: string; legalRep: string; registeredCapital: string; shareholders: { name: string; ratio: number }[] };
  };
  return (
    <div className="ag-card">
      <div className="ag-card-h">
        <span className="ag-card-tag tag-info">工商档案</span>
        <span className="ag-card-meta">SAMR</span>
      </div>
      <div className="ag-card-b">
        <b>{r.entity.name}</b>
        <br />
        统一社会信用代码:{r.entity.uscc}
        <br />
        法定代表人:{r.entity.legalRep} · 注册资本:{r.entity.registeredCapital}
        <br />
        <b>主要股东:</b>
        <ul style={{ margin: "4px 0 0 16px", paddingLeft: 0 }}>
          {r.entity.shareholders.map((s, i) => (
            <li key={i}>
              {s.name} ({(s.ratio * 100).toFixed(1)}%)
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function renderMarkdownLite(text: string): React.ReactNode {
  // Render **bold**, * bullets, line breaks; defense-only — no HTML injection
  return text.split(/\n+/).map((line, i) => {
    const parts = line.split(/(\*\*[^*]+\*\*)/g).map((p, j) => {
      if (p.startsWith("**") && p.endsWith("**")) {
        return <b key={j}>{p.slice(2, -2)}</b>;
      }
      return <span key={j}>{p}</span>;
    });
    if (line.startsWith("- ") || line.startsWith("* ")) {
      return (
        <div key={i} style={{ paddingLeft: 12 }}>
          • {parts}
        </div>
      );
    }
    return <p key={i} style={{ margin: "4px 0" }}>{parts}</p>;
  });
}

function findFileName(tree: import("../../types").TreeNode[], id: string): string {
  for (const n of tree) {
    if (n.id === id) return n.name;
    if (n.children) {
      const r = findFileName(n.children, id);
      if (r) return r;
    }
  }
  return "(已关闭)";
}

function countFiles(tree: import("../../types").TreeNode[]): number {
  let n = 0;
  function walk(ns: import("../../types").TreeNode[]) {
    for (const node of ns) {
      if (node.type === "file") n++;
      if (node.children) walk(node.children);
    }
  }
  walk(tree);
  return n;
}
