/* Combined Zustand store with localStorage persistence + auth.
 *
 * Persistence key: "workdeck-v1" (current version: 2)
 *
 * Data shape:
 *   - `accounts` holds all registered user accounts (with PBKDF2 hashes)
 *   - `currentUserId` is the active session, null = logged out
 *   - `projects` / `clipboard` / `snippets` / `variables` carry a `userId`
 *     so the same store serves multiple accounts; UI uses
 *     `useUserProjects()` etc. which filter by current user.
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { useShallow } from "zustand/react/shallow";
import { uid } from "../lib/id";
import { SEED, defaultInstalledFor, seedForGroup } from "./seed";
import { generateSalt, hashPassword, verifyPassword } from "../lib/auth";
import { WARN_FILE_BYTES, fileIconFor, formatBytes, readFile } from "../lib/upload";
import type {
  Account,
  AgentMessage,
  ClipboardItem,
  Project,
  ProjectStatus,
  Role,
  SettingsState,
  SnippetItem,
  TreeNode,
  ToolCall,
  UserGroup,
  VariableItem,
} from "../types";

interface StoreState {
  /* ---------- Auth ---------- */
  accounts: Account[];
  currentUserId: string | null;

  /* ---------- Domain data (cross-user, filtered at the selector) ---------- */
  projects: Project[];
  clipboard: ClipboardItem[];
  snippets: SnippetItem[];
  variables: VariableItem[];
  installedSkills: string[];
  settings: SettingsState;

  /** Toasts for global feedback */
  toasts: { id: string; text: string; kind: "info" | "ok" | "warn" }[];

  /* ---------- Auth actions ---------- */
  register: (input: {
    email: string;
    password: string;
    name: string;
    group: UserGroup;
    role: Role;
    organization?: string;
    seedDemo?: boolean;
  }) => Promise<{ ok: true } | { ok: false; error: string }>;
  login: (
    email: string,
    password: string,
  ) => Promise<{ ok: true } | { ok: false; error: string }>;
  logout: () => void;
  updateAccount: (id: string, patch: Partial<Account>) => void;

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
  uploadFiles: (
    projectId: string,
    parentId: string | null,
    files: FileList | File[],
  ) => Promise<{ ok: number; failed: { name: string; error: string }[] }>;
  /** Move a node to a new parent (null = root). No-op if cycle would form. */
  moveNode: (
    projectId: string,
    nodeId: string,
    newParentId: string | null,
  ) => { ok: boolean; error?: string };
  /** Insert a deep copy of nodeId at the given parent. New IDs everywhere. */
  duplicateNode: (
    projectId: string,
    nodeId: string,
    parentId?: string | null,
  ) => string | null;
  /** In-memory clipboard used by copy / cut / paste — not persisted. */
  treeClipboard: { projectId: string; nodeId: string; mode: "copy" | "cut" } | null;
  setTreeClipboard: (
    c: { projectId: string; nodeId: string; mode: "copy" | "cut" } | null,
  ) => void;
  pasteTreeClipboard: (parentId: string | null) => { ok: boolean; error?: string };

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
  addSnippet: (s: Omit<SnippetItem, "id" | "userId" | "updatedAt">) => string;
  removeSnippet: (id: string) => void;
  addVariable: (v: Omit<VariableItem, "id" | "userId">) => string;
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

/** Extract a node out of the tree, returning [treeWithoutNode, extractedNode]. */
function extractNode(
  tree: TreeNode[],
  id: string,
): { tree: TreeNode[]; extracted: TreeNode | null } {
  let extracted: TreeNode | null = null;
  const walk = (nodes: TreeNode[]): TreeNode[] => {
    const out: TreeNode[] = [];
    for (const n of nodes) {
      if (n.id === id) {
        extracted = n;
        continue;
      }
      out.push(n.children ? { ...n, children: walk(n.children) } : n);
    }
    return out;
  };
  return { tree: walk(tree), extracted };
}

