import { useNavigate, Link } from "react-router-dom";
import { useCurrentUser, useStore, useUserProjects } from "../store";

const domainBadge: Record<string, { txt: string; cls: string }> = {
  "M&A": { txt: "M&A", cls: "icon-blue" },
  Administrative: { txt: "行政", cls: "icon-amber" },
  Compliance: { txt: "合规", cls: "icon-teal" },
  Arbitration: { txt: "仲裁", cls: "icon-rose" },
  "Capital Markets": { txt: "资本", cls: "icon-blue" },
  IP: { txt: "知产", cls: "icon-rose" },
};

const statusLabel: Record<string, string> = {
  active: "活跃",
  urgent: "紧急",
  draft: "草稿",
  completed: "已完成",
  archived: "归档",
};

function formatRelative(ts: number): string {
  const d = Date.now() - ts;
  const m = Math.floor(d / 60000);
  if (m < 60) return `${m} 分钟前`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} 小时前`;
  const day = Math.floor(h / 24);
  return `${day} 天前`;
}

export default function Launch() {
  const nav = useNavigate();
  const user = useCurrentUser();
  const projects = useUserProjects();
  const createProject = useStore((s) => s.createProject);

  const recent = [...projects].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 5);

  return (
    <section className="screen screen-launch">
      <div className="launch-inner">
        <div className="launch-hero">
          <div className="kicker">
            <span className="kicker-dot" />
            {user ? `${user.name},欢迎回来` : "One Deck for All"}
          </div>
          <h1 className="launch-title">
            一个工作台,
            <br />
            所有法律工作 <span className="title-accent">在此完成</span>
          </h1>
          <p className="launch-sub">
            起草、检索、审阅、出庭准备——律师无需离开,所有动作发生在同一个连续环境中。
            <br />
            IDE 在你想到要问之前就已经准备好了。
          </p>
          <div className="launch-cta-row">
            <button
              className="cta-primary"
              onClick={() => {
                const id = createProject({
                  name: "新项目 · " + new Date().toLocaleDateString(),
                  client: "(待填写)",
                  domain: "M&A",
                  status: "draft",
                });
                nav("/project/" + id);
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path d="M12 5v14M5 12h14" />
              </svg>
              新建项目
            </button>
            <Link to="/workspace" className="cta-secondary">打开最近项目</Link>
            <Link to="/marketplace" className="cta-secondary">浏览技能市场</Link>
          </div>
        </div>

        <div className="launch-side">
          <div className="recent-card">
            <div className="recent-header">
              <span className="recent-title">最近打开</span>
              <span className="recent-meta">本周 {projects.length} 个项目</span>
            </div>
            <ul className="recent-list">
              {recent.map((p) => {
                const b = domainBadge[p.domain] ?? { txt: p.domain, cls: "icon-blue" };
                return (
                  <li
                    key={p.id}
                    className="recent-item"
                    onClick={() => nav("/project/" + p.id)}
                  >
                    <div className={"recent-icon " + b.cls}>{b.txt}</div>
                    <div className="recent-info">
                      <div className="recent-name">{p.name}</div>
                      <div className="recent-sub">
                        {countFiles(p.fileTree)} 个文件 · {formatRelative(p.updatedAt)}
                      </div>
                    </div>
                    <span className="recent-tag">{statusLabel[p.status]}</span>
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="launch-stat-grid">
            <div className="stat-cell">
              <div className="stat-num">
                3<span>步</span>
              </div>
              <div className="stat-label">进入工作流</div>
            </div>
            <div className="stat-cell">
              <div className="stat-num">
                1<span>个窗口</span>
              </div>
              <div className="stat-label">全部工作</div>
            </div>
            <div className="stat-cell">
              <div className="stat-num">
                ∞<span />
              </div>
              <div className="stat-label">技能可扩展</div>
            </div>
          </div>
        </div>
      </div>

      <div className="launch-flow">
        <div className="flow-title">如何进入工作环境</div>
        <div className="flow-steps">
          <div className="flow-step">
            <div className="flow-num">01</div>
            <div className="flow-step-name">启动 · Launch</div>
            <div className="flow-step-desc">
              打开应用——新建文件、打开最近项目、或浏览 Web。IDE 在用户提问之前就已就绪。
            </div>
          </div>
          <div className="flow-arrow">→</div>
          <div className="flow-step">
            <div className="flow-num">02</div>
            <div className="flow-step-name">工作台 · Workspace</div>
            <div className="flow-step-desc">
              每位律师的个人工作台。活跃项目、已完成案件、草稿、收藏——按案件组织。
            </div>
          </div>
          <div className="flow-arrow">→</div>
          <div className="flow-step">
            <div className="flow-num">03</div>
            <div className="flow-step-name">项目 · Project</div>
            <div className="flow-step-desc">
              打开任意项目进入集成环境——文件树、编辑器、AI Agent,三者并列。
            </div>
          </div>
        </div>
      </div>
    </section>
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
