/* Combined Zustand store with localStorage persistence.
 *
 * Keeps projects, daily essentials, installed skills, and settings.
 * Persistence key: "workdeck-v1"
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { uid } from "../lib/id";
import { SEED } from "./seed";
import type {
  AgentMessage,
  ClipboardItem,
  Project,
  ProjectStatus,
  SettingsState,
  SnippetItem,
  TreeNode,
  ToolCall,
  VariableItem,
} from "../types";

interface StoreState {
  projects: Project[];
  clipboard: ClipboardItem[];
  snippets: SnippetItem[];
  variables: VariableItem[];
  installedSkills: string[];
  settings: SettingsState;
  /** Toasts for global feedback */
  toasts: { id: string; text: string; kind: "info" | "ok" | "warn" }[];

  /* ---------- Projects ---------- */
  createProject: (p: Partial<Project>) => string;
  deleteProject: (id: string) => void;
  updateProject: (id: string, patch: Partial<Project>) => void;
  toggleStar: (id: string) => void;

  /* ---------- File tree ---------- */
  createNode: (
    projectId: string,
    parentId: string | null,
    node: { type: "folder" | "file"; name: string; content?: string },
  ) => string;
  deleteNode: (projectId: string, nodeId: string) => void;
  renameNode: (projectId: string, nodeId: string, name: string) => void;
  updateFileContent: (projectId: string, nodeId: string, content: string) => void;
  toggleFolder: (projectId: string, nodeId: string) => void;
  openFile: (projectId: string, nodeId: string) => void;
  closeFile: (projectId: string, nodeId: string) => void;
  setActiveFile: (projectId: string, nodeId: string | null) => void;

  /* ---------- Agent ---------- */
  appendMessage: (projectId: string, msg: AgentMessage) => void;
  updateMessage: (
    projectId: string,
    msgId: string,
    patch: Partial<AgentMessage>,
  ) => void;
  upsertToolCall: (
    projectId: string,
    msgId: string,
    tc: ToolCall,
  ) => void;
  clearConversation: (projectId: string) => void;

  /* ---------- Clipboard / snippets / variables ---------- */
  addClip: (text: string, source?: string) => void;
  removeClip: (id: string) => void;
  addSnippet: (s: Omit<SnippetItem, "id" | "updatedAt">) => string;
  removeSnippet: (id: string) => void;
  addVariable: (v: Omit<VariableItem, "id">) => string;
  updateVariable: (id: string, patch: Partial<VariableItem>) => void;
  removeVariable: (id: string) => void;

  /* ---------- Marketplace ---------- */
  installSkill: (id: string) => void;
  uninstallSkill: (id: string) => void;
  toggleProjectMcp: (projectId: string, mcpId: string) => void;

  /* ---------- Settings ---------- */
  updateSettings: (patch: Partial<SettingsState>) => void;

  /* ---------- UI ---------- */
  pushToast: (text: string, kind?: "info" | "ok" | "warn") => void;
  dismissToast: (id: string) => void;

  /* ---------- Reset (used by Settings) ---------- */
  resetAll: () => void;
}

/* ---------- Tree helpers ---------- */
function walkTree(
  nodes: TreeNode[],
  fn: (node: TreeNode, parent: TreeNode | null) => boolean | void,
  parent: TreeNode | null = null,
): boolean {
  for (const n of nodes) {
    if (fn(n, parent) === true) return true;
    if (n.children && walkTree(n.children, fn, n)) return true;
  }
  return false;
}
function findNode(tree: TreeNode[], id: string): TreeNode | null {
  let found: TreeNode | null = null;
  walkTree(tree, (n) => {
    if (n.id === id) {
      found = n;
      return true;
    }
  });
  return found;
}
function removeNode(tree: TreeNode[], id: string): TreeNode[] {
  return tree
    .filter((n) => n.id !== id)
    .map((n) =>
      n.children ? { ...n, children: removeNode(n.children, id) } : n,
    );
}

