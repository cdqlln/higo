/* In-browser xlsx editor.
 *
 * - Top: workbook toolbar (sheet tabs, add row/col, export .xlsx, format)
 * - Below: formula bar (cell address + input)
 * - Body: scrollable grid with header row/column
 * - Footer: status (selection range, sum/avg/count when range selected)
 *
 * Cell editing:
 *   - Click → select
 *   - Double-click or Enter / F2 → enter edit mode (textarea overlay)
 *   - Enter inside editor → commit + move down
 *   - Tab inside editor → commit + move right
 *   - Esc → cancel
 *   - Arrow keys (outside editor) → navigate
 *   - Backspace / Delete (outside editor) → clear cell
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "../../store";
import {
  blankSpreadsheet,
  cellKey,
  colLetter,
  exportToXlsx,
  parseCellKey,
  recomputeSheet,
  setCellAndRecompute,
} from "../../lib/spreadsheet";
import type { Cell, Project, Spreadsheet, SpreadsheetSheet, TreeNode } from "../../types";

const DEFAULT_COL_WIDTH = 96;
const ROW_HEIGHT = 26;
const HEADER_HEIGHT = 26;
const ROW_HEADER_WIDTH = 44;

type Sel = { r: number; c: number };

export default function SpreadsheetEditor({
  project,
  file,
}: {
  project: Project;
  file: TreeNode;
}) {
  const updateSpreadsheet = useStore((s) => s.updateSpreadsheet);
  const pushToast = useStore((s) => s.pushToast);

  // Local working copy — we recompute / mutate freely, then push the whole
  // spreadsheet back to the store on every commit (autosave).
  const [ss, setSs] = useState<Spreadsheet>(
    () => file.spreadsheet ?? blankSpreadsheet(),
  );
  const [sel, setSel] = useState<Sel>({ r: 0, c: 0 });
  /** End anchor for a multi-cell selection. */
  const [selEnd, setSelEnd] = useState<Sel | null>(null);
  const [editing, setEditing] = useState<{ r: number; c: number; value: string } | null>(null);
  const [formulaInput, setFormulaInput] = useState<string>("");
  const [saveTick, setSaveTick] = useState(0);

  const gridRef = useRef<HTMLDivElement>(null);
  const editorInputRef = useRef<HTMLInputElement>(null);
  const formulaBarRef = useRef<HTMLInputElement>(null);
  const lastFileIdRef = useRef<string>(file.id);

  // Reload when active file changes
  useEffect(() => {
    if (file.id !== lastFileIdRef.current) {
      setSs(file.spreadsheet ?? blankSpreadsheet());
      setSel({ r: 0, c: 0 });
      setSelEnd(null);
      setEditing(null);
      lastFileIdRef.current = file.id;
    }
  }, [file.id, file.spreadsheet]);

  const sheet = ss.sheets[ss.activeSheet];

  // Sync formula bar to selected cell
  useEffect(() => {
    const cell = sheet.cells[cellKey(sel.r, sel.c)];
    setFormulaInput(cell?.raw ?? (cell?.v !== undefined ? String(cell.v) : ""));
  }, [sel.r, sel.c, sheet]);

  function commit(spreadsheet: Spreadsheet) {
    setSs(spreadsheet);
    updateSpreadsheet(project.id, file.id, spreadsheet);
    setSaveTick((t) => t + 1);
  }

  function withSheet(mut: (s: SpreadsheetSheet) => void): void {
    const next = structuredClone(ss);
    mut(next.sheets[next.activeSheet]);
    commit(next);
  }

  function setRawAt(r: number, c: number, raw: string) {
    withSheet((s) => {
      setCellAndRecompute(s, cellKey(r, c), raw);
    });
  }

  function clearRange(start: Sel, end: Sel) {
    withSheet((s) => {
      const r0 = Math.min(start.r, end.r);
      const r1 = Math.max(start.r, end.r);
      const c0 = Math.min(start.c, end.c);
      const c1 = Math.max(start.c, end.c);
      for (let r = r0; r <= r1; r++) {
        for (let c = c0; c <= c1; c++) {
          delete s.cells[cellKey(r, c)];
        }
      }
      recomputeSheet(s);
    });
  }

  function move(dr: number, dc: number, extend = false) {
    if (extend) {
      // Shift+Arrow extends the END anchor, leaving SEL (the start) put
      setSelEnd((cur) => {
        const base = cur ?? sel;
        const r = Math.max(0, Math.min(sheet.rows - 1, base.r + dr));
        const c = Math.max(0, Math.min(sheet.cols - 1, base.c + dc));
        return { r, c };
      });
    } else {
      setSel((cur) => {
        const r = Math.max(0, Math.min(sheet.rows - 1, cur.r + dr));
        const c = Math.max(0, Math.min(sheet.cols - 1, cur.c + dc));
        return { r, c };
      });
      setSelEnd(null);
    }
    setEditing(null);
  }

  function startEditing(seed?: string) {
    const cur = sheet.cells[cellKey(sel.r, sel.c)];
    setEditing({
      r: sel.r,
      c: sel.c,
      value: seed ?? cur?.raw ?? (cur?.v !== undefined ? String(cur.v) : ""),
    });
    // Focus on next tick
    setTimeout(() => editorInputRef.current?.focus(), 0);
  }

  function commitEdit(then?: "down" | "right" | "stay") {
    if (!editing) return;
    setRawAt(editing.r, editing.c, editing.value);
    setEditing(null);
    if (then === "down") move(1, 0);
    else if (then === "right") move(0, 1);
    else gridRef.current?.focus();
  }

  function onGridKeyDown(e: React.KeyboardEvent) {
    if (editing) return;
    const k = e.key;
    if (k === "ArrowUp") { e.preventDefault(); move(-1, 0, e.shiftKey); }
    else if (k === "ArrowDown") { e.preventDefault(); move(1, 0, e.shiftKey); }
    else if (k === "ArrowLeft") { e.preventDefault(); move(0, -1, e.shiftKey); }
    else if (k === "ArrowRight") { e.preventDefault(); move(0, 1, e.shiftKey); }
    else if (k === "Tab") {
      e.preventDefault();
      move(0, e.shiftKey ? -1 : 1);
    }
    else if (k === "Enter" || k === "F2") {
      e.preventDefault();
      startEditing();
    }
    else if (k === "Delete" || k === "Backspace") {
      e.preventDefault();
      const end = selEnd ?? sel;
      clearRange(sel, end);
    }
    else if (k.length === 1 && !e.metaKey && !e.ctrlKey) {
      // Start typing → enter editor with this char
      e.preventDefault();
      startEditing(k);
    }
  }

  function onCellMouseDown(r: number, c: number, e: React.MouseEvent) {
    setSel({ r, c });
    setSelEnd(null);
    setEditing(null);
    gridRef.current?.focus();
    e.preventDefault();
  }
  function onCellMouseEnter(r: number, c: number, e: React.MouseEvent) {
    if (e.buttons === 1) {
      setSelEnd({ r, c });
    }
  }
  function onCellDoubleClick(r: number, c: number) {
    setSel({ r, c });
    startEditing();
  }

  function addRow() { withSheet((s) => { s.rows += 1; }); }
  function addCol() { withSheet((s) => { s.cols += 1; }); }
  function removeRow() {
    withSheet((s) => {
      if (s.rows <= 1) return;
      // Drop cells in last row
      for (let c = 0; c < s.cols; c++) {
        delete s.cells[cellKey(s.rows - 1, c)];
      }
      s.rows -= 1;
      recomputeSheet(s);
    });
    if (sel.r >= sheet.rows - 1) setSel({ r: Math.max(0, sheet.rows - 2), c: sel.c });
  }
  function removeCol() {
    withSheet((s) => {
      if (s.cols <= 1) return;
      for (let r = 0; r < s.rows; r++) {
        delete s.cells[cellKey(r, s.cols - 1)];
      }
      s.cols -= 1;
      recomputeSheet(s);
    });
    if (sel.c >= sheet.cols - 1) setSel({ r: sel.r, c: Math.max(0, sheet.cols - 2) });
  }

  function addSheet() {
    withSheetbook((ws) => {
      const n = ws.sheets.length + 1;
      ws.sheets.push({ name: `Sheet${n}`, rows: 20, cols: 10, cells: {} });
      ws.activeSheet = ws.sheets.length - 1;
    });
    setSel({ r: 0, c: 0 });
  }
  function removeSheet(i: number) {
    if (ss.sheets.length <= 1) {
      pushToast("至少保留一个工作表", "warn");
      return;
    }
    if (!confirm(`删除工作表「${ss.sheets[i].name}」?`)) return;
    withSheetbook((ws) => {
      ws.sheets.splice(i, 1);
      ws.activeSheet = Math.max(0, Math.min(ws.activeSheet, ws.sheets.length - 1));
    });
  }
  function renameSheet(i: number) {
    const name = prompt("新的工作表名称:", ss.sheets[i].name);
    if (!name?.trim()) return;
    withSheetbook((ws) => { ws.sheets[i].name = name.trim(); });
  }
  function switchSheet(i: number) {
    withSheetbook((ws) => { ws.activeSheet = i; });
    setSel({ r: 0, c: 0 });
    setSelEnd(null);
  }
  function withSheetbook(mut: (ws: Spreadsheet) => void) {
    const next = structuredClone(ss);
    mut(next);
    commit(next);
  }

  function toggleStyle(prop: "bold" | "italic") {
    const start = selRange();
    withSheet((s) => {
      for (let r = start.r0; r <= start.r1; r++) {
        for (let c = start.c0; c <= start.c1; c++) {
          const key = cellKey(r, c);
          s.cells[key] = { ...s.cells[key], [prop]: !s.cells[key]?.[prop] };
        }
      }
    });
  }
  function setAlign(align: "left" | "center" | "right") {
    const start = selRange();
    withSheet((s) => {
      for (let r = start.r0; r <= start.r1; r++) {
        for (let c = start.c0; c <= start.c1; c++) {
          const key = cellKey(r, c);
          s.cells[key] = { ...s.cells[key], align };
        }
      }
    });
  }
  function setFmt(fmt: Cell["fmt"]) {
    const start = selRange();
    withSheet((s) => {
      for (let r = start.r0; r <= start.r1; r++) {
        for (let c = start.c0; c <= start.c1; c++) {
          const key = cellKey(r, c);
          s.cells[key] = { ...s.cells[key], fmt };
        }
      }
    });
  }

  function selRange() {
    const end = selEnd ?? sel;
    return {
      r0: Math.min(sel.r, end.r),
      r1: Math.max(sel.r, end.r),
      c0: Math.min(sel.c, end.c),
      c1: Math.max(sel.c, end.c),
    };
  }

  // Status: when more than one cell selected, show sum/avg/count
  const stats = useMemo(() => {
    const r = selRange();
    const count = (r.r1 - r.r0 + 1) * (r.c1 - r.c0 + 1);
    if (count === 1) return null;
    let n = 0;
    let sum = 0;
    let nonEmpty = 0;
    for (let i = r.r0; i <= r.r1; i++) {
      for (let j = r.c0; j <= r.c1; j++) {
        const v = sheet.cells[cellKey(i, j)]?.v;
        if (v !== undefined && v !== "") nonEmpty++;
        if (typeof v === "number") { sum += v; n++; }
      }
    }
    return { count, nonEmpty, sum, avg: n ? sum / n : 0, numCount: n };
  }, [sel, selEnd, sheet]);

  return (
    <div className="ss-root" tabIndex={0} ref={gridRef} onKeyDown={onGridKeyDown}>
      {/* Workbook toolbar */}
      <div className="ss-toolbar">
        <div className="ss-tb-group">
          <button className="ss-tb-btn" onClick={addRow} title="增加一行">＋行</button>
          <button className="ss-tb-btn" onClick={addCol} title="增加一列">＋列</button>
          <button className="ss-tb-btn" onClick={removeRow} title="删除末行">−行</button>
          <button className="ss-tb-btn" onClick={removeCol} title="删除末列">−列</button>
        </div>
        <div className="ss-tb-sep" />
        <div className="ss-tb-group">
          <button className="ss-tb-btn b" onClick={() => toggleStyle("bold")} title="粗体">B</button>
          <button className="ss-tb-btn i" onClick={() => toggleStyle("italic")} title="斜体">I</button>
          <button className="ss-tb-btn" onClick={() => setAlign("left")} title="左对齐">⬅</button>
          <button className="ss-tb-btn" onClick={() => setAlign("center")} title="居中">═</button>
          <button className="ss-tb-btn" onClick={() => setAlign("right")} title="右对齐">➡</button>
        </div>
        <div className="ss-tb-sep" />
        <div className="ss-tb-group">
          <select
            className="ss-tb-select"
            value={getActiveFmt(sheet, sel)}
            onChange={(e) => setFmt(e.target.value as Cell["fmt"])}
          >
            <option value="text">文本</option>
            <option value="number">数字</option>
            <option value="percent">百分比</option>
            <option value="currency">货币 ¥</option>
            <option value="date">日期</option>
          </select>
        </div>
        <div className="ss-tb-sep" />
        <button
          className="ss-tb-btn"
          onClick={async () => {
            const name = file.name.replace(/\.(xlsx|xls)$/i, "") + ".xlsx";
            await exportToXlsx(ss, name);
            pushToast("已导出 " + name, "ok");
          }}
        >
          ⬇ 导出 .xlsx
        </button>
        <div className="ss-saved">
          {saveTick > 0 ? "已自动保存" : "未编辑"}
        </div>
      </div>

      {/* Formula bar */}
      <div className="ss-fbar">
        <div className="ss-fbar-addr">{cellKey(sel.r, sel.c)}</div>
        <input
          ref={formulaBarRef}
          className="ss-fbar-input"
          value={formulaInput}
          onChange={(e) => setFormulaInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              setRawAt(sel.r, sel.c, formulaInput);
              move(1, 0);
            } else if (e.key === "Escape") {
              setFormulaInput(sheet.cells[cellKey(sel.r, sel.c)]?.raw ?? "");
              gridRef.current?.focus();
            }
          }}
          onBlur={() => {
            const cur = sheet.cells[cellKey(sel.r, sel.c)];
            const existing = cur?.raw ?? (cur?.v !== undefined ? String(cur.v) : "");
            if (formulaInput !== existing) setRawAt(sel.r, sel.c, formulaInput);
          }}
          placeholder='输入值或公式(以 = 开头):=SUM(A1:A10) · =A1+B1 · =IF(C2>0,"是","否")'
        />
      </div>

      {/* Grid */}
      <div className="ss-grid-wrap">
        <div
          className="ss-grid"
          style={{
            gridTemplateColumns: `${ROW_HEADER_WIDTH}px repeat(${sheet.cols}, ${DEFAULT_COL_WIDTH}px)`,
          }}
        >
          {/* Corner */}
          <div className="ss-corner" />
          {/* Column headers */}
          {Array.from({ length: sheet.cols }, (_, c) => (
            <div
              key={"ch-" + c}
              className={"ss-col-h" + (sel.c === c ? " active" : "")}
            >
              {colLetter(c)}
            </div>
          ))}
          {/* Body rows */}
          {Array.from({ length: sheet.rows }, (_, r) => (
            <Row
              key={"r-" + r}
              r={r}
              sheet={sheet}
              sel={sel}
              selEnd={selEnd ?? sel}
              editing={editing}
              setEditingValue={(v) => setEditing(editing ? { ...editing, value: v } : editing)}
              commitEdit={commitEdit}
              cancelEdit={() => setEditing(null)}
              onMouseDown={onCellMouseDown}
              onMouseEnter={onCellMouseEnter}
              onDoubleClick={onCellDoubleClick}
              editorInputRef={editorInputRef}
            />
          ))}
        </div>
      </div>

      {/* Sheet tabs */}
      <div className="ss-tabs">
        {ss.sheets.map((s, i) => (
          <div
            key={i}
            className={"ss-tab" + (i === ss.activeSheet ? " active" : "")}
            onClick={() => switchSheet(i)}
            onDoubleClick={() => renameSheet(i)}
          >
            <span>{s.name}</span>
            <button
              className="ss-tab-x"
              onClick={(e) => { e.stopPropagation(); removeSheet(i); }}
              title="删除工作表"
            >
              ×
            </button>
          </div>
        ))}
        <button className="ss-tab-add" onClick={addSheet} title="新工作表">+</button>
        <div className="ss-tabs-right">
          {stats ? (
            <span>
              选区 {stats.count} 个 · 非空 {stats.nonEmpty} ·
              数字 {stats.numCount} · 求和 {fmtNum(stats.sum)} ·
              均值 {fmtNum(stats.avg)}
            </span>
          ) : (
            <span>
              {sheet.name} · {sheet.rows} 行 × {sheet.cols} 列
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function fmtNum(n: number): string {
  if (!isFinite(n)) return "-";
  if (Math.abs(n - Math.round(n)) < 1e-10) return String(Math.round(n));
  return (Math.round(n * 100) / 100).toString();
}

function getActiveFmt(sheet: SpreadsheetSheet, sel: Sel): string {
  return sheet.cells[cellKey(sel.r, sel.c)]?.fmt ?? "text";
}

function Row({
  r,
  sheet,
  sel,
  selEnd,
  editing,
  setEditingValue,
  commitEdit,
  cancelEdit,
  onMouseDown,
  onMouseEnter,
  onDoubleClick,
  editorInputRef,
}: {
  r: number;
  sheet: SpreadsheetSheet;
  sel: Sel;
  selEnd: Sel;
  editing: { r: number; c: number; value: string } | null;
  setEditingValue: (v: string) => void;
  commitEdit: (then?: "down" | "right" | "stay") => void;
  cancelEdit: () => void;
  onMouseDown: (r: number, c: number, e: React.MouseEvent) => void;
  onMouseEnter: (r: number, c: number, e: React.MouseEvent) => void;
  onDoubleClick: (r: number, c: number) => void;
  editorInputRef: React.RefObject<HTMLInputElement | null>;
}) {
  const r0 = Math.min(sel.r, selEnd.r);
  const r1 = Math.max(sel.r, selEnd.r);
  const c0 = Math.min(sel.c, selEnd.c);
  const c1 = Math.max(sel.c, selEnd.c);
  return (
    <>
      <div className={"ss-row-h" + (sel.r === r ? " active" : "")}>{r + 1}</div>
      {Array.from({ length: sheet.cols }, (_, c) => {
        const key = cellKey(r, c);
        const cell = sheet.cells[key];
        const isSel = sel.r === r && sel.c === c;
        const isInRange = r >= r0 && r <= r1 && c >= c0 && c <= c1;
        const isEditing = editing && editing.r === r && editing.c === c;
        return (
          <div
            key={key}
            className={
              "ss-cell" +
              (isSel ? " sel" : "") +
              (isInRange && !isSel ? " in-range" : "") +
              (cell?.bold ? " bold" : "") +
              (cell?.italic ? " italic" : "") +
              (cell?.align ? " align-" + cell.align : "")
            }
            onMouseDown={(e) => onMouseDown(r, c, e)}
            onMouseEnter={(e) => onMouseEnter(r, c, e)}
            onDoubleClick={() => onDoubleClick(r, c)}
          >
            {isEditing ? (
              <input
                ref={editorInputRef}
                className="ss-editor"
                value={editing!.value}
                onChange={(e) => setEditingValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") { e.preventDefault(); commitEdit("down"); }
                  else if (e.key === "Tab") { e.preventDefault(); commitEdit("right"); }
                  else if (e.key === "Escape") { e.preventDefault(); cancelEdit(); }
                }}
                onBlur={() => commitEdit("stay")}
              />
            ) : (
              <span className="ss-cell-text">
                {formatCellDisplay(cell)}
              </span>
            )}
          </div>
        );
      })}
    </>
  );
}

function formatCellDisplay(cell: Cell | undefined): string {
  if (!cell || cell.v === undefined || cell.v === "") return "";
  const v = cell.v;
  if (cell.fmt === "percent" && typeof v === "number") return (v * 100).toFixed(1) + "%";
  if (cell.fmt === "currency" && typeof v === "number") return "¥" + v.toLocaleString();
  if (cell.fmt === "date" && typeof v === "number") {
    // xlsx serial date → JS date
    const epoch = new Date(Date.UTC(1899, 11, 30));
    const d = new Date(epoch.getTime() + v * 86400000);
    return d.toISOString().slice(0, 10);
  }
  if (typeof v === "number") {
    if (Math.abs(v - Math.round(v)) < 1e-10) return String(Math.round(v));
    return v.toString();
  }
  return String(v);
}
