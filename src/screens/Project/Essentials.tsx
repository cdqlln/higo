import { useState } from "react";
import { useStore } from "../../store";

type Tab = "clipboard" | "variables" | "snippets" | "bookmarks";

function formatRel(ts: number): string {
  const m = Math.floor((Date.now() - ts) / 60000);
  if (m < 1) return "刚刚";
  if (m < 60) return `${m} 分钟前`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} 小时前`;
  return `${Math.floor(h / 24)} 天前`;
}

export default function Essentials() {
  const clipboard = useStore((s) => s.clipboard);
  const variables = useStore((s) => s.variables);
  const snippets = useStore((s) => s.snippets);
  const removeClip = useStore((s) => s.removeClip);
  const addVariable = useStore((s) => s.addVariable);
  const updateVariable = useStore((s) => s.updateVariable);
  const removeVariable = useStore((s) => s.removeVariable);
  const addSnippet = useStore((s) => s.addSnippet);
  const removeSnippet = useStore((s) => s.removeSnippet);
  const pushToast = useStore((s) => s.pushToast);

  const [tab, setTab] = useState<Tab>("clipboard");
  const [varEdit, setVarEdit] = useState<{ key: string; value: string }>({ key: "", value: "" });
  const [snipEdit, setSnipEdit] = useState<{ name: string; body: string; shortcut: string }>({
    name: "",
    body: "",
    shortcut: "",
  });

  function paste(text: string) {
    window.dispatchEvent(
      new CustomEvent("workdeck:insert", {
        detail: {
          projectId: "*",
          html: text.replace(/\n/g, "<br/>"),
        },
      }),
    );
    pushToast("已插入", "ok");
  }

  return (
    <div className="ed-essentials">
      <div className="es-row">
        <div className="es-title">日常必备 · Daily Essentials</div>
        <div className="es-tabs">
          <button className={"es-tab" + (tab === "clipboard" ? " active" : "")} onClick={() => setTab("clipboard")}>
            剪贴板 ({clipboard.length})
          </button>
          <button className={"es-tab" + (tab === "variables" ? " active" : "")} onClick={() => setTab("variables")}>
            变量 ({variables.length})
          </button>
          <button className={"es-tab" + (tab === "snippets" ? " active" : "")} onClick={() => setTab("snippets")}>
            片段 ({snippets.length})
          </button>
        </div>
      </div>
      <div className="es-content">
        {tab === "clipboard" && (
          <>
            {clipboard.length === 0 && <div className="es-empty">剪贴板为空 — 在编辑器中选中文本后用 ⌘C 复制即进入此处</div>}
            {clipboard.map((c, i) => (
              <div key={c.id} className="es-clip" onClick={() => paste(c.text)} title="点击插入到文档">
                <span className="es-clip-num">{i + 1}</span>
                <span className="es-clip-text">{c.text}</span>
                {c.source && <span className="es-clip-meta">{c.source}</span>}
                <span className="es-clip-meta">{formatRel(c.createdAt)}</span>
                <button
                  className="es-clip-x"
                  onClick={(e) => {
                    e.stopPropagation();
                    removeClip(c.id);
                  }}
                >
                  ×
                </button>
              </div>
            ))}
          </>
        )}

        {tab === "variables" && (
          <>
            {variables.map((v) => (
              <div key={v.id} className="es-var">
                <code className="es-var-key">{`{{${v.key}}}`}</code>
                <input
                  className="es-var-val"
                  value={v.value}
                  onChange={(e) => updateVariable(v.id, { value: e.target.value })}
                />
                <button className="es-clip-x" onClick={() => removeVariable(v.id)}>×</button>
              </div>
            ))}
            <div className="es-var es-var-add">
              <input
                className="es-var-key-input"
                placeholder="新变量名(如 client_full_name)"
                value={varEdit.key}
                onChange={(e) => setVarEdit({ ...varEdit, key: e.target.value })}
              />
              <input
                className="es-var-val"
                placeholder="值"
                value={varEdit.value}
                onChange={(e) => setVarEdit({ ...varEdit, value: e.target.value })}
              />
              <button
                className="es-mini-btn"
                onClick={() => {
                  if (!varEdit.key.trim()) return;
                  addVariable({ key: varEdit.key.trim(), value: varEdit.value });
                  setVarEdit({ key: "", value: "" });
                }}
              >
                添加
              </button>
            </div>
          </>
        )}

        {tab === "snippets" && (
          <>
            {snippets.map((s) => (
              <div key={s.id} className="es-snip" onClick={() => paste(s.body)} title="点击插入">
                <div className="es-snip-head">
                  <span className="es-snip-name">{s.name}</span>
                  {s.shortcut && <code className="es-snip-shortcut">{s.shortcut}</code>}
                  <button
                    className="es-clip-x"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeSnippet(s.id);
                    }}
                  >
                    ×
                  </button>
                </div>
                <div className="es-snip-body">{s.body}</div>
              </div>
            ))}
            <div className="es-snip-add">
              <input
                placeholder="片段名"
                value={snipEdit.name}
                onChange={(e) => setSnipEdit({ ...snipEdit, name: e.target.value })}
              />
              <input
                placeholder="快捷键(如 /dd-intro)"
                value={snipEdit.shortcut}
                onChange={(e) => setSnipEdit({ ...snipEdit, shortcut: e.target.value })}
              />
              <textarea
                placeholder="片段内容(可含 {{变量}})"
                value={snipEdit.body}
                onChange={(e) => setSnipEdit({ ...snipEdit, body: e.target.value })}
              />
              <button
                className="es-mini-btn"
                onClick={() => {
                  if (!snipEdit.name.trim() || !snipEdit.body.trim()) return;
                  addSnippet({
                    name: snipEdit.name.trim(),
                    body: snipEdit.body,
                    shortcut: snipEdit.shortcut.trim() || undefined,
                  });
                  setSnipEdit({ name: "", body: "", shortcut: "" });
                }}
              >
                添加片段
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
