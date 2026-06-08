import { useEffect, useRef, useState } from "react";
import { useStore } from "../../store";
import type { Project, TreeNode } from "../../types";
import {
  buildTableHtml,
  countWords,
  deleteColumn,
  deleteRow,
  deleteTable,
  findActiveCell,
  focusNextCell,
  insertColumn,
  insertRow,
  toggleHeaderRow,
} from "../../lib/editor";
import SpreadsheetEditor from "./SpreadsheetEditor";

type SaveState = "saved" | "dirty" | "saving";

const TOOLBAR_COMMANDS: { cmd: string; arg?: string; label: string; title?: string; cls?: string }[] = [
  { cmd: "bold", label: "B", title: "粗体 ⌘B", cls: "bold" },
  { cmd: "italic", label: "I", title: "斜体 ⌘I", cls: "italic" },
  { cmd: "underline", label: "U", title: "下划线 ⌘U", cls: "underline" },
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
  const pushToast = useStore((s) => s.pushToast);
  const ref = useRef<HTMLDivElement>(null);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [lastSaveAt, setLastSaveAt] = useState<number | null>(null);
  const [stats, setStats] = useState<{ words: number; chars: number }>({ words: 0, chars: 0 });
  const [activeCell, setActiveCell] = useState<HTMLTableCellElement | null>(null);
  const [tablePickerOpen, setTablePickerOpen] = useState(false);
  const debounceRef = useRef<number | null>(null);

  // Load the file content into the editor when active file changes
  useEffect(() => {
    if (!file || !ref.current) return;
    if (ref.current.innerHTML !== (file.content ?? "")) {
      ref.current.innerHTML = file.content ?? "";
    }
    setSaveState("saved");
    setStats(countWords(file.content ?? ""));
  }, [file?.id]);  // eslint-disable-line react-hooks/exhaustive-deps

  function performSave(html?: string) {
    if (!file || !ref.current) return;
    const content = html ?? ref.current.innerHTML;
    setSaveState("saving");
    updateFileContent(project.id, file.id, content);
    setSaveState("saved");
    setLastSaveAt(Date.now());
  }

  function onMouseUp() {
    // Update activeCell for table toolbar visibility
    if (ref.current) setActiveCell(findActiveCell(ref.current));
  }

  function onInput(e: React.FormEvent<HTMLDivElement>) {
    if (!file) return;
    const html = (e.target as HTMLDivElement).innerHTML;
    setSaveState("dirty");
    setStats(countWords(html));
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      performSave(html);
    }, 600);
  }

  function onBlur() {
    // Immediate save on blur (no debounce)
    if (saveState !== "saved" && file && ref.current) {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
      performSave();
    }
  }

  function onKeyDown(e: React.KeyboardEvent) {
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key.toLowerCase() === "s") {
      e.preventDefault();
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
      performSave();
      pushToast("已保存", "ok");
      return;
    }
    // Tab inside a table cell → move to next cell
    if (e.key === "Tab" && !e.shiftKey && ref.current) {
      const cell = findActiveCell(ref.current);
      if (cell) {
        e.preventDefault();
        focusNextCell(cell);
        // Re-read activeCell after move
        setTimeout(() => {
          if (ref.current) setActiveCell(findActiveCell(ref.current));
          if (file && ref.current) performSave();
        }, 0);
      }
    }
  }

  function exec(cmd: string, arg?: string) {
    document.execCommand(cmd, false, arg);
    ref.current?.focus();
    performSave();
  }

  function copySelection() {
    const sel = document.getSelection()?.toString().trim();
    if (sel) addClip(sel, file?.name);
  }

  function insertAt(html: string) {
    if (!ref.current) return;
    ref.current.focus();
    document.execCommand("insertHTML", false, html);
    performSave();
  }

  function insertTable(rows: number, cols: number) {
    const root = ref.current;
    if (!root) return;
    root.focus();

    // Find the top-level block (direct child of root) that contains the
    // current selection. We will insert the new table AFTER that block, so
    // it never ends up nested inside another table.
    const sel = document.getSelection();
    let anchor: Node | null = sel?.anchorNode ?? null;
    let topBlock: Element | null = null;
    while (anchor && anchor !== root) {
      if (anchor.parentNode === root && anchor instanceof Element) {
        topBlock = anchor;
        break;
      }
      anchor = anchor.parentNode;
    }

    // Build the table DOM
    const wrap = document.createElement("div");
    wrap.innerHTML = buildTableHtml(rows, cols, true);
    const nodesToInsert = Array.from(wrap.childNodes);

    if (topBlock) {
      // Insert each new node right after topBlock
      let cursorBefore: Node | null = topBlock.nextSibling;
      for (const n of nodesToInsert) {
        root.insertBefore(n, cursorBefore);
      }
    } else {
      for (const n of nodesToInsert) root.appendChild(n);
    }

    // Move caret into the first cell of the new table
    const newTable = nodesToInsert.find(
      (n): n is HTMLTableElement => n instanceof HTMLTableElement,
    );
    if (newTable) {
      const firstCell = newTable.rows[0]?.cells[0];
      if (firstCell) {
        const r = document.createRange();
        r.selectNodeContents(firstCell);
        r.collapse(true);
        const s = document.getSelection();
        s?.removeAllRanges();
        s?.addRange(r);
      }
    }

    performSave();
    setTablePickerOpen(false);
  }

  function tableOp(fn: (cell: HTMLTableCellElement) => void) {
    if (!activeCell || !ref.current) return;
    fn(activeCell);
    // After DOM-level edits, the activeCell may have been removed
    if (!ref.current.contains(activeCell)) setActiveCell(null);
    performSave();
  }

  // Track cell focus via selection changes
  useEffect(() => {
    function onSelChange() {
      if (!ref.current) return;
      if (document.activeElement !== ref.current && !ref.current.contains(document.activeElement)) return;
      setActiveCell(findActiveCell(ref.current));
    }
    document.addEventListener("selectionchange", onSelChange);
    return () => document.removeEventListener("selectionchange", onSelChange);
  }, []);

  // Close table picker on outside click
  useEffect(() => {
    if (!tablePickerOpen) return;
    function onClickAway(e: MouseEvent) {
      const t = e.target as HTMLElement;
      if (!t.closest(".ed-table-picker") && !t.closest(".tbl-trigger")) {
        setTablePickerOpen(false);
      }
    }
    window.addEventListener("mousedown", onClickAway);
    return () => window.removeEventListener("mousedown", onClickAway);
  }, [tablePickerOpen]);

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

  // Spreadsheet path (xlsx / new sheet)
  if (file.spreadsheet) {
    return <SpreadsheetEditor project={project} file={file} />;
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
          <div className="tbl-trigger-wrap">
            <button
              className={"ed-tb-btn tbl-trigger" + (activeCell ? " in-table" : "")}
              title="插入表格"
              onMouseDown={(e) => {
                e.preventDefault();
                setTablePickerOpen((v) => !v);
              }}
            >
              ⊞
            </button>
            {tablePickerOpen && (
              <TableSizePicker
                onPick={(r, c) => insertTable(r, c)}
                onCustom={() => {
                  const s = prompt("输入 行x列(如 5x4):", "5x4");
                  if (s) {
                    const [r, c] = s.split(/[x×]/i).map((n) => parseInt(n, 10));
                    if (r >= 1 && c >= 1 && r <= 30 && c <= 12) insertTable(r, c);
                    else pushToast("尺寸应在 1×1 到 30×12 之间", "warn");
                  }
                  setTablePickerOpen(false);
                }}
              />
            )}
          </div>
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
          <span className="ed-words">
            {stats.words} 字 · {stats.chars} 字符
          </span>
          <SaveBadge state={saveState} lastSaveAt={lastSaveAt} />
        </div>
      </div>

      {activeCell && (
        <TableToolbar
          onAction={(action) => {
            switch (action) {
              case "rowAbove": return tableOp((c) => insertRow(c, "above"));
              case "rowBelow": return tableOp((c) => insertRow(c, "below"));
              case "colLeft": return tableOp((c) => insertColumn(c, "left"));
              case "colRight": return tableOp((c) => insertColumn(c, "right"));
              case "delRow": return tableOp(deleteRow);
              case "delCol": return tableOp(deleteColumn);
              case "delTable":
                if (confirm("确定删除整个表格?")) tableOp(deleteTable);
                return;
              case "toggleHeader": return tableOp(toggleHeaderRow);
            }
          }}
        />
      )}

      <div className="ed-doc-wrap">
        <article className="ed-doc">
          <div
            ref={ref}
            className="ed-page"
            contentEditable
            suppressContentEditableWarning
            onInput={onInput}
            onMouseUp={onMouseUp}
            onBlur={onBlur}
            onKeyDown={onKeyDown}
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

/* ============================================
 * Save status badge
 * ============================================ */
function SaveBadge({
  state,
  lastSaveAt,
}: {
  state: SaveState;
  lastSaveAt: number | null;
}) {
  // tick a counter every 15s to refresh relative time
  const [, setTick] = useState(0);
  useEffect(() => {
    if (state !== "saved") return;
    const id = window.setInterval(() => setTick((t) => t + 1), 15000);
    return () => window.clearInterval(id);
  }, [state, lastSaveAt]);

  if (state === "saving") {
    return (
      <span className="save-badge saving">
        <span className="save-dot" /> 保存中…
      </span>
    );
  }
  if (state === "dirty") {
    return (
      <span className="save-badge dirty">
        <span className="save-dot" /> 未保存的修改
      </span>
    );
  }
  if (!lastSaveAt) return <span className="save-badge saved">已保存</span>;
  return (
    <span className="save-badge saved">
      <span className="save-dot" /> 已保存 · {relTime(lastSaveAt)}
    </span>
  );
}

function relTime(ts: number): string {
  const d = Date.now() - ts;
  if (d < 30000) return "刚刚";
  const m = Math.floor(d / 60000);
  if (m < 1) return Math.floor(d / 1000) + " 秒前";
  if (m < 60) return m + " 分钟前";
  const h = Math.floor(m / 60);
  if (h < 24) return h + " 小时前";
  return new Date(ts).toLocaleString().slice(0, 16);
}

/* ============================================
 * Table size picker (hover-grid)
 * ============================================ */
function TableSizePicker({
  onPick,
  onCustom,
}: {
  onPick: (rows: number, cols: number) => void;
  onCustom: () => void;
}) {
  const MAX_R = 8, MAX_C = 8;
  const [hover, setHover] = useState<{ r: number; c: number }>({ r: 0, c: 0 });
  return (
    <div className="ed-table-picker">
      <div className="ed-tp-grid">
        {Array.from({ length: MAX_R }, (_, ri) =>
          Array.from({ length: MAX_C }, (_, ci) => (
            <div
              key={`${ri}-${ci}`}
              className={
                "ed-tp-cell" +
                (ri <= hover.r - 1 && ci <= hover.c - 1 ? " on" : "")
              }
              onMouseEnter={() => setHover({ r: ri + 1, c: ci + 1 })}
              onClick={() => onPick(ri + 1, ci + 1)}
            />
          )),
        )}
      </div>
      <div className="ed-tp-label">
        {hover.r > 0
          ? `${hover.r} × ${hover.c}(${hover.r} 行 × ${hover.c} 列)`
          : "拖动选择尺寸"}
      </div>
      <button className="ed-tp-custom" onClick={onCustom}>
        自定义尺寸…
      </button>
    </div>
  );
}

/* ============================================
 * Floating table-edit toolbar (shows when cursor is inside a cell)
 * ============================================ */
function TableToolbar({
  onAction,
}: {
  onAction: (
    action:
      | "rowAbove"
      | "rowBelow"
      | "colLeft"
      | "colRight"
      | "delRow"
      | "delCol"
      | "delTable"
      | "toggleHeader",
  ) => void;
}) {
  const btns: { a: Parameters<typeof onAction>[0]; label: string; title: string; danger?: boolean }[] = [
    { a: "rowAbove", label: "⬆+", title: "上方插入行" },
    { a: "rowBelow", label: "⬇+", title: "下方插入行" },
    { a: "colLeft", label: "⬅+", title: "左侧插入列" },
    { a: "colRight", label: "➡+", title: "右侧插入列" },
    { a: "delRow", label: "−行", title: "删除当前行" },
    { a: "delCol", label: "−列", title: "删除当前列" },
    { a: "toggleHeader", label: "⇅表头", title: "切换首行为表头" },
    { a: "delTable", label: "✕表", title: "删除整表", danger: true },
  ];
  return (
    <div className="ed-table-toolbar">
      <span className="ed-table-toolbar-label">表格编辑</span>
      {btns.map((b) => (
        <button
          key={b.a}
          className={"ed-tt-btn" + (b.danger ? " danger" : "")}
          title={b.title}
          onMouseDown={(e) => {
            e.preventDefault();
            onAction(b.a);
          }}
        >
          {b.label}
        </button>
      ))}
      <span className="ed-table-toolbar-hint">Tab 移动 · 末格换行新增</span>
    </div>
  );
}
