import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useStore } from "../store";
import { validateEmail, validatePassword } from "../lib/auth";
import type { Role } from "../types";

const ROLE_LABEL: Record<Role, string> = {
  lawyer: "执业律师",
  partner: "合伙人",
  paralegal: "律师助理",
  admin: "管理员",
};

export default function Register() {
  const nav = useNavigate();
  const register = useStore((s) => s.register);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [firm, setFirm] = useState("");
  const [role, setRole] = useState<Role>("lawyer");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [seedDemo, setSeedDemo] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!name.trim()) return setErr("请输入姓名");
    const ee = validateEmail(email);
    if (ee) return setErr(ee);
    const pe = validatePassword(password);
    if (pe) return setErr(pe);
    if (password !== confirm) return setErr("两次密码不一致");

    setBusy(true);
    const r = await register({
      email,
      password,
      name: name.trim(),
      firm: firm.trim() || undefined,
      role,
      seedDemo,
    });
    setBusy(false);
    if (!r.ok) return setErr(r.error);
    nav("/", { replace: true });
  }

  return (
    <section className="screen screen-auth">
      <div className="auth-card">
        <div className="auth-brand">
          <div className="brand-mark">
            <svg viewBox="0 0 32 32" width={22} height={22}>
              <path d="M4 6h6v20H4zM12 6h6v14h-6zM20 6h6v20h-6z" fill="currentColor" />
            </svg>
          </div>
          <div>
            <div className="brand-name">AI WorkDeck</div>
            <div className="brand-sub">法律行业 AI 工作基础设施</div>
          </div>
        </div>

        <h2 className="auth-title">创建您的账号</h2>
        <p className="auth-sub">所有数据保存在本机浏览器,密码经 PBKDF2 哈希后存储。</p>

        <form className="auth-form" onSubmit={onSubmit}>
          <div className="auth-row">
            <div className="auth-field">
              <label>姓名</label>
              <input
                value={name}
                autoFocus
                onChange={(e) => setName(e.target.value)}
                placeholder="陈律师"
              />
            </div>
            <div className="auth-field">
              <label>所属事务所(可选)</label>
              <input
                value={firm}
                onChange={(e) => setFirm(e.target.value)}
                placeholder="King and Wood"
              />
            </div>
          </div>

          <div className="auth-row">
            <div className="auth-field">
              <label>邮箱</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="lawyer@firm.com"
                autoComplete="email"
              />
            </div>
            <div className="auth-field">
              <label>职位</label>
              <select value={role} onChange={(e) => setRole(e.target.value as Role)}>
                {(Object.keys(ROLE_LABEL) as Role[]).map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABEL[r]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="auth-row">
            <div className="auth-field">
              <label>密码</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="至少 6 位"
                autoComplete="new-password"
              />
            </div>
            <div className="auth-field">
              <label>确认密码</label>
              <input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                autoComplete="new-password"
              />
            </div>
          </div>

          <label className="auth-check">
            <input
              type="checkbox"
              checked={seedDemo}
              onChange={(e) => setSeedDemo(e.target.checked)}
            />
            <span>载入示例工作台数据(4 个示例项目 + 片段 + 变量)</span>
          </label>

          {err && <div className="auth-err">⚠ {err}</div>}

          <button type="submit" className="auth-primary" disabled={busy}>
            {busy ? "创建中…" : "创建账号 · 立即进入"}
          </button>
        </form>

        <div className="auth-foot">
          已有账号? <Link to="/login">直接登录</Link>
        </div>
      </div>

      <div className="auth-side">
        <div className="kicker">
          <span className="kicker-dot" /> 加入 AI WorkDeck
        </div>
        <h3 className="auth-tagline">
          为<span className="title-accent">明日的律师</span>而构建
        </h3>
        <p className="auth-side-p">
          AI WorkDeck 是一站式法律工作 IDE。注册后您将获得:
        </p>
        <ul className="auth-feature-list">
          <li>✓ 个人专属工作台,数据本地存储</li>
          <li>✓ 4 个示例项目演示完整工作流</li>
          <li>✓ 已挂载 7 个常用技能与 MCP</li>
          <li>✓ 可在「设置」中接入 Claude API</li>
        </ul>
        <div className="auth-side-foot">King and Wood · Shenzhen</div>
      </div>
    </section>
  );
}
