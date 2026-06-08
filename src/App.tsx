import { useEffect, useState } from "react";
import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import TopNav from "./components/TopNav";
import CommandPalette from "./components/CommandPalette";
import Toasts from "./components/Toast";
import AuthGuard from "./components/AuthGuard";
import Launch from "./screens/Launch";
import Workspace from "./screens/Workspace";
import Project from "./screens/Project";
import Marketplace from "./screens/Marketplace";
import Settings from "./screens/Settings";
import Login from "./screens/Login";
import Register from "./screens/Register";
import { useIsAuthenticated } from "./store";

export default function App() {
  const [paletteOpen, setPaletteOpen] = useState(false);
  const authed = useIsAuthenticated();
  const loc = useLocation();
  const onAuthPage = loc.pathname === "/login" || loc.pathname === "/register";

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!authed) return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
      if (e.key === "Escape") setPaletteOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [authed]);

  return (
    <>
      {!onAuthPage && <TopNav onOpenPalette={() => setPaletteOpen(true)} />}
      <Routes>
        <Route path="/login" element={authed ? <Navigate to="/" replace /> : <Login />} />
        <Route path="/register" element={authed ? <Navigate to="/" replace /> : <Register />} />
        <Route path="/" element={<AuthGuard><Launch /></AuthGuard>} />
        <Route path="/workspace" element={<AuthGuard><Workspace /></AuthGuard>} />
        <Route path="/project/:id" element={<AuthGuard><Project /></AuthGuard>} />
        <Route path="/marketplace" element={<AuthGuard><Marketplace /></AuthGuard>} />
        <Route path="/settings" element={<AuthGuard><Settings /></AuthGuard>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      {!onAuthPage && (
        <footer className="app-foot">
          <div>AI WorkDeck · 法律行业 AI 工作基础设施 · One Deck for All</div>
          <div>Built in China · Built for the world · King and Wood · Shenzhen</div>
        </footer>
      )}
      {paletteOpen && <CommandPalette onClose={() => setPaletteOpen(false)} />}
      <Toasts />
    </>
  );
}
