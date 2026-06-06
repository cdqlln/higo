import { useEffect, useRef, useState } from "react";
import { useStore } from "../../store";
import type { Project, TreeNode } from "../../types";

const TOOLBAR_COMMANDS: { cmd: string; arg?: string; label: string; title?: string; cls?: string }[] = [
  { cmd: "bold", label: "B", title: "粗体", cls: "bold" },
  { cmd: "italic", label: "I", title: "斜体", cls: "italic" },
  { cmd: "underline", label: "U", title: "下划线", cls: "underline" },
  { cmd: "strikeThrough", label: "S", title: "删除线" },
];

export default function Editor({
  project,
  file,
}: {
  project: Project;
  file: TreeNode | null;
}) {
  const updateFileContent = useStore((s) => s.updateFileContent);
  const addClip = useStore((s) => s.addClip);
  const ref = useRef<HTMLDivElement>(null);
  const [saved, setSaved] = useState(true);
  const [lastSaveAt, setLastSaveAt] = useState<number | null>(null);
  const debounceRef = useRef<number | null>(null);

  // Load the file content into the editor when active file changes
  useEffect(() => {
    if (!file || !ref.current) return;
    if (ref.current.innerHTML !== (file.content ?? "")) {
      ref.current.innerHTML = file.content ?? "";
    }
    setSaved(true);
  }, [file?.id]);  // eslint-disable-line react-hooks/exhaustive-deps

  // Capture selection text → clipboard (when user double-clicks/highlights)
  function onMouseUp() {
    const sel = document.getSelection()?.toString().trim();
    if (sel && sel.length > 2 && sel.length < 200) {
      // don't auto-clip unless explicit copy; but show that selection is reachable
    }
  }

  function onInput(e: React.FormEvent<HTMLDivElement>) {
    if (!file) return;
    const html = (e.target as HTMLDivElement).innerHTML;
    setSaved(false);
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      updateFileContent(project.id, file.id, html);
      setSaved(true);
      setLastSaveAt(Date.now());
    }, 600);
  }

  function exec(cmd: string, arg?: string) {
    document.execCommand(cmd, false, arg);
    ref.current?.focus();
    if (file) {
      // immediate save on toolbar action
      updateFileContent(project.id, file.id, ref.current?.innerHTML ?? "");
      setSaved(true);
      setLastSaveAt(Date.now());
    }
  }

  function copySelection() {
    const sel = document.getSelection()?.toString().trim();
    if (sel) addClip(sel, file?.name);
  }

  function insertAt(html: string) {
    if (!ref.current) return;
    ref.current.focus();
    document.execCommand("insertHTML", false, html);
    if (file) {
      updateFileContent(project.id, file.id, ref.current.innerHTML);
      setSaved(true);
      setLastSaveAt(Date.now());
    }
  }

  // Listen to a custom event that the Agent dispatches to insert content
  useEffect(() => {
    function onInsert(ev: Event) {
      const e = ev as CustomEvent<{ projectId: string; html: string }>;
      if (e.detail.projectId === project.id) insertAt(e.detail.html);
    }
    window.addEventListener("workdeck:insert", onInsert as EventListener);
    return () => window.removeEventListener("workdeck:insert", onInsert as EventListener);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id, file?.id]);

  if (!file) {
    return (
      <div className="ed-empty">
        <div className="ed-empty-title">未打开任何文件</div>
        <div className="ed-empty-sub">从左侧文件树点击或拖放文件以打开</div>
      </div>
    );
  }

  // Binary preview path: image, PDF, or unknown binary
  if (file.binaryData) {
    return <BinaryViewer file={file} />;
  }

  return (
    <>
      <div className="ed-toolbar">
        <div className="ed-tb-group">
          <select
            className="ed-select"
            onChange={(e) => exec("formatBlock", e.target.value)}
            defaultValue="p"
          >
            <option value="p">正文</option>
            <option value="h1">标题 1</option>
            <option value="h2">标题 2</option>
            <option value="h3">标题 3</option>
            <option value="blockquote">引用</option>
          </select>
          <select className="ed-select narrow" defaultValue="serif">
            <option value="serif">思源宋体</option>
            <option value="songti">方正小标宋</option>
            <option value="fang">仿宋_GB2312</option>
          </select>
          <select className="ed-select narrow" defaultValue="14">
            <option value="10.5">10.5</option>
            <option value="12">12</option>
            <option value="14">14</option>
            <option value="16">16</option>
          </select>
        </div>
        <div className="ed-tb-sep" />
        <div className="ed-tb-group">
          {TOOLBAR_COMMANDS.map((t) => (
            <button
              key={t.cmd}
              className={"ed-tb-btn " + (t.cls ?? "")}
              title={t.title}
              onMouseDown={(e) => {
                e.preventDefault();
                exec(t.cmd, t.arg);
              }}
            >
              {t.label}
            </button>
          ))}
          <button
            className="ed-tb-btn"
            title="高亮"
            onMouseDown={(e) => {
              e.preventDefault();
              exec("hiliteColor", "#FFF4D6");
            }}
          >
            ▤
          </button>
        </div>
        <div className="ed-tb-sep" />
        <div className="ed-tb-group">
          <button className="ed-tb-btn" title="无序列表" onMouseDown={(e) => { e.preventDefault(); exec("insertUnorderedList"); }}>≡</button>
          <button className="ed-tb-btn" title="有序列表" onMouseDown={(e) => { e.preventDefault(); exec("insertOrderedList"); }}>1.</button>
          <button className="ed-tb-btn" title="插入剪贴" onClick={copySelection}>⎘</button>
        </div>
        <div className="ed-tb-sep" />
        <div className="ed-tb-group">
          <button
            className="ed-ai-pill"
            onClick={() => {
              window.dispatchEvent(
                new CustomEvent("workdeck:agent-prompt", {
                  detail: {
                    projectId: project.id,
                    prompt: "请基于上下文,在当前文档结尾续写一段;保持法律书面语,200 字以内。",
                  },
                }),
              );
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M12 2L2 7l10 5 10-5-10-5z" />
              <path d="M2 17l10 5 10-5" />
              <path d="M2 12l10 5 10-5" />
            </svg>
            AI 续写
          </button>
          <button
            className="ed-ai-pill"
            onClick={() => {
              const sel = document.getSelection()?.toString().trim();
              if (!sel) return alert("请先选中要改写的文本");
              window.dispatchEvent(
                new CustomEvent("workdeck:agent-prompt", {
                  detail: {
                    projectId: project.id,
                    prompt: `请改写如下文本,保持法律书面语并更精炼:\n\n${sel}`,
                  },
                }),
              );
            }}
          >
            改写选中
          </button>
          <button
            className="ed-ai-pill"
            onClick={() => {
              window.dispatchEvent(
                new CustomEvent("workdeck:agent-prompt", {
                  detail: {
                    projectId: project.id,
                    prompt: "请使用 mcp.admin_penalty.search 工具检索目标公司的行政处罚记录,并以风险段格式插入文档末尾。",
                  },
                }),
              );
            }}
          >
            行政处罚检索
          </button>
        </div>
        <div className="ed-status">
          {saved
            ? lastSaveAt
              ? `已保存 · ${new Date(lastSaveAt).toLocaleTimeString().slice(0, 5)}`
              : "已保存"
            : "保存中…"}
        </div>
      </div>

      <div className="ed-doc-wrap">
        <article className="ed-doc">
          <div
            ref={ref}
            className="ed-page"
            contentEditable
            suppressContentEditableWarning
            onInput={onInput}
            onMouseUp={onMouseUp}
            spellCheck={false}
          />
        </article>
      </div>
    </>
  );
}

function formatBytes(b: number): string {
  if (b < 1024) return b + " B";
  if (b < 1024 * 1024) return (b / 1024).toFixed(1) + " KB";
  return (b / 1024 / 1024).toFixed(2) + " MB";
}

function BinaryViewer({ file }: { file: TreeNode }) {
  const mime = file.mimeType ?? "";
  const isImage = mime.startsWith("image/");
  const isPdf = mime === "application/pdf";
  function download() {
    if (!file.binaryData) return;
    const a = document.createElement("a");
    a.href = file.binaryData;
    a.download = file.name;
    a.click();
  }
  return (
    <div className="ed-binary">
      <div className="ed-bin-bar">
        <div className="ed-bin-info">
          <span className="ed-bin-name">{file.name}</span>
          <span className="ed-bin-meta">
            {file.mimeType ?? "binary"} · {file.size ? formatBytes(file.size) : ""}
          </span>
        </div>
        <button className="ed-bin-dl" onClick={download}>
          下载
        </button>
      </div>
      <div className="ed-bin-body">
        {isImage && file.binaryData && (
          <img className="ed-bin-img" src={file.binaryData} alt={file.name} />
        )}
        {isPdf && file.binaryData && (
          <iframe
            className="ed-bin-pdf"
            src={file.binaryData}
            title={file.name}
          />
        )}
        {!isImage && !isPdf && (
          <div className="ed-bin-fallback">
            <div className="ed-bin-fb-icon">📦</div>
            <div className="ed-bin-fb-title">无法在浏览器中预览此文件类型</div>
            <div className="ed-bin-fb-sub">
              点击右上「下载」按钮在本机打开,或交给 Agent 处理。
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
