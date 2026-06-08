/* Spreadsheet helpers — coordinate math, xlsx I/O, formula evaluator.
 *
 * Coordinate convention:
 *   - Column index 0 → "A", 1 → "B", 26 → "AA"
 *   - Cell key "A1" = column A, row 1 (1-based row)
 *   - Internally rows are also tracked 1-based to match xlsx norms
 */

/* xlsx is loaded dynamically — it's ~400 KB gzipped and most sessions
 * don't touch a spreadsheet. */
import type { Cell, Spreadsheet, SpreadsheetSheet } from "../types";

let xlsxModulePromise: Promise<typeof import("xlsx")> | null = null;
function loadXlsx() {
  if (!xlsxModulePromise) xlsxModulePromise = import("xlsx");
  return xlsxModulePromise;
}

/* ============================================
 * Coordinate helpers
 * ============================================ */
export function colLetter(idx: number): string {
  let n = idx;
  let s = "";
  do {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return s;
}

export function colIndex(letter: string): number {
  let n = 0;
  for (const c of letter.toUpperCase()) {
    n = n * 26 + (c.charCodeAt(0) - 64);
  }
  return n - 1;
}

export function cellKey(rowIdx: number, colIdx: number): string {
  return `${colLetter(colIdx)}${rowIdx + 1}`;
}

export function parseCellKey(key: string): { row: number; col: number } | null {
  const m = key.match(/^([A-Z]+)(\d+)$/);
  if (!m) return null;
  return { col: colIndex(m[1]), row: parseInt(m[2], 10) - 1 };
}

/* ============================================
 * xlsx import / export
 * ============================================ */
export async function parseXlsxArrayBuffer(buf: ArrayBuffer): Promise<Spreadsheet> {
  const XLSX = await loadXlsx();
  const wb = XLSX.read(buf, { type: "array" });
  const sheets: SpreadsheetSheet[] = wb.SheetNames.map((name) => {
    const ws = wb.Sheets[name];
    const range = XLSX.utils.decode_range(ws["!ref"] ?? "A1:A1");
    const cells: Record<string, Cell> = {};
    for (let r = range.s.r; r <= range.e.r; r++) {
      for (let c = range.s.c; c <= range.e.c; c++) {
        const key = XLSX.utils.encode_cell({ r, c });
        const cell = ws[key];
        if (!cell) continue;
        const internal: Cell = {};
        if (cell.f) {
          internal.f = "=" + cell.f;
          internal.raw = "=" + cell.f;
        } else if (cell.v !== undefined) {
          internal.raw = String(cell.v);
        }
        if (cell.v !== undefined) internal.v = cell.v as number | string;
        if (typeof cell.v === "number") internal.fmt = "number";
        cells[key] = internal;
      }
    }
    return {
      name,
      rows: Math.max(range.e.r + 1, 20),
      cols: Math.max(range.e.c + 1, 10),
      cells,
    };
  });
  return { sheets, activeSheet: 0 };
}

export async function exportToXlsx(ss: Spreadsheet, filename = "导出.xlsx"): Promise<void> {
  const XLSX = await loadXlsx();
  const wb = XLSX.utils.book_new();
  for (const s of ss.sheets) {
    const ws: import("xlsx").WorkSheet = {};
    for (const [key, cell] of Object.entries(s.cells)) {
      if (cell.f) {
        ws[key] = { t: "n", f: cell.f.replace(/^=/, ""), v: cell.v ?? 0 };
      } else if (cell.v !== undefined && cell.v !== "") {
        const t = typeof cell.v === "number" ? "n" : "s";
        ws[key] = { t, v: cell.v };
      }
    }
    ws["!ref"] = XLSX.utils.encode_range({
      s: { r: 0, c: 0 },
      e: { r: s.rows - 1, c: s.cols - 1 },
    });
    XLSX.utils.book_append_sheet(wb, ws, s.name);
  }
  XLSX.writeFile(wb, filename);
}

/* ============================================
 * Empty sheet factory
 * ============================================ */
export function blankSpreadsheet(rows = 20, cols = 10): Spreadsheet {
  return {
    sheets: [{ name: "Sheet1", rows, cols, cells: {} }],
    activeSheet: 0,
  };
}

/* ============================================
 * Formula evaluator (recursive descent)
 *
 * Supports:
 *   - Numbers, strings, parens
 *   - + - * / % ^ operators
 *   - Cell refs: A1, ZZ100
 *   - Ranges: A1:B5
 *   - Functions: SUM AVG AVERAGE MIN MAX COUNT COUNTA IF ROUND CONCAT LEN ABS
 * ============================================ */

type Ctx = {
  get: (key: string) => Cell | undefined;
  /** Track cells we depend on to detect cycles */
  visited: Set<string>;
};

const FUNCS: Record<string, (args: (number | string)[]) => number | string> = {
  SUM: (a) => a.reduce<number>((n, x) => n + Number(x || 0), 0),
  AVG: (a) => (a.length ? (FUNCS.SUM(a) as number) / Math.max(1, numericCount(a)) : 0),
  AVERAGE: (a) => (FUNCS.AVG as (x: typeof a) => number | string)(a),
  MIN: (a) => Math.min(...a.map(numOrZero)),
  MAX: (a) => Math.max(...a.map(numOrZero)),
  COUNT: (a) => numericCount(a),
  COUNTA: (a) => a.filter((x) => x !== "" && x !== null && x !== undefined).length,
  ROUND: (a) => {
    const n = Number(a[0] ?? 0);
    const digits = Number(a[1] ?? 0);
    const f = Math.pow(10, digits);
    return Math.round(n * f) / f;
  },
  ABS: (a) => Math.abs(Number(a[0] ?? 0)),
  LEN: (a) => String(a[0] ?? "").length,
  CONCAT: (a) => a.map((x) => String(x ?? "")).join(""),
  IF: (a) => (truthy(a[0]) ? a[1] : a[2]),
};

function numericCount(a: (number | string)[]): number {
  return a.filter((x) => typeof x === "number" || (typeof x === "string" && x !== "" && !isNaN(Number(x)))).length;
}
function numOrZero(x: number | string): number {
  if (typeof x === "number") return x;
  const n = parseFloat(x);
  return isFinite(n) ? n : 0;
}
function truthy(x: number | string | undefined): boolean {
  if (x === undefined || x === null || x === "") return false;
  if (typeof x === "number") return x !== 0;
  return String(x).toLowerCase() !== "false";
}

/** Evaluate one cell's raw input. Returns computed value. */
export function evaluateCell(raw: string, ctx: Ctx): number | string {
  if (raw === undefined || raw === null) return "";
  const trimmed = String(raw).trim();
  if (trimmed.startsWith("=")) {
    try {
      const v = new Parser(trimmed.slice(1), ctx).parseExpr();
      return finalize(v);
    } catch (e) {
      return "#ERR";
    }
  }
  // Plain value — try number coercion
  if (trimmed === "") return "";
  const n = Number(trimmed);
  if (!isNaN(n) && /^[+\-]?[\d.]+$/.test(trimmed)) return n;
  return trimmed;
}

function finalize(v: unknown): number | string {
  if (typeof v === "number") {
    if (!isFinite(v)) return "#NUM!";
    // Trim float noise (1/3 → 0.3333333333333333 stays but 0.1+0.2 etc. clean up)
    if (Math.abs(v - Math.round(v)) < 1e-10) return Math.round(v);
    return Math.round(v * 1e10) / 1e10;
  }
  return String(v ?? "");
}

class Parser {
  private pos = 0;
  constructor(private src: string, private ctx: Ctx) {}

  /** expr := term (('+'|'-') term)* */
  parseExpr(): number | string {
    let v = this.parseTerm();
    while (true) {
      this.skipWs();
      const op = this.peek();
      if (op !== "+" && op !== "-") break;
      this.pos++;
      const rhs = this.parseTerm();
      v = (Number(v) || 0) + (op === "+" ? 1 : -1) * (Number(rhs) || 0);
    }
    return v;
  }
  /** term := factor (('*'|'/'|'%') factor)* */
  parseTerm(): number | string {
    let v = this.parseFactor();
    while (true) {
      this.skipWs();
      const op = this.peek();
      if (op !== "*" && op !== "/" && op !== "%") break;
      this.pos++;
      const rhs = this.parseFactor();
      const a = Number(v) || 0;
      const b = Number(rhs) || 0;
      if (op === "*") v = a * b;
      else if (op === "/") v = b === 0 ? "#DIV/0!" : a / b;
      else v = a % b;
    }
    return v;
  }
  /** factor := '-' factor | '(' expr ')' | NUMBER | STRING | CELL | FUNC '(' args ')' */
  parseFactor(): number | string {
    this.skipWs();
    const c = this.peek();
    if (c === "-") {
      this.pos++;
      const f = this.parseFactor();
      return -Number(f) || 0;
    }
    if (c === "(") {
      this.pos++;
      const v = this.parseExpr();
      this.skipWs();
      if (this.peek() === ")") this.pos++;
      return v;
    }
    if (c === '"') {
      // string literal
      this.pos++;
      let s = "";
      while (this.pos < this.src.length && this.peek() !== '"') s += this.src[this.pos++];
      if (this.peek() === '"') this.pos++;
      return s;
    }
    if (/[0-9.]/.test(c)) return this.parseNumber();
    if (/[A-Za-z]/.test(c)) return this.parseIdentLike();
    throw new Error("unexpected character: " + c);
  }
  parseNumber(): number {
    const m = /^[0-9]*\.?[0-9]+/.exec(this.src.slice(this.pos));
    if (!m) throw new Error("number");
    this.pos += m[0].length;
    return parseFloat(m[0]);
  }
  parseIdentLike(): number | string {
    const m = /^[A-Za-z]+/.exec(this.src.slice(this.pos));
    if (!m) throw new Error("ident");
    const ident = m[0];
    this.pos += ident.length;
    // Cell ref?
    if (/^[A-Z]+$/i.test(ident) && /^\d+/.test(this.src.slice(this.pos))) {
      const numMatch = /^\d+/.exec(this.src.slice(this.pos))!;
      this.pos += numMatch[0].length;
      const startKey = ident.toUpperCase() + numMatch[0];
      // Range?
      this.skipWs();
      if (this.peek() === ":") {
        this.pos++;
        const endMatch = /^([A-Za-z]+)(\d+)/.exec(this.src.slice(this.pos));
        if (!endMatch) throw new Error("range end");
        this.pos += endMatch[0].length;
        const endKey = endMatch[1].toUpperCase() + endMatch[2];
        // Range is only legal as a function argument; here returning the
        // sum of cells (so bare range becomes its sum).
        return this.sumRange(startKey, endKey);
      }
      return this.resolveCell(startKey);
    }
    // Function?
    this.skipWs();
    if (this.peek() === "(") {
      this.pos++;
      const args = this.parseArgs();
      this.skipWs();
      if (this.peek() === ")") this.pos++;
      const fn = FUNCS[ident.toUpperCase()];
      if (!fn) throw new Error("unknown function: " + ident);
      return fn(args);
    }
    // Bare identifier (TRUE / FALSE)
    if (ident.toUpperCase() === "TRUE") return 1;
    if (ident.toUpperCase() === "FALSE") return 0;
    throw new Error("unexpected ident: " + ident);
  }
  parseArgs(): (number | string)[] {
    const out: (number | string)[] = [];
    this.skipWs();
    if (this.peek() === ")") return out;
    while (true) {
      // Range argument?
      const rangeM = /^([A-Z]+)(\d+):([A-Z]+)(\d+)/i.exec(this.src.slice(this.pos));
      if (rangeM) {
        this.pos += rangeM[0].length;
        const startKey = rangeM[1].toUpperCase() + rangeM[2];
        const endKey = rangeM[3].toUpperCase() + rangeM[4];
        for (const v of this.expandRange(startKey, endKey)) out.push(v);
      } else {
        out.push(this.parseExpr());
      }
      this.skipWs();
      if (this.peek() === ",") {
        this.pos++;
        this.skipWs();
        continue;
      }
      break;
    }
    return out;
  }
  resolveCell(key: string): number | string {
    if (this.ctx.visited.has(key)) return "#REF!";
    this.ctx.visited.add(key);
    const cell = this.ctx.get(key);
    this.ctx.visited.delete(key);
    if (!cell) return 0;
    if (cell.v !== undefined) return cell.v;
    if (cell.raw === undefined) return 0;
    return evaluateCell(cell.raw, this.ctx);
  }
  expandRange(startKey: string, endKey: string): (number | string)[] {
    const a = parseCellKey(startKey);
    const b = parseCellKey(endKey);
    if (!a || !b) return [];
    const r0 = Math.min(a.row, b.row), r1 = Math.max(a.row, b.row);
    const c0 = Math.min(a.col, b.col), c1 = Math.max(a.col, b.col);
    const out: (number | string)[] = [];
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        out.push(this.resolveCell(cellKey(r, c)));
      }
    }
    return out;
  }
  sumRange(startKey: string, endKey: string): number {
    return this.expandRange(startKey, endKey).reduce<number>((n, x) => n + (Number(x) || 0), 0);
  }
  peek(): string { return this.src[this.pos] ?? ""; }
  skipWs() { while (this.pos < this.src.length && /\s/.test(this.src[this.pos])) this.pos++; }
}

/* ============================================
 * Sheet-wide evaluation helpers
 * ============================================ */

/** Recompute every cell with a formula in a sheet. Mutates in place. */
export function recomputeSheet(sheet: SpreadsheetSheet): void {
  const cells = sheet.cells;
  for (const [key, cell] of Object.entries(cells)) {
    if (cell.raw === undefined) continue;
    const visited = new Set<string>();
    visited.add(key);
    const v = evaluateCell(cell.raw, {
      get: (k) => cells[k],
      visited,
    });
    cell.v = v;
    if (cell.raw.startsWith("=")) cell.f = cell.raw;
    else delete cell.f;
  }
}

/** Update one cell and recompute every formula in the sheet (small sheets). */
export function setCellAndRecompute(sheet: SpreadsheetSheet, key: string, raw: string): void {
  if (raw === "" || raw === undefined) {
    delete sheet.cells[key];
  } else {
    sheet.cells[key] = { ...sheet.cells[key], raw };
  }
  recomputeSheet(sheet);
}
