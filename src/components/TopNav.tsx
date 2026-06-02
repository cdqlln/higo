import { NavLink, useLocation } from "react-router-dom";
import { useStore } from "../store";

export default function TopNav({ onOpenPalette }: { onOpenPalette: () => void }) {
  const settings = useStore((s) => s.settings);
  const installed = useStore((s) => s.installedSkills.length);
  const loc = useLocation();
  const onProject = loc.pathname.startsWith("/project/");

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
        <NavLink to="/project/proj-szci-haina" className={"nav-tab" + (onProject ? " active" : "")}>
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
        <div className="user-chip">
          <div className="avatar">{settings.agentTitle.slice(0, 1)}</div>
          <span>{settings.agentTitle}</span>
        </div>
      </div>
    </header>
  );
}
