import { useMemo, useState } from "react";
import { useCurrentUser, useStore } from "../store";
import { SKILL_CATALOG } from "../lib/skills";
import { GROUP_LABEL } from "../types";
import type { SkillSource, UserGroup } from "../types";

const SOURCE_LABEL: Record<SkillSource, { txt: string; dot: string }> = {
  official: { txt: "官方", dot: "src-blue" },
  labs: { txt: "King & Wood Labs", dot: "src-amber" },
  partner: { txt: "合作伙伴", dot: "src-teal" },
  community: { txt: "社区", dot: "src-gray" },
};

type Sort = "hot" | "new" | "rating";

export default function Marketplace() {
  const installed = useStore((s) => s.installedSkills);
  const install = useStore((s) => s.installSkill);
  const uninstall = useStore((s) => s.uninstallSkill);
  const updateSettings = useStore((s) => s.updateSettings);
  const settingsGroupFilter = useStore((s) => s.settings.marketplaceGroupFilter);
  const user = useCurrentUser();

  const [q, setQ] = useState("");
  const [category, setCategory] = useState<string>("all");
  const [source, setSource] = useState<SkillSource | "all">("all");
  const [sort, setSort] = useState<Sort>("hot");
  const [groupFilter, setGroupFilter] = useState<UserGroup | "all">(
    settingsGroupFilter ?? user?.group ?? "all",
  );

  function setGroupAndPersist(g: UserGroup | "all") {
    setGroupFilter(g);
    updateSettings({ marketplaceGroupFilter: g });
  }

  const featured = useMemo(() => SKILL_CATALOG.filter((s) => s.featured), []);

  const categories = useMemo(() => {
    const m: Record<string, number> = {};
    for (const s of SKILL_CATALOG) m[s.category] = (m[s.category] ?? 0) + 1;
    return m;
  }, []);

  const sourceCounts = useMemo(() => {
    const m: Record<string, number> = { official: 0, labs: 0, partner: 0, community: 0 };
    for (const s of SKILL_CATALOG) m[s.source]++;
    return m;
  }, []);

  const filtered = useMemo(() => {
    let list = [...SKILL_CATALOG];
    if (q.trim()) {
      const lower = q.toLowerCase();
      list = list.filter(
        (s) =>
          s.name.toLowerCase().includes(lower) ||
          s.description.toLowerCase().includes(lower) ||
          s.author.toLowerCase().includes(lower),
      );
    }
    if (category !== "all") list = list.filter((s) => s.category === category);
    if (source !== "all") list = list.filter((s) => s.source === source);
    if (groupFilter !== "all") {
      list = list.filter(
        (s) => !s.userGroups || s.userGroups.includes(groupFilter),
      );
    }
    if (sort === "hot") list.sort((a, b) => b.installs - a.installs);
    else if (sort === "rating") list.sort((a, b) => b.rating - a.rating);
    else list.sort((a, b) => b.version.localeCompare(a.version));
    return list;
  }, [q, category, source, sort, groupFilter]);

  const totalInstalls = SKILL_CATALOG.reduce((n, s) => n + s.installs, 0);
  const mcpCount = SKILL_CATALOG.filter((s) => s.kind === "mcp").length;

  return (
    <section className="screen screen-marketplace">
      <div className="mk-hero">
        <div className="mk-hero-text">
          <div className="kicker">
            <span className="kicker-dot" />
            Skill Marketplace · 开放生态
          </div>
          <h2 className="mk-title">技能市场</h2>
          <p className="mk-sub">
            基础设施意味着可扩展性。每一项法律技能、每一个数据库、每一条工作流——皆可插入。
            <br />
            明日的插件,是你尚未想到的功能;今日的插件,是你早已渴望的工作流。
          </p>
        </div>
        <div className="mk-hero-stats">
          <div>
            <div className="mk-stat-n">{SKILL_CATALOG.length}</div>
            <div className="mk-stat-l">已上架技能</div>
          </div>
          <div>
            <div className="mk-stat-n">{mcpCount}</div>
            <div className="mk-stat-l">MCP 服务器</div>
          </div>
          <div>
            <div className="mk-stat-n">{installed.length}</div>
            <div className="mk-stat-l">您已安装</div>
          </div>
          <div>
            <div className="mk-stat-n">{(totalInstalls / 1000).toFixed(1)}k</div>
            <div className="mk-stat-l">累计安装</div>
          </div>
        </div>
      </div>

      <div className="mk-body">
        <aside className="mk-side">
          <div className="mk-side-search">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.35-4.35" />
            </svg>
            <input
              placeholder="搜索技能、MCP..."
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>

          <div className="mk-side-group">
            <div className="mk-side-title">适用群组</div>
            <ul>
              <li
                className={groupFilter === "all" ? "active" : ""}
                onClick={() => setGroupAndPersist("all")}
              >
                全部群组 <span>{SKILL_CATALOG.length}</span>
              </li>
              {(Object.keys(GROUP_LABEL) as UserGroup[]).map((g) => {
                const n = SKILL_CATALOG.filter(
                  (s) => !s.userGroups || s.userGroups.includes(g),
                ).length;
                return (
                  <li
                    key={g}
                    className={groupFilter === g ? "active" : ""}
                    onClick={() => setGroupAndPersist(g)}
                  >
                    {user?.group === g && <span className="for-you-dot">●</span>}
                    {GROUP_LABEL[g]} <span>{n}</span>
                  </li>
                );
              })}
            </ul>
          </div>
          <div className="mk-side-group">
            <div className="mk-side-title">类型</div>
            <ul>
              <li
                className={category === "all" ? "active" : ""}
                onClick={() => setCategory("all")}
              >
                全部 <span>{SKILL_CATALOG.length}</span>
              </li>
              {Object.entries(categories).map(([k, v]) => (
                <li
                  key={k}
                  className={category === k ? "active" : ""}
                  onClick={() => setCategory(k)}
                >
                  {k} <span>{v}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="mk-side-group">
            <div className="mk-side-title">来源</div>
            <ul>
              <li className={source === "all" ? "active" : ""} onClick={() => setSource("all")}>
                全部 <span>{SKILL_CATALOG.length}</span>
              </li>
              {(Object.keys(SOURCE_LABEL) as SkillSource[]).map((k) => {
                const s = SOURCE_LABEL[k];
                return (
                  <li
                    key={k}
                    className={source === k ? "active" : ""}
                    onClick={() => setSource(k)}
                  >
                    <span className={"src-dot " + s.dot} />
                    {s.txt} <span>{sourceCounts[k]}</span>
                  </li>
                );
              })}
            </ul>
          </div>
          <div className="mk-side-cta">
            <div className="cta-title">为同行构建一项技能</div>
            <div className="cta-sub">人人可建,人人可发。</div>
            <button onClick={() => alert("查阅开发指南(占位)")}>查阅开发指南 ›</button>
          </div>
        </aside>

        <main className="mk-main">
          <div className="mk-section-head">
            <h3>本周精选</h3>
            <span className="mk-section-sub">由 King & Wood Labs 审核推荐</span>
          </div>
          <div className="mk-feature-row">
            {featured.map((s) => {
              const isInstalled = installed.includes(s.id);
              return (
                <article key={s.id} className="mk-feature">
                  <div className="mf-tag">{SOURCE_LABEL[s.source].txt}</div>
                  <div className={"mf-icon " + iconCls(s.source)}>{s.icon}</div>
                  <h4>{s.name}</h4>
                  <p>{s.description}</p>
                  <div className="mf-meta">
                    <span>★ {s.rating}</span>
                    <span>· {s.installs.toLocaleString()} 安装</span>
                    <span>· v{s.version}</span>
                  </div>
                  <button
                    className={"mf-install" + (isInstalled ? " installed" : "")}
                    onClick={() => (isInstalled ? uninstall(s.id) : install(s.id))}
                  >
                    {isInstalled ? "已安装 · 卸载" : "安装"}
                  </button>
                </article>
              );
            })}
          </div>

          <div className="mk-section-head" style={{ marginTop: 28 }}>
            <h3>
              {q || category !== "all" || source !== "all" ? "搜索结果" : "所有技能"}
              <span style={{ fontSize: 12, color: "var(--text-3)", fontWeight: 400, marginLeft: 8 }}>
                {filtered.length} 个
              </span>
            </h3>
            <div className="mk-sort">
              <button className={"sort-chip" + (sort === "hot" ? " active" : "")} onClick={() => setSort("hot")}>
                最热
              </button>
              <button className={"sort-chip" + (sort === "new" ? " active" : "")} onClick={() => setSort("new")}>
                最新
              </button>
              <button className={"sort-chip" + (sort === "rating" ? " active" : "")} onClick={() => setSort("rating")}>
                最高评分
              </button>
            </div>
          </div>

          <div className="mk-grid">
            {filtered.map((s) => {
              const isInstalled = installed.includes(s.id);
              return (
                <article key={s.id} className="mk-card">
                  <div className="mc-head">
                    <div className="mc-icon">{s.icon}</div>
                    <div>
                      <div className="mc-name">{s.name}</div>
                      <div className="mc-author">{s.author}</div>
                    </div>
                  </div>
                  <p className="mc-desc">{s.description}</p>
                  {s.userGroups && s.userGroups.length < 4 && (
                    <div className="mc-groups">
                      适用于:
                      {s.userGroups.map((g) => (
                        <span
                          key={g}
                          className={
                            "mc-group-chip" + (user?.group === g ? " mine" : "")
                          }
                        >
                          {GROUP_LABEL[g]}
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="mc-foot">
                    <span>★ {s.rating} · {(s.installs / 1000).toFixed(1)}k 安装</span>
                    <button
                      className={isInstalled ? "installed" : ""}
                      onClick={() => (isInstalled ? uninstall(s.id) : install(s.id))}
                    >
                      {isInstalled ? "✓ 已安装" : "安装"}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        </main>
      </div>
    </section>
  );
}

function iconCls(source: SkillSource): string {
  if (source === "official") return "icon-blue";
  if (source === "labs") return "icon-amber";
  if (source === "partner") return "icon-teal";
  return "icon-rose";
}
