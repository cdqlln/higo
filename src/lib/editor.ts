/* Helpers for editing inside an HTML <table> via DOM (queryCommand-style
 * APIs for tables are not standardised). All operations work on the
 * currently-selected cell — call findActiveCell() from a selectionchange
 * handler to know what's active.
 */

export function findActiveCell(root: HTMLElement): HTMLTableCellElement | null {
  const sel = document.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  let node: Node | null = sel.anchorNode;
  while (node && node !== root) {
    if (node instanceof HTMLTableCellElement) return node;
    node = node.parentNode;
  }
  return null;
}

export function activeTable(cell: HTMLTableCellElement): HTMLTableElement | null {
  let n: HTMLElement | null = cell;
  while (n && !(n instanceof HTMLTableElement)) n = n.parentElement;
  return n;
}

function cellIndex(cell: HTMLTableCellElement): number {
  const row = cell.parentElement as HTMLTableRowElement | null;
  if (!row) return 0;
  return Array.from(row.cells).indexOf(cell);
}

function rowIndex(cell: HTMLTableCellElement): number {
  const row = cell.parentElement as HTMLTableRowElement | null;
  if (!row) return 0;
  const tbl = activeTable(cell);
  if (!tbl) return 0;
  return Array.from(tbl.rows).indexOf(row);
}

export function insertRow(cell: HTMLTableCellElement, where: "above" | "below") {
  const tbl = activeTable(cell);
  const row = cell.parentElement as HTMLTableRowElement | null;
  if (!tbl || !row) return;
  const cols = row.cells.length;
  const newRow = tbl.insertRow(where === "above" ? row.rowIndex : row.rowIndex + 1);
  for (let i = 0; i < cols; i++) {
    const td = newRow.insertCell(i);
    td.innerHTML = "&nbsp;";
  }
}

export function insertColumn(cell: HTMLTableCellElement, where: "left" | "right") {
  const tbl = activeTable(cell);
  if (!tbl) return;
  const ci = cellIndex(cell);
  const insertAt = where === "left" ? ci : ci + 1;
  for (const r of Array.from(tbl.rows)) {
    const isHeaderRow = r.cells[0] && r.cells[0].tagName === "TH";
    const refCell = r.cells[insertAt] ?? null;
    const newCell = document.createElement(isHeaderRow ? "th" : "td");
    newCell.innerHTML = "&nbsp;";
    r.insertBefore(newCell, refCell);
  }
}

export function deleteRow(cell: HTMLTableCellElement) {
  const tbl = activeTable(cell);
  if (!tbl) return;
  if (tbl.rows.length <= 1) {
    deleteTable(cell);
    return;
  }
  tbl.deleteRow(rowIndex(cell));
}

export function deleteColumn(cell: HTMLTableCellElement) {
  const tbl = activeTable(cell);
  if (!tbl) return;
  const ci = cellIndex(cell);
  if (tbl.rows[0]?.cells.length <= 1) {
    deleteTable(cell);
    return;
  }
  for (const r of Array.from(tbl.rows)) {
    if (r.cells[ci]) r.deleteCell(ci);
  }
}

export function deleteTable(cell: HTMLTableCellElement) {
  const tbl = activeTable(cell);
  tbl?.remove();
}

export function toggleHeaderRow(cell: HTMLTableCellElement) {
  const tbl = activeTable(cell);
  if (!tbl) return;
  const firstRow = tbl.rows[0];
  if (!firstRow) return;
  const isHeader = firstRow.cells[0]?.tagName === "TH";
  for (const c of Array.from(firstRow.cells)) {
    const tag = isHeader ? "td" : "th";
    const nu = document.createElement(tag);
    nu.innerHTML = c.innerHTML;
    c.replaceWith(nu);
  }
}

/** Build a fresh table HTML, optionally with a header row. */
export function buildTableHtml(rows: number, cols: number, withHeader = true): string {
  const head = withHeader
    ? `<thead><tr>${Array.from({ length: cols }, () => `<th>&nbsp;</th>`).join("")}</tr></thead>`
    : "";
  const body =
    "<tbody>" +
    Array.from({ length: withHeader ? rows - 1 : rows }, () =>
      `<tr>${Array.from({ length: cols }, () => `<td>&nbsp;</td>`).join("")}</tr>`,
    ).join("") +
    "</tbody>";
  return `<table>${head}${body}</table><p></p>`;
}

/** Move focus to the cell after `cell` (next column, or next row's first
 *  column). Adds a new row if `cell` is the last cell of the last row. */
export function focusNextCell(cell: HTMLTableCellElement): void {
  const tbl = activeTable(cell);
  if (!tbl) return;
  const row = cell.parentElement as HTMLTableRowElement | null;
  if (!row) return;
  const ci = cellIndex(cell);
  const ri = rowIndex(cell);
  let target: HTMLTableCellElement | null = null;
  if (row.cells[ci + 1]) {
    target = row.cells[ci + 1];
  } else if (tbl.rows[ri + 1]) {
    target = tbl.rows[ri + 1].cells[0];
  } else {
    insertRow(cell, "below");
    target = tbl.rows[ri + 1]?.cells[0] ?? null;
  }
  if (target) {
    const range = document.createRange();
    range.selectNodeContents(target);
    range.collapse(false);
    const sel = document.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
    target.focus?.();
  }
}

export function countWords(html: string): { words: number; chars: number } {
  // strip tags, then count
  const text = html.replace(/<[^>]+>/g, " ").replace(/&[a-z]+;/g, " ");
  const chars = text.replace(/\s+/g, "").length;
  // Chinese CJK counts as one word each; latin words split by whitespace
  const cjkCount = (text.match(/[一-鿿㐀-䶿]/g) ?? []).length;
  const latinCount = (
    text.replace(/[一-鿿㐀-䶿]/g, " ").match(/[A-Za-z0-9]+/g) ?? []
  ).length;
  return { words: cjkCount + latinCount, chars };
}
