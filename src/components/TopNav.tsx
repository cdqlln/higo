import { useEffect, useRef, useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { useCurrentUser, useStore, useUserProjects } from "../store";
import { GROUP_LABEL, ROLE_LABEL } from "../types";
import type { Role, UserGroup } from "../types";

export default function TopNav({ onOpenPalette }: { onOpenPalette: () => void }) {
  const user = useCurrentUser();
  const installed = useStore((s) => s.installedSkills.length);
  const logout = useStore((s) => s.logout);
  const userProjects = useUserProjects();
  const nav = useNavigate();
  const loc = useLocation();
  const onProject = loc.pathname.startsWith("/project/");
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    if (menuOpen) document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [menuOpen]);

  // Determine a "default project" link target — first user project, or workspace
  const projectsTarget = userProjects[0]?.id
    ? `/project/${userProjects[0].id}`
    : "/workspace";

  return (
    <header className="top-nav">
      <NavLink to="/" className="brand">
        <div className="brand-mark">
          <svg viewBox="0 0 32 32" width={22} height={22}>
            <path d="M4 6h6v20H4zM12 6h6v14h-6zM20 6h6v20h-6z" fill="currentColor" />
          </svg>
        </div>
        <div className="brand-text">
          <div className="brand-name">AI WorkDeck</div>
          <div className="brand-sub">法律行业 AI 工作基础设施</div>
        </div>
      </NavLink>
      <nav className="nav-tabs">
        <NavLink to="/" end className={({ isActive }) => "nav-tab" + (isActive ? " active" : "")}>
          启动
        </NavLink>
        <NavLink to="/workspace" className={({ isActive }) => "nav-tab" + (isActive ? " active" : "")}>
          工作台
        </NavLink>
        <NavLink to={projectsTarget} className={"nav-tab" + (onProject ? " active" : "")}>
          项目
        </NavLink>
        <NavLink to="/marketplace" className={({ isActive }) => "nav-tab" + (isActive ? " active" : "")}>
          技能市场 <span className="tab-count">{installed}</span>
        </NavLink>
        <NavLink to="/settings" className={({ isActive }) => "nav-tab" + (isActive ? " active" : "")}>
          设置
        </NavLink>
      </nav>
      <div className="top-right">
        <button className="search-mini" onClick={onOpenPalette} aria-label="打开命令面板">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.35-4.35" />
          </svg>
          <span>全局搜索</span>
          <kbd>⌘K</kbd>
        </button>
        <div className="user-menu-wrap" ref={menuRef}>
          <button className="user-chip" onClick={() => setMenuOpen((v) => !v)}>
            <div className="avatar">{user?.avatar ?? user?.name?.slice(0, 1) ?? "U"}</div>
            <span>{user?.name ?? "未登录"}</span>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
          {menuOpen && user && (
            <div className="user-menu">
              <div className="user-menu-head">
                <div className="avatar lg">{user.avatar ?? user.name.slice(0, 1)}</div>
                <div>
                  <div className="user-menu-name">{user.name}</div>
                  <div className="user-menu-email">{user.email}</div>
                  {user.organization && <div className="user-menu-firm">{user.organization}</div>}
                  <div className="user-menu-group">{groupLabel(user.group)}</div>
                </div>
              </div>
              <div className="user-menu-meta">
                <span>{roleLabel(user.role)}</span>
                <span>·</span>
                <span>{userProjects.length} 项目</span>
              </div>
              <div className="user-menu-divider" />
              <button
                className="user-menu-item"
                onClick={() => {
                  setMenuOpen(false);
                  nav("/settings");
                }}
              >
                ⚙ 个人设置
              </button>
              <button
                className="user-menu-item danger"
                onClick={() => {
                  setMenuOpen(false);
                  logout();
                  nav("/login", { replace: true });
                }}
              >
                ⎋ 退出登录
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

function roleLabel(r: Role | string): string {
  return ROLE_LABEL[r as Role] ?? String(r);
}

function groupLabel(g: UserGroup | string): string {
  return GROUP_LABEL[g as UserGroup] ?? String(g);
}
