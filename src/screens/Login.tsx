import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useStore } from "../store";
import { validateEmail, validatePassword } from "../lib/auth";

export default function Login() {
  const nav = useNavigate();
  const loc = useLocation();
  const login = useStore((s) => s.login);
  const register = useStore((s) => s.register);
  const accounts = useStore((s) => s.accounts);
  const pushToast = useStore((s) => s.pushToast);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const from = (loc.state as { from?: string } | null)?.from ?? "/";

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    const ee = validateEmail(email);
    const pe = validatePassword(password);
    if (ee) return setErr(ee);
    if (pe) return setErr(pe);
    setBusy(true);
    const r = await login(email, password);
    setBusy(false);
    if (!r.ok) return setErr(r.error);
    nav(from, { replace: true });
  }

  async function onDemo() {
    setBusy(true);
    setErr(null);
    // Reuse demo if exists, else create
    const demoEmail = "demo@workdeck.local";
    const exists = accounts.some((a) => a.email === demoEmail);
    if (exists) {
      const r = await login(demoEmail, "demo123");
      setBusy(false);
      if (!r.ok) {
        setErr("演示账号密码错误,请尝试注册新账号");
        return;
      }
    } else {
      const r = await register({
        email: demoEmail,
        password: "demo123",
        name: "陈律师 (Demo)",
        organization: "King and Wood",
        group: "law-firm",
        role: "lawyer",
        seedDemo: true,
      });
      setBusy(false);
      if (!r.ok) return setErr(r.error);
      pushToast("已创建演示账号 demo@workdeck.local / demo123", "info");
    }
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

        <h2 className="auth-title">登录到您的工作台</h2>
        <p className="auth-sub">使用您的账号继续工作。</p>

        <form className="auth-form" onSubmit={onSubmit}>
          <div className="auth-field">
            <label>邮箱</label>
            <input
              type="email"
              autoComplete="email"
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="lawyer@firm.com"
            />
          </div>
          <div className="auth-field">
            <label>密码</label>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="至少 6 位"
            />
          </div>
          {err && <div className="auth-err">⚠ {err}</div>}
          <button type="submit" className="auth-primary" disabled={busy}>
            {busy ? "验证中…" : "登 录"}
          </button>
        </form>

        <div className="auth-or"><span>或</span></div>

        <button className="auth-secondary" onClick={onDemo} disabled={busy}>
          以演示账号一键进入
        </button>

        <div className="auth-foot">
          还没有账号? <Link to="/register">立即注册</Link>
        </div>
      </div>

      <div className="auth-side">
        <div className="kicker">
          <span className="kicker-dot" /> AI WorkDeck · One Deck for All
        </div>
        <h3 className="auth-tagline">
          一个工作台,
          <br />
          所有法律工作 <span className="title-accent">在此完成</span>
        </h3>
        <ul className="auth-feature-list">
          <li>📂 项目化文件管理 · 文件树 + Office 编辑器</li>
          <li>🤖 Claude 项目 Agent · 多轮工具调用</li>
          <li>📚 北大法宝 / SAMR / 行政处罚库 · MCP 接入</li>
          <li>🧩 技能市场 · 合同审阅、数据脱敏、浏览器自动化</li>
          <li>📋 日常必备 · 剪贴板、变量、片段</li>
        </ul>
        <div className="auth-side-foot">Built in China · Built for the world</div>
      </div>
    </section>
  );
}
