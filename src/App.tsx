import { useEffect, useState } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import TopNav from "./components/TopNav";
import CommandPalette from "./components/CommandPalette";
import Toasts from "./components/Toast";
import Launch from "./screens/Launch";
import Workspace from "./screens/Workspace";
import Project from "./screens/Project";
import Marketplace from "./screens/Marketplace";
import Settings from "./screens/Settings";

export default function App() {
  const [paletteOpen, setPaletteOpen] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
      if (e.key === "Escape") setPaletteOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      <TopNav onOpenPalette={() => setPaletteOpen(true)} />
      <Routes>
        <Route path="/" element={<Launch />} />
        <Route path="/workspace" element={<Workspace />} />
        <Route path="/project/:id" element={<Project />} />
        <Route path="/marketplace" element={<Marketplace />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <footer className="app-foot">
        <div>AI WorkDeck · 法律行业 AI 工作基础设施 · One Deck for All</div>
        <div>Built in China · Built for the world · King and Wood · Shenzhen</div>
      </footer>
      {paletteOpen && <CommandPalette onClose={() => setPaletteOpen(false)} />}
      <Toasts />
    </>
  );
}
