import { useParams, useNavigate, Navigate } from "react-router-dom";
import { useStore, useProject } from "../../store";
import FileTree from "./FileTree";
import Editor from "./Editor";
import Agent from "./Agent";
import Essentials from "./Essentials";
import { useEffect, useState } from "react";

const DOMAIN_LABEL: Record<string, string> = {
  "M&A": "并购",
  Administrative: "行政",
  Compliance: "合规",
  Arbitration: "仲裁",
  "Capital Markets": "资本市场",
  IP: "知识产权",
};

export default function ProjectScreen() {
  const { id } = useParams<{ id: string }>();
  const nav = useNavigate();
  const project = useProject(id);
  const closeFile = useStore((s) => s.closeFile);
  const setActiveFile = useStore((s) => s.setActiveFile);
  const openFile = useStore((s) => s.openFile);
  const [agentCollapsed, setAgentCollapsed] = useState(false);

  // Auto-open first file when entering a project with no tabs
  useEffect(() => {
    if (!project) return;
    if (project.openFileIds.length === 0) {
      const first = findFirstFile(project.fileTree);
      if (first) openFile(project.id, first.id);
    }
  }, [project, openFile]);

  if (!id || !project) return <Navigate to="/workspace" replace />;

  const openTabs = project.openFileIds
    .map((fid) => findById(project.fileTree, fid))
    .filter((x): x is NonNullable<typeof x> => Boolean(x));
  const active = project.activeFileId
    ? findById(project.fileTree, project.activeFileId) ?? null
    : null;

  return (
    <section className="screen screen-project">
      <div className="ide-topbar">
        <div className="ide-breadcrumb">
          <span className="bc-back" onClick={() => nav("/workspace")}>
            ‹ 工作台
          </span>
          <span className="bc-sep">/</span>
          <span className="bc-domain">{DOMAIN_LABEL[project.domain] ?? project.domain}</span>
          <span className="bc-sep">/</span>
          <span className="bc-proj">{project.name}</span>
        </div>
        <div className="ide-tabs">
          {openTabs.map((f) => (
            <div
              key={f.id}
              className={"ide-tab" + (f.id === project.activeFileId ? " active" : "")}
              onClick={() => setActiveFile(project.id, f.id)}
            >
              <span className="tab-icon">{f.icon ?? "📄"}</span>
              <span>{f.name}</span>
              <span
                className="tab-close"
                onClick={(e) => {
                  e.stopPropagation();
                  closeFile(project.id, f.id);
                }}
              >
                ×
              </span>
            </div>
          ))}
        </div>
        <div className="ide-actions">
          <button
            className="ide-icon-btn"
            title={agentCollapsed ? "展开 Agent" : "折叠 Agent"}
            onClick={() => setAgentCollapsed((v) => !v)}
          >
            {agentCollapsed ? "⇤" : "⇥"}
          </button>
        </div>
      </div>

      <div className={"ide-body" + (agentCollapsed ? " agent-collapsed" : "")}>
        <FileTree project={project} />
        <main className="ide-editor">
          <Editor project={project} file={active} />
          <Essentials />
        </main>
        {!agentCollapsed && <Agent project={project} />}
      </div>
    </section>
  );
}

/* helpers */
function findById(
  tree: import("../../types").TreeNode[],
  id: string,
): import("../../types").TreeNode | null {
  for (const n of tree) {
    if (n.id === id) return n;
    if (n.children) {
      const f = findById(n.children, id);
      if (f) return f;
    }
  }
  return null;
}

function findFirstFile(
  tree: import("../../types").TreeNode[],
): import("../../types").TreeNode | null {
  for (const n of tree) {
    if (n.type === "file") return n;
    if (n.children) {
      const f = findFirstFile(n.children);
      if (f) return f;
    }
  }
  return null;
}
