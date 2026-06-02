import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useStore } from "../store";
import type { Domain, Project, ProjectStatus } from "../types";

const STATUS_LABEL: Record<ProjectStatus, string> = {
  active: "进行中",
  urgent: "紧急",
  draft: "草稿",
  completed: "已完成",
  archived: "归档",
};

const STATUS_CLS: Record<ProjectStatus, string> = {
  active: "status-active",
  urgent: "status-urgent",
  draft: "status-draft",
  completed: "status-active",
  archived: "status-draft",
};

const DOMAIN_LABEL: Record<Domain, string> = {
  "M&A": "并购 · M&A",
  Administrative: "行政 · Administrative",
  Compliance: "合规 · Compliance",
  Arbitration: "仲裁 · Arbitration",
  "Capital Markets": "资本市场 · Capital Markets",
  IP: "知识产权 · IP",
};

type Filter = ProjectStatus | "all" | "starred";

function formatRelative(ts: number): string {
  const d = Date.now() - ts;
  const m = Math.floor(d / 60000);
  if (m < 1) return "刚刚";
  if (m < 60) return `${m} 分钟前`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} 小时前`;
  const day = Math.floor(h / 24);
  return `${day} 天前`;
}

export default function Workspace() {
  const nav = useNavigate();
  const projects = useStore((s) => s.projects);
  const createProject = useStore((s) => s.createProject);
  const deleteProject = useStore((s) => s.deleteProject);
  const toggleStar = useStore((s) => s.toggleStar);
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");
  const [creating, setCreating] = useState(false);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: projects.length, starred: 0 };
    for (const p of projects) {
      c[p.status] = (c[p.status] ?? 0) + 1;
      if (p.starred) c.starred++;
    }
    return c;
  }, [projects]);

  const filtered = useMemo(() => {
    let list = projects;
    if (filter === "starred") list = list.filter((p) => p.starred);
    else if (filter !== "all") list = list.filter((p) => p.status === filter);
    if (q.trim()) {
      const lower = q.toLowerCase();
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(lower) ||
          p.client.toLowerCase().includes(lower),
      );
    }
    return [...list].sort((a, b) => b.updatedAt - a.updatedAt);
  }, [projects, filter, q]);

  const domainGroups = useMemo(() => {
    const m: Record<string, number> = {};
    for (const p of projects) m[p.domain] = (m[p.domain] ?? 0) + 1;
    return m;
  }, [projects]);

  return (
    <section className="screen screen-workspace">
      <aside className="ws-sidebar">
        <div className="ws-side-title">个人工作台</div>
        <ul className="ws-side-nav">
          <li
            className={filter === "all" ? "active" : ""}
            onClick={() => setFilter("all")}
          >
            <span className="ws-dot dot-blue" /> 全部 <span className="ws-count">{counts.all}</span>
          </li>
          <li
            className={filter === "active" ? "active" : ""}
            onClick={() => setFilter("active")}
          >
            <span className="ws-dot dot-blue" /> 活跃 <span className="ws-count">{counts.active ?? 0}</span>
          </li>
          <li
            className={filter === "draft" ? "active" : ""}
            onClick={() => setFilter("draft")}
          >
            <span className="ws-dot dot-amber" /> 草稿 <span className="ws-count">{counts.draft ?? 0}</span>
          </li>
          <li
            className={filter === "urgent" ? "active" : ""}
            onClick={() => setFilter("urgent")}
          >
            <span className="ws-dot dot-rose" /> 紧急 <span className="ws-count">{counts.urgent ?? 0}</span>
          </li>
          <li
            className={filter === "starred" ? "active" : ""}
            onClick={() => setFilter("starred")}
          >
            <span className="ws-dot dot-teal" /> 收藏 <span className="ws-count">{counts.starred}</span>
          </li>
        </ul>
        <div className="ws-side-divider" />
        <div className="ws-side-label">按业务领域</div>
        <ul className="ws-side-tags">
          {Object.entries(domainGroups).map(([k, v]) => (
            <li key={k}>{DOMAIN_LABEL[k as Domain] ?? k} ({v})</li>
          ))}
        </ul>
        <div className="ws-side-divider" />
        <button className="ws-new-btn" onClick={() => setCreating(true)}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path d="M12 5v14M5 12h14" />
          </svg>
          新建项目
        </button>
      </aside>

      <main className="ws-main">
        <div className="ws-header">
          <div>
            <div className="ws-h-kicker">个人工作台</div>
            <h2 className="ws-h-title">
              {filter === "all"
                ? "所有项目"
                : filter === "starred"
                ? "收藏项目"
                : STATUS_LABEL[filter] + "项目"}
            </h2>
          </div>
          <div className="ws-filters">
            <div className="ws-search">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.35-4.35" />
              </svg>
              <input
                placeholder="搜索项目、客户..."
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="ws-empty">
            <div className="ws-empty-icon">📂</div>
            <div className="ws-empty-title">没有项目</div>
            <div className="ws-empty-sub">点击左下"新建项目"开始</div>
          </div>
        ) : (
          <div className="ws-grid">
            {filtered.map((p) => (
              <ProjectCard
                key={p.id}
                p={p}
                onOpen={() => nav("/project/" + p.id)}
                onStar={() => toggleStar(p.id)}
                onDelete={() => {
                  if (confirm("确定删除该项目?")) deleteProject(p.id);
                }}
              />
            ))}
          </div>
        )}
      </main>

      {creating && (
        <NewProjectDialog
          onCancel={() => setCreating(false)}
          onCreate={(data) => {
            const id = createProject(data);
            setCreating(false);
            nav("/project/" + id);
          }}
        />
      )}
    </section>
  );
}

function ProjectCard({
  p,
  onOpen,
  onStar,
  onDelete,
}: {
  p: Project;
  onOpen: () => void;
  onStar: () => void;
  onDelete: () => void;
}) {
  const fileCount = countFiles(p.fileTree);
  return (
    <article
      className={"proj-card" + (p.status === "active" ? " proj-active" : "")}
      onClick={onOpen}
    >
      <header className="proj-card-head">
        <div className="proj-domain">{DOMAIN_LABEL[p.domain]}</div>
        <div className={"proj-status " + STATUS_CLS[p.status]}>
          {STATUS_LABEL[p.status]}
        </div>
      </header>
      <h3 className="proj-name">{p.name}</h3>
      <div className="proj-client">客户:{p.client || "(未填写)"}</div>
      <div className="proj-stats">
        <div>
          <span>{fileCount}</span> 文件
        </div>
        <div>
          <span>{p.agentTasks}</span> Agent 任务
        </div>
        <div>
          <span>
            {p.milestones.done}/{p.milestones.total}
          </span>{" "}
          里程碑
        </div>
      </div>
      <div className="proj-progress">
        <div
          className="proj-progress-bar"
          style={{
            width: `${Math.round(p.progress * 100)}%`,
            background:
              p.status === "urgent"
                ? "#D97706"
                : p.status === "draft"
                ? "#0D9488"
                : undefined,
          }}
        />
      </div>
      <footer className="proj-foot">
        <div className="proj-team">
          {p.team.slice(0, 4).map((t, i) => (
            <span key={i} className="proj-avatar">
              {t}
            </span>
          ))}
        </div>
        <div className="proj-actions" onClick={(e) => e.stopPropagation()}>
          <button
            className="proj-icon-btn"
            title={p.starred ? "取消收藏" : "收藏"}
            onClick={onStar}
            style={{ color: p.starred ? "#D4AF6A" : undefined }}
          >
            {p.starred ? "★" : "☆"}
          </button>
          <button className="proj-icon-btn" title="删除" onClick={onDelete}>
            ×
          </button>
          <div className="proj-time">{formatRelative(p.updatedAt)}</div>
        </div>
      </footer>
    </article>
  );
}

function NewProjectDialog({
  onCancel,
  onCreate,
}: {
  onCancel: () => void;
  onCreate: (p: Partial<Project>) => void;
}) {
  const [name, setName] = useState("");
  const [client, setClient] = useState("");
  const [domain, setDomain] = useState<Domain>("M&A");
  return (
    <div className="modal-bd" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-title">新建项目</div>
        <div className="modal-field">
          <label>项目名称</label>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="例:深创投 × 海纳光电"
          />
        </div>
        <div className="modal-field">
          <label>客户</label>
          <input
            value={client}
            onChange={(e) => setClient(e.target.value)}
            placeholder="例:深圳创新投资集团"
          />
        </div>
        <div className="modal-field">
          <label>业务领域</label>
          <select value={domain} onChange={(e) => setDomain(e.target.value as Domain)}>
            {Object.entries(DOMAIN_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </div>
        <div className="modal-actions">
          <button onClick={onCancel}>取消</button>
          <button
            className="primary"
            disabled={!name.trim()}
            onClick={() =>
              onCreate({
                name: name.trim(),
                client: client.trim(),
                domain,
                status: "draft",
              })
            }
          >
            创建
          </button>
        </div>
      </div>
    </div>
  );
}

function countFiles(tree: import("../types").TreeNode[]): number {
  let n = 0;
  function walk(ns: import("../types").TreeNode[]) {
    for (const node of ns) {
      if (node.type === "file") n++;
      if (node.children) walk(node.children);
    }
  }
  walk(tree);
  return n;
}