function fileIcon(name: string): string {
  const lower = name.toLowerCase();
  if (lower.endsWith(".pdf")) return "📕";
  if (lower.endsWith(".xlsx") || lower.endsWith(".csv")) return "📊";
  if (lower.endsWith(".md")) return "📝";
  if (lower.endsWith(".json")) return "🤖";
  if (lower.endsWith(".docx") || lower.endsWith(".doc")) return "📄";
  return "📄";
}

/* ---------- Store ---------- */
export const useStore = create<StoreState>()(
  persist(
    (set, get) => ({
      projects: SEED.projects(),
      clipboard: SEED.clipboard(),
      snippets: SEED.snippets(),
      variables: SEED.variables(),
      installedSkills: SEED.installed(),
      settings: SEED.settings(),
      toasts: [],

      /* ---------- Projects ---------- */
      createProject: (p) => {
        const id = uid("proj");
        const project: Project = {
          id,
          name: p.name ?? "未命名项目",
          client: p.client ?? "",
          domain: p.domain ?? "M&A",
          status: p.status ?? "draft",
          progress: 0,
          milestones: { done: 0, total: 5 },
          agentTasks: 0,
          team: p.team ?? ["陈"],
          starred: false,
          mountedMcp: get().installedSkills.filter((id) => id.startsWith("mcp-")),
          conversation: [],
          fileTree: [
            {
              id: uid("d"),
              type: "folder",
              name: "01_项目文件",
              open: true,
              updatedAt: Date.now(),
              children: [
                {
                  id: uid("f"),
                  type: "file",
                  name: "项目备忘.md",
                  content: `# ${p.name ?? "新项目"}\n\n开始记录…`,
                  icon: "📝",
                  updatedAt: Date.now(),
                },
              ],
            },
          ],
          openFileIds: [],
          activeFileId: null,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        set({ projects: [project, ...get().projects] });
        get().pushToast("已创建项目", "ok");
        return id;
      },

      deleteProject: (id) => {
        set({ projects: get().projects.filter((p) => p.id !== id) });
        get().pushToast("已删除项目", "info");
      },

      updateProject: (id, patch) => {
        set({
          projects: get().projects.map((p) =>
            p.id === id ? { ...p, ...patch, updatedAt: Date.now() } : p,
          ),
        });
      },

      toggleStar: (id) => {
        const p = get().projects.find((x) => x.id === id);
        if (!p) return;
        get().updateProject(id, { starred: !p.starred });
      },

      /* ---------- File tree ---------- */
      createNode: (projectId, parentId, node) => {
        const id = uid(node.type === "folder" ? "d" : "f");
        const newNode: TreeNode = {
          id,
          type: node.type,
          name: node.name,
          content: node.content ?? (node.type === "file" ? "" : undefined),
          children: node.type === "folder" ? [] : undefined,
          open: node.type === "folder" ? true : undefined,
          icon: node.type === "file" ? fileIcon(node.name) : undefined,
          updatedAt: Date.now(),
        };
        set({
          projects: get().projects.map((p) => {
            if (p.id !== projectId) return p;
            if (parentId === null) {
              return { ...p, fileTree: [...p.fileTree, newNode], updatedAt: Date.now() };
            }
            const insert = (nodes: TreeNode[]): TreeNode[] =>
              nodes.map((n) => {
                if (n.id === parentId && n.type === "folder") {
                  return {
                    ...n,
                    open: true,
                    children: [...(n.children ?? []), newNode],
                  };
                }
                if (n.children) return { ...n, children: insert(n.children) };
                return n;
              });
            return { ...p, fileTree: insert(p.fileTree), updatedAt: Date.now() };
          }),
        });
        return id;
      },

      deleteNode: (projectId, nodeId) => {
        set({
          projects: get().projects.map((p) => {
            if (p.id !== projectId) return p;
            return {
              ...p,
              fileTree: removeNode(p.fileTree, nodeId),
              openFileIds: p.openFileIds.filter((x) => x !== nodeId),
              activeFileId: p.activeFileId === nodeId ? null : p.activeFileId,
              updatedAt: Date.now(),
            };
          }),
        });
      },

      renameNode: (projectId, nodeId, name) => {
        set({
          projects: get().projects.map((p) => {
            if (p.id !== projectId) return p;
            const rename = (nodes: TreeNode[]): TreeNode[] =>
              nodes.map((n) => {
                if (n.id === nodeId)
                  return { ...n, name, icon: n.type === "file" ? fileIcon(name) : n.icon };
                if (n.children) return { ...n, children: rename(n.children) };
                return n;
              });
            return { ...p, fileTree: rename(p.fileTree), updatedAt: Date.now() };
          }),
        });
      },

      updateFileContent: (projectId, nodeId, content) => {
        set({
          projects: get().projects.map((p) => {
            if (p.id !== projectId) return p;
            const upd = (nodes: TreeNode[]): TreeNode[] =>
              nodes.map((n) => {
                if (n.id === nodeId) return { ...n, content, updatedAt: Date.now() };
                if (n.children) return { ...n, children: upd(n.children) };
                return n;
              });
            return { ...p, fileTree: upd(p.fileTree), updatedAt: Date.now() };
          }),
        });
      },

      toggleFolder: (projectId, nodeId) => {
        set({
          projects: get().projects.map((p) => {
            if (p.id !== projectId) return p;
            const toggle = (nodes: TreeNode[]): TreeNode[] =>
              nodes.map((n) => {
                if (n.id === nodeId && n.type === "folder")
                  return { ...n, open: !n.open };
                if (n.children) return { ...n, children: toggle(n.children) };
                return n;
              });
            return { ...p, fileTree: toggle(p.fileTree) };
          }),
        });
      },

      openFile: (projectId, nodeId) => {
        set({
          projects: get().projects.map((p) => {
            if (p.id !== projectId) return p;
            const exists = p.openFileIds.includes(nodeId);
            return {
              ...p,
              openFileIds: exists ? p.openFileIds : [...p.openFileIds, nodeId],
              activeFileId: nodeId,
            };
          }),
        });
      },

      closeFile: (projectId, nodeId) => {
        set({
          projects: get().projects.map((p) => {
            if (p.id !== projectId) return p;
            const remaining = p.openFileIds.filter((x) => x !== nodeId);
            return {
              ...p,
              openFileIds: remaining,
              activeFileId:
                p.activeFileId === nodeId
                  ? remaining[remaining.length - 1] ?? null
                  : p.activeFileId,
            };
          }),
        });
      },

      setActiveFile: (projectId, nodeId) => {
        set({
          projects: get().projects.map((p) =>
            p.id === projectId ? { ...p, activeFileId: nodeId } : p,
          ),
        });
      },

      /* ---------- Agent ---------- */
      appendMessage: (projectId, msg) => {
        set({
          projects: get().projects.map((p) => {
            if (p.id !== projectId) return p;
            return {
              ...p,
              conversation: [...p.conversation, msg],
              agentTasks: msg.role === "user" ? p.agentTasks + 1 : p.agentTasks,
              updatedAt: Date.now(),
            };
          }),
        });
      },

      updateMessage: (projectId, msgId, patch) => {
        set({
          projects: get().projects.map((p) => {
            if (p.id !== projectId) return p;
            return {
              ...p,
              conversation: p.conversation.map((m) =>
                m.id === msgId ? { ...m, ...patch } : m,
              ),
            };
          }),
        });
      },

      upsertToolCall: (projectId, msgId, tc) => {
        set({
          projects: get().projects.map((p) => {
            if (p.id !== projectId) return p;
            return {
              ...p,
              conversation: p.conversation.map((m) => {
                if (m.id !== msgId) return m;
                const existing = m.toolCalls ?? [];
                const idx = existing.findIndex((x) => x.id === tc.id);
                const next =
                  idx >= 0
                    ? existing.map((x, i) => (i === idx ? { ...x, ...tc } : x))
                    : [...existing, tc];
                return { ...m, toolCalls: next };
              }),
            };
          }),
        });
      },

      clearConversation: (projectId) => {
        get().updateProject(projectId, { conversation: [], agentTasks: 0 });
      },

      /* ---------- Essentials ---------- */
      addClip: (text, source) => {
        if (!text.trim()) return;
        set({
          clipboard: [
            { id: uid("c"), text, source, createdAt: Date.now() },
            ...get().clipboard.filter((c) => c.text !== text),
          ].slice(0, 20),
        });
      },
      removeClip: (id) => set({ clipboard: get().clipboard.filter((c) => c.id !== id) }),
      addSnippet: (s) => {
        const id = uid("s");
        set({
          snippets: [{ id, updatedAt: Date.now(), ...s }, ...get().snippets],
        });
        return id;
      },
      removeSnippet: (id) =>
        set({ snippets: get().snippets.filter((s) => s.id !== id) }),
      addVariable: (v) => {
        const id = uid("v");
        set({ variables: [{ id, ...v }, ...get().variables] });
        return id;
      },
      updateVariable: (id, patch) =>
        set({
          variables: get().variables.map((v) =>
            v.id === id ? { ...v, ...patch } : v,
          ),
        }),
      removeVariable: (id) =>
        set({ variables: get().variables.filter((v) => v.id !== id) }),

      /* ---------- Marketplace ---------- */
      installSkill: (id) => {
        if (get().installedSkills.includes(id)) return;
        set({ installedSkills: [...get().installedSkills, id] });
        get().pushToast("已安装", "ok");
      },
      uninstallSkill: (id) => {
        set({ installedSkills: get().installedSkills.filter((x) => x !== id) });
        // Also remove from projects' mounted MCP
        set({
          projects: get().projects.map((p) => ({
            ...p,
            mountedMcp: p.mountedMcp.filter((m) => m !== id),
          })),
        });
        get().pushToast("已卸载", "info");
      },
      toggleProjectMcp: (projectId, mcpId) => {
        set({
          projects: get().projects.map((p) => {
            if (p.id !== projectId) return p;
            const has = p.mountedMcp.includes(mcpId);
            return {
              ...p,
              mountedMcp: has
                ? p.mountedMcp.filter((m) => m !== mcpId)
                : [...p.mountedMcp, mcpId],
            };
          }),
        });
      },

      /* ---------- Settings ---------- */
      updateSettings: (patch) =>
        set({ settings: { ...get().settings, ...patch } }),

      /* ---------- Toast ---------- */
      pushToast: (text, kind = "info") => {
        const id = uid("t");
        set({ toasts: [...get().toasts, { id, text, kind }] });
        setTimeout(() => get().dismissToast(id), 2400);
      },
      dismissToast: (id) =>
        set({ toasts: get().toasts.filter((t) => t.id !== id) }),

      resetAll: () => {
        set({
          projects: SEED.projects(),
          clipboard: SEED.clipboard(),
          snippets: SEED.snippets(),
          variables: SEED.variables(),
          installedSkills: SEED.installed(),
          settings: SEED.settings(),
        });
        get().pushToast("已重置为初始状态", "ok");
      },
    }),
    {
      name: "workdeck-v1",
      version: 1,
      partialize: (s) => ({
        projects: s.projects,
        clipboard: s.clipboard,
        snippets: s.snippets,
        variables: s.variables,
        installedSkills: s.installedSkills,
        settings: s.settings,
      }),
    },
  ),
);

/* ---------- Selector helpers (stable across renders) ---------- */
export function useProject(id: string | undefined): Project | undefined {
  return useStore((s) => s.projects.find((p) => p.id === id));
}
