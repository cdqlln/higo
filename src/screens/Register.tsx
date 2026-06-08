import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useStore } from "../store";
import { validateEmail, validatePassword } from "../lib/auth";
import {
  GROUP_KICKER,
  GROUP_LABEL,
  GROUP_ORG_LABEL,
  GROUP_ROLES,
  ROLE_LABEL,
} from "../types";
import type { Role, UserGroup } from "../types";

const GROUP_ICONS: Record<UserGroup, string> = {
  "law-firm": "⚖",
  "in-house": "🏢",
  judiciary: "🏛",
  other: "🎓",
};

const GROUP_SUB: Record<UserGroup, string> = {
  "law-firm": "并购 · 争议 · 资本市场 · 合规",
  "in-house": "合同 · 合规 · 内部调查 · 子公司治理",
  judiciary: "卷宗 · 文书 · 类案 · 庭审记录",
  other: "仲裁 · 学术 · 公证 · 立法 · 执法",
};

const ORG_PLACEHOLDER: Record<UserGroup, string> = {
  "law-firm": "King and Wood",
  "in-house": "某某科技有限公司",
  judiciary: "广州市中级人民法院",
  other: "ICC / 北京大学法学院 / 公证处 ...",
};

export default function Register() {
  const nav = useNavigate();
  const register = useStore((s) => s.register);

  const [step, setStep] = useState<1 | 2>(1);
  const [group, setGroup] = useState<UserGroup>("law-firm");
  const [role, setRole] = useState<Role>("lawyer");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [organization, setOrganization] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [seedDemo, setSeedDemo] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const availableRoles = useMemo(() => GROUP_ROLES[group], [group]);

  function chooseGroup(g: UserGroup) {
    setGroup(g);
    setRole(GROUP_ROLES[g][0]);
    setStep(2);
  }

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
      group,
      role,
      organization: organization.trim() || undefined,
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

        {step === 1 && (
          <>
            <h2 className="auth-title">您是哪一类用户?</h2>
            <p className="auth-sub">
              AI WorkDeck 面向法律行业全员 —— 您的工作流、技能与种子数据会按选择自动适配。
            </p>
            <div className="group-grid">
              {(Object.keys(GROUP_LABEL) as UserGroup[]).map((g) => (
                <button
                  key={g}
                  className={"group-card" + (group === g ? " sel" : "")}
                  onClick={() => chooseGroup(g)}
                >
                  <div className="group-icon">{GROUP_ICONS[g]}</div>
                  <div className="group-name">{GROUP_LABEL[g]}</div>
                  <div className="group-sub">{GROUP_SUB[g]}</div>
                </button>
              ))}
            </div>
            <div className="auth-foot">
              已有账号? <Link to="/login">直接登录</Link>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <h2 className="auth-title">创建您的账号</h2>
            <p className="auth-sub">
              使用群组:<b style={{ color: "var(--accent)" }}>{GROUP_LABEL[group]}</b>
              <button
                className="auth-mini-link"
                onClick={() => setStep(1)}
                type="button"
              >
                · 重新选择
              </button>
            </p>

            <form className="auth-form" onSubmit={onSubmit}>
              <div className="auth-row">
                <div className="auth-field">
                  <label>姓名</label>
                  <input
                    value={name}
                    autoFocus
                    onChange={(e) => setName(e.target.value)}
                    placeholder="您的姓名"
                  />
                </div>
                <div className="auth-field">
                  <label>{GROUP_ORG_LABEL[group]}(可选)</label>
                  <input
                    value={organization}
                    onChange={(e) => setOrganization(e.target.value)}
                    placeholder={ORG_PLACEHOLDER[group]}
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
                    placeholder="you@example.com"
                    autoComplete="email"
                  />
                </div>
                <div className="auth-field">
                  <label>职位</label>
                  <select value={role} onChange={(e) => setRole(e.target.value as Role)}>
                    {availableRoles.map((r) => (
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
                <span>载入「{GROUP_LABEL[group]}」示例工作台数据 + 默认技能</span>
              </label>

              {err && <div className="auth-err">⚠ {err}</div>}

              <button type="submit" className="auth-primary" disabled={busy}>
                {busy ? "创建中…" : "创建账号 · 立即进入"}
              </button>
            </form>

            <div className="auth-foot">
              已有账号? <Link to="/login">直接登录</Link>
            </div>
          </>
        )}
      </div>

      <div className="auth-side">
        <div className="kicker">
          <span className="kicker-dot" /> 加入 AI WorkDeck
        </div>
        <h3 className="auth-tagline">{GROUP_KICKER[group]}</h3>
        <p className="auth-side-p">注册后您将获得:</p>
        <ul className="auth-feature-list">
          <li>✓ 适配「{GROUP_LABEL[group]}」的示例工作台</li>
          <li>✓ 预装本群组常用 MCP 与技能</li>
          <li>✓ 个人专属数据,本机浏览器存储</li>
          <li>✓ 可在「设置」中接入 Claude API,切换为真实推理</li>
        </ul>
        <div className="auth-side-foot">King and Wood · Shenzhen</div>
      </div>
    </section>
  );
}
