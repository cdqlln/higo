import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useStore, useUserProjects, useUserSnippets } from "../store";

interface Cmd {
  id: string;
  label: string;
  hint?: string;
  group: string;
  run: () => void;
}

export default function CommandPalette({ onClose }: { onClose: () => void }) {
  const nav = useNavigate();
  const projects = useUserProjects();
  const snippets = useUserSnippets();
  const installSkill = useStore((s) => s.installSkill);
  const resetAll = useStore((s) => s.resetAll);
  const pushToast = useStore((s) => s.pushToast);
  const [q, setQ] = useState("");
  const [idx, setIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const commands = useMemo<Cmd[]>(() => {
    const base: Cmd[] = [
      { id: "go-launch", group: "导航", label: "前往 · 启动", run: () => nav("/") },
      { id: "go-ws", group: "导航", label: "前往 · 工作台", run: () => nav("/workspace") },
      { id: "go-mk", group: "导航", label: "前往 · 技能市场", run: () => nav("/marketplace") },
      { id: "go-set", group: "导航", label: "前往 · 设置", run: () => nav("/settings") },
      {
        id: "reset",
        group: "系统",
        label: "重置所有数据(恢复演示)",
        run: () => resetAll(),
      },
      {
        id: "copy-state",
        group: "系统",
        label: "复制 localStorage 状态到剪贴板",
        run: () => {
          const v = localStorage.getItem("workdeck-v1") ?? "";
          navigator.clipboard?.writeText(v);
          pushToast("已复制状态 JSON", "ok");
        },
      },
    ];
    for (const p of projects) {
      base.push({
        id: "open-" + p.id,
        group: "项目",
        label: "打开:" + p.name,
        hint: p.client,
        run: () => nav("/project/" + p.id),
      });
    }
    for (const s of snippets) {
      base.push({
        id: "snip-" + s.id,
        group: "片段",
        label: s.shortcut ? `${s.shortcut} · ${s.name}` : s.name,
        hint: s.body.slice(0, 40),
        run: () => {
          navigator.clipboard?.writeText(s.body);
          pushToast(`已复制片段:${s.name}`, "ok");
        },
      });
    }
    return base;
  }, [projects, snippets, nav, installSkill, pushToast, resetAll]);

  const filtered = useMemo(() => {
    if (!q.trim()) return commands;
    const lower = q.toLowerCase();
    return commands.filter(
      (c) =>
        c.label.toLowerCase().includes(lower) ||
        (c.hint && c.hint.toLowerCase().includes(lower)),
    );
  }, [commands, q]);

  useEffect(() => setIdx(0), [q]);

  function onKey(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setIdx((i) => Math.min(filtered.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setIdx((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const c = filtered[idx];
      if (c) {
        c.run();
        onClose();
      }
    }
  }

  /* Group display */
  let lastGroup = "";

  return (
    <div className="cmdp-backdrop" onClick={onClose}>
      <div className="cmdp" onClick={(e) => e.stopPropagation()}>
        <div className="cmdp-input">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.35-4.35" />
          </svg>
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKey}
            placeholder="搜索命令、项目、片段…"
          />
          <kbd>ESC</kbd>
        </div>
        <div className="cmdp-results">
          {filtered.length === 0 ? (
            <div className="cmdp-empty">无匹配项</div>
          ) : (
            filtered.map((c, i) => {
              const showGroup = c.group !== lastGroup;
              lastGroup = c.group;
              return (
                <div key={c.id}>
                  {showGroup && <div className="cmdp-group">{c.group}</div>}
                  <button
                    className={"cmdp-item" + (i === idx ? " sel" : "")}
                    onMouseEnter={() => setIdx(i)}
                    onClick={() => {
                      c.run();
                      onClose();
                    }}
                  >
                    <span className="cmdp-label">{c.label}</span>
                    {c.hint && <span className="cmdp-hint">{c.hint}</span>}
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
