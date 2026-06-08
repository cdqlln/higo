import { useState } from "react";
import { useStore } from "../store";

const MODELS = [
  "claude-opus-4-7",
  "claude-opus-4-8",
  "claude-sonnet-4-6",
  "claude-haiku-4-5-20251001",
];

export default function Settings() {
  const settings = useStore((s) => s.settings);
  const updateSettings = useStore((s) => s.updateSettings);
  const resetAll = useStore((s) => s.resetAll);
  const pushToast = useStore((s) => s.pushToast);

  const [show, setShow] = useState(false);
  const [testing, setTesting] = useState(false);

  async function testKey() {
    if (!settings.apiKey.trim()) {
      pushToast("请先填入 API Key", "warn");
      return;
    }
    setTesting(true);
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": settings.apiKey,
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true",
        },
        body: JSON.stringify({
          model: settings.model,
          max_tokens: 32,
          messages: [{ role: "user", content: "ping" }],
        }),
      });
      if (res.ok) pushToast("连通正常 ✓", "ok");
      else {
        const t = await res.text();
        pushToast(`连接失败 ${res.status}: ${t.slice(0, 100)}`, "warn");
      }
    } catch (e) {
      pushToast("网络错误:" + (e as Error).message, "warn");
    } finally {
      setTesting(false);
    }
  }

  return (
    <section className="screen screen-settings">
      <div className="set-inner">
        <header className="set-h">
          <div className="kicker">
            <span className="kicker-dot" />
            Settings · 系统设置
          </div>
          <h2>偏好与凭据</h2>
          <p>API Key 仅保存在浏览器本地(localStorage),不上传到服务端。</p>
        </header>

        <section className="set-section">
          <h3>Claude API</h3>
          <div className="set-field">
            <label>API Key</label>
            <div className="set-input-row">
              <input
                type={show ? "text" : "password"}
                value={settings.apiKey}
                placeholder="sk-ant-..."
                onChange={(e) => updateSettings({ apiKey: e.target.value })}
              />
              <button onClick={() => setShow((v) => !v)}>{show ? "隐藏" : "显示"}</button>
              <button onClick={testKey} disabled={testing}>
                {testing ? "测试中…" : "测试连接"}
              </button>
            </div>
            <div className="set-help">
              留空时,Agent 进入"演示模式"——使用本地 MCP 模拟数据 + 脚本化回答演示完整工作流。
            </div>
          </div>
          <div className="set-field">
            <label>模型</label>
            <select value={settings.model} onChange={(e) => updateSettings({ model: e.target.value })}>
              {MODELS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>
        </section>

        <section className="set-section">
          <h3>个人信息</h3>
          <div className="set-field">
            <label>显示名</label>
            <input
              value={settings.agentTitle}
              onChange={(e) => updateSettings({ agentTitle: e.target.value })}
            />
          </div>
          <div className="set-field">
            <label>Agent 名称</label>
            <input
              value={settings.agentName}
              onChange={(e) => updateSettings({ agentName: e.target.value })}
            />
          </div>
        </section>

        <section className="set-section danger-section">
          <h3>数据</h3>
          <div className="set-field">
            <label>重置所有数据</label>
            <div>
              <button
                className="danger-btn"
                onClick={() => {
                  if (confirm("将重置所有项目、剪贴板、变量、片段为演示初始状态。继续?")) resetAll();
                }}
              >
                重置为演示数据
              </button>
            </div>
            <div className="set-help">所有数据保存在 localStorage 键 "workdeck-v1" 下。</div>
          </div>
        </section>
      </div>
    </section>
  );
}