/** Insert a node under a target folder; if parentId is null, push to root. */
function insertUnder(
  tree: TreeNode[],
  parentId: string | null,
  node: TreeNode,
): TreeNode[] {
  if (parentId === null) return [...tree, node];
  return tree.map((n) => {
    if (n.id === parentId && n.type === "folder") {
      return { ...n, open: true, children: [...(n.children ?? []), node] };
    }
    if (n.children) return { ...n, children: insertUnder(n.children, parentId, node) };
    return n;
  });
}

/** Does `n` contain `id` somewhere in its descendants (or itself)? */
function nodeContains(n: TreeNode, id: string): boolean {
  if (n.id === id) return true;
  return (n.children ?? []).some((c) => nodeContains(c, id));
}

/** Deep-clone a node with fresh ids throughout. */
function cloneNodeDeep(n: TreeNode): TreeNode {
  return {
    ...n,
    id: uid(n.type === "folder" ? "d" : "f"),
    children: n.children ? n.children.map(cloneNodeDeep) : undefined,
    updatedAt: Date.now(),
  };
}

/** Append " 副本" / " 副本 (2)" to a name, before the extension if any. */
function renamedForCopy(name: string): string {
  const m = name.match(/^(.+?)(\.[^.]+)?$/);
  if (!m) return name + " 副本";
  const stem = m[1] ?? name;
  const ext = m[2] ?? "";
  const tail = /副本(?:\s*\((\d+)\))?$/.exec(stem);
  if (tail) {
    const n = tail[1] ? parseInt(tail[1], 10) + 1 : 2;
    return stem.replace(/副本(?:\s*\(\d+\))?$/, `副本 (${n})`) + ext;
  }
  return `${stem} 副本${ext}`;
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
      accounts: [],
      currentUserId: null,
      projects: [],
      clipboard: [],
      snippets: [],
      variables: [],
      installedSkills: SEED.installed(),
      settings: SEED.settings(),
      toasts: [],

      /* ---------- Auth ---------- */
      register: async (input) => {
        const email = input.email.trim().toLowerCase();
        if (get().accounts.some((a) => a.email === email)) {
          return { ok: false, error: "该邮箱已注册" };
        }
        const id = uid("user");
        const salt = generateSalt();
        const passwordHash = await hashPassword(input.password, salt);
        const initials = (input.name.match(/[一-龥A-Za-z]/g) ?? ["U"])
          .slice(0, 1)
          .join("");
        const account: Account = {
          id,
          email,
          name: input.name.trim() || email.split("@")[0],
          passwordHash,
          passwordSalt: salt,
          group: input.group,
          role: input.role,
          organization: input.organization,
          avatar: initials,
          createdAt: Date.now(),
          lastSeenAt: Date.now(),
        };
        const seed = input.seedDemo ? seedForGroup(id, input.group) : null;
        // Replace installedSkills with group defaults on first-ever account; on
        // additional accounts, augment (union) so prior users still see their picks.
        const isFirstUser = get().accounts.length === 0;
        const groupDefaults = defaultInstalledFor(input.group);
        const nextInstalled = isFirstUser
          ? groupDefaults
          : Array.from(new Set([...get().installedSkills, ...groupDefaults]));

        set({
          accounts: [...get().accounts, account],
          currentUserId: id,
          projects: seed ? [...get().projects, ...seed.projects] : get().projects,
          clipboard: seed ? [...get().clipboard, ...seed.clipboard] : get().clipboard,
          snippets: seed ? [...get().snippets, ...seed.snippets] : get().snippets,
          variables: seed ? [...get().variables, ...seed.variables] : get().variables,
          installedSkills: nextInstalled,
          settings: {
            ...get().settings,
            agentTitle: account.name,
            marketplaceGroupFilter: input.group,
          },
        });
        get().pushToast(`欢迎,${account.name}`, "ok");
        return { ok: true };
      },

      login: async (email, password) => {
        const e = email.trim().toLowerCase();
        const account = get().accounts.find((a) => a.email === e);
        if (!account) return { ok: false, error: "账号不存在" };
        const ok = await verifyPassword(password, account.passwordSalt, account.passwordHash);
        if (!ok) return { ok: false, error: "密码错误" };
        set({
          currentUserId: account.id,
          accounts: get().accounts.map((a) =>
            a.id === account.id ? { ...a, lastSeenAt: Date.now() } : a,
          ),
          settings: { ...get().settings, agentTitle: account.name },
        });
        get().pushToast(`欢迎回来,${account.name}`, "ok");
        return { ok: true };
      },

      logout: () => {
        set({ currentUserId: null });
      },

      updateAccount: (id, patch) => {
        set({
          accounts: get().accounts.map((a) => (a.id === id ? { ...a, ...patch } : a)),
        });
      },

      /* ---------- Projects ---------- */
      createProject: (p) => {
        const id = uid("proj");
        const userId = get().currentUserId;
        if (!userId) throw new Error("createProject: no current user");
        const project: Project = {
          id,
          userId,
          name: p.name ?? "未命名项目",
          client: p.client ?? "",
          domain: p.domain ?? "M&A",
          status: p.status ?? "draft",
          progress: 0,
          milestones: { done: 0, total: 5 },
          agentTasks: 0,
          team: p.team ?? [get().accounts.find((a) => a.id === userId)?.avatar ?? "U"],
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

      moveNode: (projectId, nodeId, newParentId) => {
        const project = get().projects.find((p) => p.id === projectId);
        if (!project) return { ok: false, error: "project not found" };
        const { tree, extracted } = extractNode(project.fileTree, nodeId);
        if (!extracted) return { ok: false, error: "node not found" };
        if (newParentId && nodeContains(extracted, newParentId)) {
          get().pushToast("不能把文件夹移动到自身或其子目录中", "warn");
          return { ok: false, error: "would-create-cycle" };
        }
        // No-op if dropping a node onto its existing parent at the root
        // (we approximate via id check)
        if (newParentId === extracted.id) {
          return { ok: false, error: "self" };
        }
        const next = insertUnder(tree, newParentId, extracted);
        set({
          projects: get().projects.map((p) =>
            p.id === projectId ? { ...p, fileTree: next, updatedAt: Date.now() } : p,
          ),
        });
        return { ok: true };
      },

      duplicateNode: (projectId, nodeId, parentId = undefined) => {
        const project = get().projects.find((p) => p.id === projectId);
        if (!project) return null;
        // Find source + locate its current parent (to default insert there)
        let source: TreeNode | null = null;
        let containingParent: string | null = null;
        function walk(nodes: TreeNode[], parent: string | null) {
          for (const n of nodes) {
            if (n.id === nodeId) {
              source = n;
              containingParent = parent;
              return;
            }
            if (n.children) walk(n.children, n.id);
          }
        }
        walk(project.fileTree, null);
        if (!source) return null;
        const copy = cloneNodeDeep(source);
        copy.name = renamedForCopy(copy.name);
        const targetParent = parentId === undefined ? containingParent : parentId;
        set({
          projects: get().projects.map((p) =>
            p.id === projectId
              ? {
                  ...p,
                  fileTree: insertUnder(p.fileTree, targetParent, copy),
                  updatedAt: Date.now(),
                }
              : p,
          ),
        });
        return copy.id;
      },

      treeClipboard: null,
      setTreeClipboard: (c) => set({ treeClipboard: c }),
      pasteTreeClipboard: (parentId) => {
        const clip = get().treeClipboard;
        if (!clip) return { ok: false, error: "empty" };
        if (clip.mode === "cut") {
          const r = get().moveNode(clip.projectId, clip.nodeId, parentId);
          if (r.ok) set({ treeClipboard: null });
          return r;
        }
        // copy mode
        const id = get().duplicateNode(clip.projectId, clip.nodeId, parentId);
        return id ? { ok: true } : { ok: false, error: "source-gone" };
      },

      uploadFiles: async (projectId, parentId, files) => {
        const list = Array.from(files);
        let ok = 0;
        const failed: { name: string; error: string }[] = [];
        const newNodes: TreeNode[] = [];
        const openIds: string[] = [];

        for (const f of list) {
          try {
            const u = await readFile(f);
            if (u.size > WARN_FILE_BYTES) {
              get().pushToast(
                `${u.name} 较大(${formatBytes(u.size)})· 可能影响存储`,
                "warn",
              );
            }
            const id = uid("f");
            newNodes.push({
              id,
              type: "file",
              name: u.name,
              content: u.content,
              binaryData: u.binaryData,
              mimeType: u.mimeType,
              size: u.size,
              icon: fileIconFor(u.kind, u.name),
              updatedAt: Date.now(),
            });
            openIds.push(id);
            ok++;
          } catch (e) {
            failed.push({ name: f.name, error: (e as Error).message });
            get().pushToast((e as Error).message, "warn");
          }
        }

        if (newNodes.length > 0) {
          set({
            projects: get().projects.map((p) => {
              if (p.id !== projectId) return p;
              if (parentId === null) {
                return {
                  ...p,
                  fileTree: [...p.fileTree, ...newNodes],
                  openFileIds: Array.from(new Set([...p.openFileIds, openIds[0]])),
                  activeFileId: openIds[0] ?? p.activeFileId,
                  updatedAt: Date.now(),
                };
              }
              const insert = (nodes: TreeNode[]): TreeNode[] =>
                nodes.map((n) => {
                  if (n.id === parentId && n.type === "folder") {
                    return {
                      ...n,
                      open: true,
                      children: [...(n.children ?? []), ...newNodes],
                    };
                  }
                  if (n.children) return { ...n, children: insert(n.children) };
                  return n;
                });
              return {
                ...p,
                fileTree: insert(p.fileTree),
                openFileIds: Array.from(new Set([...p.openFileIds, openIds[0]])),
                activeFileId: openIds[0] ?? p.activeFileId,
                updatedAt: Date.now(),
              };
            }),
          });
          try {
            // Detect localStorage quota issues
            const blob = JSON.stringify(get().projects);
            if (blob.length > 6 * 1024 * 1024) {
              get().pushToast(
                "工作区接近浏览器存储上限,建议归档或删除部分文件",
                "warn",
              );
            }
          } catch {
            /* ignore */
          }
          get().pushToast(`已上传 ${ok} 个文件`, "ok");
        }

        return { ok, failed };
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
        const userId = get().currentUserId;
        if (!userId) return;
        const myClips = get().clipboard.filter((c) => c.userId === userId);
        const otherClips = get().clipboard.filter((c) => c.userId !== userId);
        const newMy = [
          { id: uid("c"), userId, text, source, createdAt: Date.now() },
          ...myClips.filter((c) => c.text !== text),
        ].slice(0, 20);
        set({ clipboard: [...otherClips, ...newMy] });
      },
      removeClip: (id) => set({ clipboard: get().clipboard.filter((c) => c.id !== id) }),
      addSnippet: (s) => {
        const id = uid("s");
        const userId = get().currentUserId;
        if (!userId) return id;
        set({
          snippets: [{ id, userId, updatedAt: Date.now(), ...s }, ...get().snippets],
        });
        return id;
      },
      removeSnippet: (id) =>
        set({ snippets: get().snippets.filter((s) => s.id !== id) }),
      addVariable: (v) => {
        const id = uid("v");
        const userId = get().currentUserId;
        if (!userId) return id;
        set({ variables: [{ id, userId, ...v }, ...get().variables] });
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
        const userId = get().currentUserId;
        if (!userId) {
          // Logged out: nuke everything
          set({
            accounts: [],
            projects: [],
            clipboard: [],
            snippets: [],
            variables: [],
            installedSkills: SEED.installed(),
            settings: SEED.settings(),
          });
        } else {
          // Logged in: reset only the current user's data, leave other accounts intact
          const account = get().accounts.find((a) => a.id === userId);
          const group = account?.group ?? "law-firm";
          const seed = seedForGroup(userId, group);
          set({
            projects: [
              ...get().projects.filter((p) => p.userId !== userId),
              ...seed.projects,
            ],
            clipboard: [
              ...get().clipboard.filter((c) => c.userId !== userId),
              ...seed.clipboard,
            ],
            snippets: [
              ...get().snippets.filter((s) => s.userId !== userId),
              ...seed.snippets,
            ],
            variables: [
              ...get().variables.filter((v) => v.userId !== userId),
              ...seed.variables,
            ],
            installedSkills: SEED.installed(),
            settings: SEED.settings(),
          });
        }
        get().pushToast("已重置为初始状态", "ok");
      },
    }),
    {
      name: "workdeck-v1",
      version: 3,
      migrate: (persisted: unknown, fromVersion: number) => {
        const p = persisted as Partial<StoreState> & {
          projects?: Project[];
          clipboard?: ClipboardItem[];
          snippets?: SnippetItem[];
          variables?: VariableItem[];
        };
        if (fromVersion < 2) {
          // v1 → v2: create a legacy "Demo" account and tag all old data
          // with its userId. The legacy account has an empty hash, so it
          // can't be logged into directly; users log out and create their
          // own account, or use the seeded demo account flow.
          const demoId = "user_legacy_demo";
          const stamp = <T extends { userId?: string }>(arr: T[] | undefined): T[] =>
            (arr ?? []).map((x) => ({ ...x, userId: x.userId ?? demoId }));
          const legacyAccount: Account = {
            id: demoId,
            email: "legacy@workdeck.local",
            name: "Legacy Demo",
            passwordHash: "",
            passwordSalt: "",
            group: "law-firm",
            role: "lawyer",
            avatar: "L",
            createdAt: Date.now(),
            lastSeenAt: Date.now(),
          };
          return {
            ...(p as object),
            accounts: [legacyAccount],
            currentUserId: null,
            projects: stamp(p.projects),
            clipboard: stamp(p.clipboard),
            snippets: stamp(p.snippets),
            variables: stamp(p.variables),
          } as unknown as StoreState;
        }
        if (fromVersion < 3) {
          // v2 → v3: accounts now require `group` and may carry `organization`
          // (legacy `firm` field rolls in).
          const s = persisted as {
            accounts?: (Account & { firm?: string })[];
          };
          const upd = (s.accounts ?? []).map((a) => ({
            ...a,
            group: a.group ?? ("law-firm" as UserGroup),
            organization: a.organization ?? a.firm,
          }));
          return { ...(persisted as object), accounts: upd } as unknown as StoreState;
        }
        return persisted as StoreState;
      },
      partialize: (s) => ({
        accounts: s.accounts,
        currentUserId: s.currentUserId,
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

/* ============================================
 * Selector helpers — scope reads by current user
 * ============================================ */

export function useCurrentUser(): Account | null {
  return useStore((s) =>
    s.currentUserId ? s.accounts.find((a) => a.id === s.currentUserId) ?? null : null,
  );
}

export function useIsAuthenticated(): boolean {
  return useStore((s) => s.currentUserId !== null);
}

export function useUserProjects(): Project[] {
  return useStore(
    useShallow((s) =>
      s.currentUserId ? s.projects.filter((p) => p.userId === s.currentUserId) : [],
    ),
  );
}

export function useUserClipboard(): ClipboardItem[] {
  return useStore(
    useShallow((s) =>
      s.currentUserId ? s.clipboard.filter((c) => c.userId === s.currentUserId) : [],
    ),
  );
}

export function useUserSnippets(): SnippetItem[] {
  return useStore(
    useShallow((s) =>
      s.currentUserId ? s.snippets.filter((c) => c.userId === s.currentUserId) : [],
    ),
  );
}

export function useUserVariables(): VariableItem[] {
  return useStore(
    useShallow((s) =>
      s.currentUserId ? s.variables.filter((c) => c.userId === s.currentUserId) : [],
    ),
  );
}

/* ---------- Project lookup (still global lookup; consumer must own it) ---------- */
export function useProject(id: string | undefined): Project | undefined {
  return useStore((s) => {
    if (!id || !s.currentUserId) return undefined;
    const p = s.projects.find((x) => x.id === id);
    if (!p) return undefined;
    return p.userId === s.currentUserId ? p : undefined;
  });
}

/* Legacy alias kept so existing call sites compile */
export function _allProjects(): Project[] {
  return useStore.getState().projects;
}
