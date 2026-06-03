/* AI WorkDeck · Domain types */

export type Role = "lawyer" | "partner" | "paralegal" | "admin";

export interface Account {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  passwordSalt: string;
  role: Role;
  firm?: string;
  avatar?: string;        // initials or emoji
  createdAt: number;
  lastSeenAt: number;
}

export type Domain =
  | "M&A"
  | "Administrative"
  | "Compliance"
  | "Arbitration"
  | "Capital Markets"
  | "IP";

export type ProjectStatus = "active" | "urgent" | "draft" | "completed" | "archived";

export interface Project {
  id: string;
  userId: string;         // owner — for per-user isolation
  name: string;
  client: string;
  domain: Domain;
  status: ProjectStatus;
  progress: number;
  milestones: { done: number; total: number };
  agentTasks: number;
  team: string[];
  fileTree: TreeNode[];
  openFileIds: string[];
  activeFileId: string | null;
  mountedMcp: string[];
  conversation: AgentMessage[];
  starred: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface TreeNode {
  id: string;
  type: "folder" | "file";
  name: string;
  /** for files: rich-text HTML content */
  content?: string;
  /** for folders: nested children */
  children?: TreeNode[];
  /** UI: folder open state */
  open?: boolean;
  /** doc icon emoji */
  icon?: string;
  updatedAt: number;
}

/* ---------- Agent ---------- */
export type AgentMessageRole = "user" | "assistant" | "system";

export interface AgentMessage {
  id: string;
  role: AgentMessageRole;
  /** Plain markdown-ish text. Tool blocks rendered from toolCalls. */
  content: string;
  toolCalls?: ToolCall[];
  /** if true, the assistant message is still streaming */
  pending?: boolean;
  createdAt: number;
}

export interface ToolCall {
  id: string;
  name: string;          // e.g. "mcp.admin_penalty.search"
  args: Record<string, unknown>;
  result?: unknown;
  status: "pending" | "running" | "done" | "error";
  ms?: number;
  /** human label, e.g. "行政处罚库 MCP" */
  label?: string;
}

/* ---------- Daily Essentials (per-user, cross-project) ---------- */
export interface ClipboardItem {
  id: string;
  userId: string;
  text: string;
  source?: string;
  createdAt: number;
}

export interface SnippetItem {
  id: string;
  userId: string;
  name: string;
  body: string;
  shortcut?: string;
  updatedAt: number;
}

export interface VariableItem {
  id: string;
  userId: string;
  key: string;
  value: string;
  description?: string;
}

/* ---------- Marketplace ---------- */
export type SkillSource = "official" | "labs" | "partner" | "community";
export type SkillKind = "skill" | "mcp";

export interface Skill {
  id: string;
  name: string;
  author: string;
  source: SkillSource;
  kind: SkillKind;
  icon: string;          // emoji
  category: string;
  description: string;
  rating: number;
  installs: number;
  version: string;
  featured?: boolean;
  /** which tools (if any) this skill exposes when installed */
  exposes?: { name: string; description: string; inputSchema: object }[];
}

/* ---------- Settings ---------- */
export interface SettingsState {
  apiKey: string;
  model: string;
  agentName: string;
  agentTitle: string;
  sidebarCollapsed: boolean;
}
