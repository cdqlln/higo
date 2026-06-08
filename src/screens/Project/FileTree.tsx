import { useEffect, useRef, useState } from "react";
import { useStore } from "../../store";
import { skillById } from "../../lib/skills";
import type { Project, TreeNode } from "../../types";

const NODE_MIME = "application/x-workdeck-node";

export default function FileTree({ project }: { project: Project }) {
  const openFile = useStore((s) => s.openFile);
  const toggleFolder = useStore((s) => s.toggleFolder);
  const createNode = useStore((s) => s.createNode);
  const renameNode = useStore((s) => s.renameNode);
  const deleteNode = useStore((s) => s.deleteNode);
  const uploadFiles = useStore((s) => s.uploadFiles);
  const moveNode = useStore((s) => s.moveNode);
  const duplicateNode = useStore((s) => s.duplicateNode);
  const treeClipboard = useStore((s) => s.treeClipboard);
  const setTreeClipboard = useStore((s) => s.setTreeClipboard);
  const pasteTreeClipboard = useStore((s) => s.pasteTreeClipboard);
  const toggleProjectMcp = useStore((s) => s.toggleProjectMcp);
  const installed = useStore((s) => s.installedSkills);
  const pushToast = useStore((s) => s.pushToast);

  const [q, setQ] = useState("");
  const [menu, setMenu] = useState<{ nodeId: string | null; x: number; y: number } | null>(null);
  const [rename, setRename] = useState<{ id: string; value: string } | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const treeRef = useRef<HTMLElement>(null);
  const [uploadParent, setUploadParent] = useState<string | null>(null);

  const clipboardForMe =
    treeClipboard && treeClipboard.projectId === project.id ? treeClipboard : null;
  const canPaste = clipboardForMe !== null;

  async function handleFiles(files: FileList | File[], parentId: string | null) {
    setUploading(true);
    try {
      await uploadFiles(project.id, parentId, files);
    } finally {
      setUploading(false);
    }
  }

  // --- Keyboard shortcuts when this panel has focus ---
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!selectedId) return;
      const inEditable =
        document.activeElement instanceof HTMLElement &&
        (document.activeElement.isContentEditable ||
          ["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement.tagName));
      if (inEditable) return;
      const mod = e.metaKey || e.ctrlKey;
      if ((e.key === "Delete" || e.key === "Backspace") && !mod) {
        e.preventDefault();
        if (confirm("确定删除该项?")) {
          deleteNode(project.id, selectedId);
          setSelectedId(null);
        }
      } else if (mod && e.key.toLowerCase() === "c") {
        e.preventDefault();
        setTreeClipboard({ projectId: project.id, nodeId: selectedId, mode: "copy" });
        pushToast("已复制 · 用 ⌘V 粘贴", "ok");
      } else if (mod && e.key.toLowerCase() === "x") {
        e.preventDefault();
        setTreeClipboard({ projectId: project.id, nodeId: selectedId, mode: "cut" });
        pushToast("已剪切 · 用 ⌘V 粘贴", "ok");
      } else if (mod && e.key.toLowerCase() === "v") {
        e.preventDefault();
        // Paste into selected folder if it's a folder, else into root
        const sel = findById(project.fileTree, selectedId);
        const target =
          sel && sel.type === "folder" ? sel.id : null;
        const r = pasteTreeClipboard(target);
        if (!r.ok) pushToast(r.error ?? "粘贴失败", "warn");
      } else if (mod && e.key.toLowerCase() === "d") {
        e.preventDefault();
        const id = duplicateNode(project.id, selectedId);
        if (id) pushToast("已原地复制一份", "ok");
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    selectedId,
    project.id,
    project.fileTree,
    deleteNode,
    duplicateNode,
    pasteTreeClipboard,
    pushToast,
    setTreeClipboard,
  ]);

  // Filter that keeps folders that contain a matching child
  function filterTree(nodes: TreeNode[]): TreeNode[] {
    if (!q.trim()) return nodes;
    const lower = q.toLowerCase();
    return nodes
      .map((n) => {
        if (n.type === "file" && n.name.toLowerCase().includes(lower)) return n;
        if (n.children) {
          const kids = filterTree(n.children);
          if (kids.length > 0 || n.name.toLowerCase().includes(lower)) {
            return { ...n, children: kids, open: true } as TreeNode;
          }
        }
        return null;
      })
      .filter((n): n is TreeNode => Boolean(n));
  }

  const visible = filterTree(project.fileTree);

  const installedMcps = installed
    .map(skillById)
    .filter((s): s is NonNullable<typeof s> => Boolean(s))
    .filter((s) => s.kind === "mcp");

  function renderNode(n: TreeNode, depth = 0): React.ReactNode {
    const isFolder = n.type === "folder";
    const isActive = n.id === project.activeFileId;
    const isDropOver = dropTarget === n.id && isFolder;
    const isSelected = selectedId === n.id;
    const isDragging = draggingId === n.id;
    const isCut = clipboardForMe?.mode === "cut" && clipboardForMe.nodeId === n.id;
    return (
      <li
        key={n.id}
        className={
          (isFolder ? "ft-folder" : "ft-file") +
          (isFolder && n.open ? " open" : "") +
          (isActive ? " active" : "") +
          (isDropOver ? " drop-target" : "") +
          (isSelected ? " selected" : "") +
          (isDragging ? " dragging" : "") +
          (isCut ? " cut" : "")
        }
      >
        <div
          className="ft-row"
          style={{ paddingLeft: 8 + depth * 12 }}
          draggable
          onDragStart={(e) => {
            e.stopPropagation();
            setDraggingId(n.id);
            e.dataTransfer.effectAllowed = "move";
            e.dataTransfer.setData(NODE_MIME, n.id);
            e.dataTransfer.setData("text/plain", n.name);
          }}
          onDragEnd={() => {
            setDraggingId(null);
            setDropTarget(null);
          }}
          onClick={() => {
            setSelectedId(n.id);
            if (isFolder) toggleFolder(project.id, n.id);
            else openFile(project.id, n.id);
          }}
          onContextMenu={(e) => {
            e.preventDefault();
            setSelectedId(n.id);
            setMenu({ nodeId: n.id, x: e.clientX, y: e.clientY });
          }}
          onDragOver={
            isFolder
              ? (e) => {
                  const types = e.dataTransfer.types;
                  if (types.includes("Files") || types.includes(NODE_MIME)) {
                    e.preventDefault();
                    e.stopPropagation();
                    setDropTarget(n.id);
                    e.dataTransfer.dropEffect = types.includes("Files")
                      ? "copy"
                      : "move";
                  }
                }
              : undefined
          }
          onDragLeave={isFolder ? () => setDropTarget(null) : undefined}
          onDrop={
            isFolder
              ? (e) => {
                  const innerNode = e.dataTransfer.getData(NODE_MIME);
                  if (innerNode) {
                    e.preventDefault();
                    e.stopPropagation();
                    setDropTarget(null);
                    setDragOver(false);
                    moveNode(project.id, innerNode, n.id);
                    setDraggingId(null);
                    return;
                  }
                  if (e.dataTransfer.files.length > 0) {
                    e.preventDefault();
                    e.stopPropagation();
                    setDropTarget(null);
                    setDragOver(false);
                    void handleFiles(e.dataTransfer.files, n.id);
                  }
                }
              : undefined
          }
        >
          {isFolder ? (
            <span className="ft-caret">{n.open ? "▾" : "▸"}</span>
          ) : (
            <span className="ft-caret" />
          )}
          <span className="ft-icon">{isFolder ? "📁" : n.icon ?? "📄"}</span>
          {rename && rename.id === n.id ? (
            <input
              autoFocus
              className="ft-rename"
              value={rename.value}
              onChange={(e) => setRename({ id: n.id, value: e.target.value })}
              onClick={(e) => e.stopPropagation()}
              onBlur={() => {
                if (rename.value.trim()) renameNode(project.id, n.id, rename.value.trim());
                setRename(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  if (rename.value.trim()) renameNode(project.id, n.id, rename.value.trim());
                  setRename(null);
                }
                if (e.key === "Escape") setRename(null);
              }}
            />
          ) : (
            <span className="ft-name">{n.name}</span>
          )}
          {isFolder && n.children && (
            <span className="ft-badge">{n.children.length}</span>
          )}
        </div>
        {isFolder && n.open && n.children && (
          <ul>{n.children.map((c) => renderNode(c, depth + 1))}</ul>
        )}
      </li>
    );
  }

  return (
    <aside
      ref={treeRef}
      className={"ide-filetree" + (dragOver ? " drag-over" : "")}
      tabIndex={-1}
      onDragOver={(e) => {
        const types = e.dataTransfer.types;
        if (types.includes("Files") || types.includes(NODE_MIME)) {
          e.preventDefault();
          if (types.includes("Files")) setDragOver(true);
        }
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setDragOver(false);
      }}
      onDrop={(e) => {
        const innerNode = e.dataTransfer.getData(NODE_MIME);
        if (innerNode) {
          // Only treat as root-drop if landed on the panel itself, not bubbled
          // up from a folder (folder handler does its own move).
          e.preventDefault();
          setDragOver(false);
          setDropTarget(null);
          moveNode(project.id, innerNode, null);
          setDraggingId(null);
          return;
        }
        if (e.dataTransfer.files.length > 0) {
          e.preventDefault();
          setDragOver(false);
          setDropTarget(null);
          void handleFiles(e.dataTransfer.files, null);
        }
      }}
    >
      <input
        ref={fileInputRef}
        type="file"
        multiple
        style={{ display: "none" }}
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0) {
            void handleFiles(e.target.files, uploadParent);
            e.target.value = "";
          }
        }}
      />
      {dragOver && (
        <div className="ft-drop-overlay">
          <div className="ft-drop-icon">⇪</div>
          <div className="ft-drop-text">拖放以上传到项目</div>
          <div className="ft-drop-sub">支持 文档 · 图片 · PDF · 数据表 · 单文件 &lt; 4 MB</div>
        </div>
      )}
      {uploading && (
        <div className="ft-uploading">
          <span className="ft-spinner" /> 上传中…
        </div>
      )}
      <div className="ft-header">
        <span>项目文件</span>
        <div className="ft-h-actions">
          <button
            title="上传文件 (或拖放至此)"
            onClick={() => {
              setUploadParent(null);
              fileInputRef.current?.click();
            }}
          >
            ⇪
          </button>
          <button
            title="新建文件"
            onClick={() => {
              const name = prompt("文件名(含扩展名):", "未命名.docx");
              if (name?.trim()) createNode(project.id, null, { type: "file", name: name.trim() });
            }}
          >
            +
          </button>
          <button
            title="新建文件夹"
            onClick={() => {
              const name = prompt("文件夹名:", "新建文件夹");
              if (name?.trim())
                createNode(project.id, null, { type: "folder", name: name.trim() });
            }}
          >
            ⊞
          </button>
        </div>
      </div>
      <div className="ft-search">
        <input
          placeholder="搜索文件..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>
      <ul className="ft-tree">{visible.map((n) => renderNode(n))}</ul>

      <div className="ft-divider" />
      <div className="ft-mcp-section">
        <div className="ft-mcp-title">已挂载 MCP · {project.mountedMcp.length}</div>
        {installedMcps.length === 0 && (
          <div className="ft-mcp-empty">未安装 MCP — 去技能市场添加</div>
        )}
        {installedMcps.map((s) => {
          const mounted = project.mountedMcp.includes(s.id);
          return (
            <div
              key={s.id}
              className={"mcp-pill" + (mounted ? "" : " off")}
              onClick={() => toggleProjectMcp(project.id, s.id)}
              title={mounted ? "点击卸载" : "点击挂载"}
            >
              <span className={"mcp-dot" + (mounted ? "" : " off")} />
              {s.name}
            </div>
          );
        })}
      </div>

      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          items={(() => {
            const node = menu.nodeId
              ? findById(project.fileTree, menu.nodeId)
              : null;
            const isFolder = node?.type === "folder";
            const items: {
              label: string;
              onClick: () => void;
              danger?: boolean;
              disabled?: boolean;
              divider?: boolean;
            }[] = [];
            if (isFolder || node === null) {
              items.push({
                label: "上传文件到此处...",
                onClick: () => {
                  setUploadParent(menu.nodeId);
                  fileInputRef.current?.click();
                },
              });
              items.push({
                label: "新建文件",
                onClick: () => {
                  const name = prompt("文件名:", "新文件.docx");
                  if (name?.trim())
                    createNode(project.id, menu.nodeId, {
                      type: "file",
                      name: name.trim(),
                    });
                },
              });
              items.push({
                label: "新建子文件夹",
                onClick: () => {
                  const name = prompt("文件夹名:", "新建文件夹");
                  if (name?.trim())
                    createNode(project.id, menu.nodeId, {
                      type: "folder",
                      name: name.trim(),
                    });
                },
              });
              items.push({ label: "", onClick: () => {}, divider: true });
            }
            if (node) {
              items.push({
                label: "复制  ⌘C",
                onClick: () => {
                  setTreeClipboard({
                    projectId: project.id,
                    nodeId: node.id,
                    mode: "copy",
                  });
                  pushToast("已复制", "ok");
                },
              });
              items.push({
                label: "剪切  ⌘X",
                onClick: () => {
                  setTreeClipboard({
                    projectId: project.id,
                    nodeId: node.id,
                    mode: "cut",
                  });
                  pushToast("已剪切 · 粘贴位置后会移动", "ok");
                },
              });
            }
            items.push({
              label: canPaste ? "粘贴  ⌘V" : "粘贴(剪贴板为空)",
              disabled: !canPaste,
              onClick: () => {
                const target = isFolder ? menu.nodeId : null;
                const r = pasteTreeClipboard(target);
                if (!r.ok) pushToast(r.error ?? "粘贴失败", "warn");
              },
            });
            if (node) {
              items.push({
                label: "原地复制一份  ⌘D",
                onClick: () => {
                  duplicateNode(project.id, node.id);
                  pushToast("已复制一份", "ok");
                },
              });
              items.push({ label: "", onClick: () => {}, divider: true });
              items.push({
                label: "重命名",
                onClick: () => {
                  setRename({ id: node.id, value: node.name });
                },
              });
              items.push({
                label: "删除  Del",
                danger: true,
                onClick: () => {
                  if (confirm("确定删除?")) deleteNode(project.id, node.id);
                },
              });
            }
            return items;
          })()}
          onClose={() => setMenu(null)}
        />
      )}
    </aside>
  );
}

function findById(tree: TreeNode[], id: string): TreeNode | null {
  for (const n of tree) {
    if (n.id === id) return n;
    if (n.children) {
      const f = findById(n.children, id);
      if (f) return f;
    }
  }
  return null;
}

function ContextMenu({
  x,
  y,
  items,
  onClose,
}: {
  x: number;
  y: number;
  items: {
    label: string;
    onClick: () => void;
    danger?: boolean;
    disabled?: boolean;
    divider?: boolean;
  }[];
  onClose: () => void;
}) {
  return (
    <>
      <div
        className="ctx-backdrop"
        onClick={onClose}
        onContextMenu={(e) => {
          e.preventDefault();
          onClose();
        }}
      />
      <div className="ctx-menu" style={{ left: x, top: y }}>
        {items.map((it, i) =>
          it.divider ? (
            <div key={i} className="ctx-divider" />
          ) : (
            <button
              key={i}
              className={
                "ctx-item" +
                (it.danger ? " danger" : "") +
                (it.disabled ? " disabled" : "")
              }
              disabled={it.disabled}
              onClick={() => {
                if (it.disabled) return;
                it.onClick();
                onClose();
              }}
            >
              {it.label}
            </button>
          ),
        )}
      </div>
    </>
  );
}
