/* Browser file-upload helpers.
 *
 * Routing rules:
 *   - Text-like (txt/md/html/json/csv/...) → readAsText, stored in `content`
 *   - Image/PDF/binary                      → readAsDataURL, stored in `binaryData`
 *
 * Constraints (localStorage has ~5–10 MB total quota across the whole store):
 *   - Single file > 4 MB is rejected
 *   - Single file > 1.5 MB triggers a warning toast
 */

export const MAX_SINGLE_FILE_BYTES = 4 * 1024 * 1024;
export const WARN_FILE_BYTES = 1.5 * 1024 * 1024;

export type UploadKind = "text" | "image" | "pdf" | "binary";

export interface UploadedFile {
  name: string;
  kind: UploadKind;
  mimeType: string;
  size: number;
  /** for "text" kind — rendered HTML ready for the editor */
  content?: string;
  /** for non-text kinds — full data: URL */
  binaryData?: string;
}

const TEXT_EXTS = new Set([
  "txt", "md", "markdown", "html", "htm", "json", "csv", "tsv",
  "log", "yaml", "yml", "xml", "ini", "conf",
  "ts", "tsx", "js", "jsx", "css", "py", "rb", "go", "java", "c", "cpp", "rs",
]);

const TEXT_MIME_PREFIXES = ["text/", "application/json", "application/xml", "application/javascript"];

function extOf(name: string): string {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i + 1).toLowerCase() : "";
}

function classifyKind(file: File): UploadKind {
  const ext = extOf(file.name);
  const mime = file.type || "";
  if (mime === "application/pdf" || ext === "pdf") return "pdf";
  if (mime.startsWith("image/")) return "image";
  if (TEXT_EXTS.has(ext)) return "text";
  if (TEXT_MIME_PREFIXES.some((p) => mime.startsWith(p))) return "text";
  return "binary";
}

export function fileIconFor(kind: UploadKind, name: string): string {
  const ext = extOf(name);
  if (kind === "image") return "🖼";
  if (kind === "pdf") return "📕";
  if (ext === "docx" || ext === "doc") return "📄";
  if (ext === "xlsx" || ext === "xls" || ext === "csv") return "📊";
  if (ext === "md") return "📝";
  if (ext === "json") return "🤖";
  if (ext === "html") return "🌐";
  return "📄";
}

export function formatBytes(b: number): string {
  if (b < 1024) return b + " B";
  if (b < 1024 * 1024) return (b / 1024).toFixed(1) + " KB";
  return (b / 1024 / 1024).toFixed(2) + " MB";
}

function readAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onerror = () => reject(r.error);
    r.onload = () => resolve(typeof r.result === "string" ? r.result : "");
    r.readAsText(file);
  });
}

function readAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onerror = () => reject(r.error);
    r.onload = () => resolve(typeof r.result === "string" ? r.result : "");
    r.readAsDataURL(file);
  });
}

/** Read a single File and return UploadedFile, or throw if too large. */
export async function readFile(file: File): Promise<UploadedFile> {
  if (file.size > MAX_SINGLE_FILE_BYTES) {
    throw new Error(
      `文件 ${file.name} 过大(${formatBytes(file.size)},上限 ${formatBytes(MAX_SINGLE_FILE_BYTES)})`,
    );
  }
  const kind = classifyKind(file);
  const mime = file.type || guessMime(file.name, kind);
  const base = { name: file.name, kind, mimeType: mime, size: file.size };
  if (kind === "text") {
    const raw = await readAsText(file);
    const ext = extOf(file.name);
    let content: string;
    if (ext === "html" || ext === "htm") {
      content = raw
        .replace(/^[\s\S]*?<body[^>]*>/i, "")
        .replace(/<\/body>[\s\S]*$/i, "")
        .trim() || `<pre>${escapeHtml(raw)}</pre>`;
    } else if (ext === "md" || ext === "markdown") {
      content = renderMarkdownLite(raw);
    } else if (ext === "json") {
      try {
        content = `<pre>${escapeHtml(JSON.stringify(JSON.parse(raw), null, 2))}</pre>`;
      } catch {
        content = `<pre>${escapeHtml(raw)}</pre>`;
      }
    } else if (ext === "csv" || ext === "tsv") {
      content = renderCsv(raw, ext === "tsv" ? "\t" : ",");
    } else {
      content = `<pre>${escapeHtml(raw)}</pre>`;
    }
    return { ...base, content };
  }
  const binaryData = await readAsDataURL(file);
  return { ...base, binaryData };
}

function guessMime(name: string, kind: UploadKind): string {
  const ext = extOf(name);
  if (kind === "pdf") return "application/pdf";
  if (ext === "png") return "image/png";
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "gif") return "image/gif";
  if (ext === "svg") return "image/svg+xml";
  if (ext === "webp") return "image/webp";
  return "application/octet-stream";
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderMarkdownLite(md: string): string {
  const lines = md.split(/\r?\n/);
  const out: string[] = [];
  let inUl = false;
  let inCode = false;
  for (const line of lines) {
    if (/^```/.test(line)) {
      inCode = !inCode;
      out.push(inCode ? "<pre><code>" : "</code></pre>");
      continue;
    }
    if (inCode) {
      out.push(escapeHtml(line));
      continue;
    }
    if (/^\s*$/.test(line)) {
      if (inUl) { out.push("</ul>"); inUl = false; }
      continue;
    }
    if (/^#\s+/.test(line)) { out.push(`<h1>${inline(line.replace(/^#\s+/, ""))}</h1>`); continue; }
    if (/^##\s+/.test(line)) { out.push(`<h2>${inline(line.replace(/^##\s+/, ""))}</h2>`); continue; }
    if (/^###\s+/.test(line)) { out.push(`<h3>${inline(line.replace(/^###\s+/, ""))}</h3>`); continue; }
    if (/^[-*]\s+/.test(line)) {
      if (!inUl) { out.push("<ul>"); inUl = true; }
      out.push(`<li>${inline(line.replace(/^[-*]\s+/, ""))}</li>`);
      continue;
    }
    if (inUl) { out.push("</ul>"); inUl = false; }
    out.push(`<p>${inline(line)}</p>`);
  }
  if (inUl) out.push("</ul>");
  return out.join("\n");
}

function inline(s: string): string {
  return escapeHtml(s)
    .replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*([^*]+)\*/g, "<i>$1</i>");
}

function renderCsv(text: string, sep: string): string {
  const rows = text
    .trim()
    .split(/\r?\n/)
    .map((r) => r.split(sep).map((c) => escapeHtml(c.trim())));
  const head = rows.shift() ?? [];
  return (
    `<table><thead><tr>${head.map((h) => `<th>${h}</th>`).join("")}</tr></thead>` +
    `<tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`).join("")}</tbody></table>`
  );
}
