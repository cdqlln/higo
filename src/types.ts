/* AI WorkDeck · Domain types */

/**
 * 使用群组——AI WorkDeck 面向四类专业用户:
 *   - 律师事务所 (law-firm)
 *   - 公司法务 (in-house)
 *   - 司法工作者 (judiciary)
 *   - 其它专业用户 (other) —— 仲裁员、学者、公证员、立法、执法 等
 */
export type UserGroup = "law-firm" | "in-house" | "judiciary" | "other";

export type Role =
  // 律所
  | "lawyer"
  | "partner"
  | "paralegal"
  | "law-admin"
  // 公司法务
  | "general-counsel"
  | "legal-specialist"
  | "compliance-manager"
  // 司法
  | "judge"
  | "prosecutor"
  | "court-clerk"
  | "judicial-assistant"
  // 其他
  | "arbitrator"
  | "academic"
  | "notary"
  | "legislative"
  | "law-enforcement"
  | "other"
  | "admin";

export interface Account {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  passwordSalt: string;
  group: UserGroup;
  role: Role;
  organization?: string;        // 事务所 / 公司 / 法院 / 机构 名称
  avatar?: string;
  createdAt: number;
  lastSeenAt: number;
}

export const GROUP_LABEL: Record<UserGroup, string> = {
  "law-firm": "律师事务所",
  "in-house": "公司法务",
  judiciary: "司法工作者",
  other: "其它专业用户",
};

export const GROUP_KICKER: Record<UserGroup, string> = {
  "law-firm": "为律师而构建 · 一个工作台,所有法律工作",
  "in-house": "为公司法务而构建 · 合同 · 合规 · 调查 一站完成",
  judiciary: "为司法工作者而构建 · 卷宗 · 文书 · 检索 高效协同",
  other: "为法律专业人士而构建 · One Deck for All",
};

export const ROLE_LABEL: Record<Role, string> = {
  // 律所
  lawyer: "执业律师",
  partner: "合伙人",
  paralegal: "律师助理",
  "law-admin": "律所行政",
  // 公司法务
  "general-counsel": "总法律顾问 / 法务经理",
  "legal-specialist": "法务专员",
  "compliance-manager": "合规经理",
  // 司法
  judge: "法官",
  prosecutor: "检察官",
  "court-clerk": "书记员",
  "judicial-assistant": "法官助理",
  // 其他
  arbitrator: "仲裁员",
  academic: "法学学者 / 教授",
  notary: "公证员",
  legislative: "立法工作者",
  "law-enforcement": "执法人员",
  other: "其他",
  // 系统
  admin: "系统管理员",
};

export const GROUP_ROLES: Record<UserGroup, Role[]> = {
  "law-firm": ["lawyer", "partner", "paralegal", "law-admin"],
  "in-house": ["general-counsel", "legal-specialist", "compliance-manager"],
  judiciary: ["judge", "prosecutor", "court-clerk", "judicial-assistant"],
  other: ["arbitrator", "academic", "notary", "legislative", "law-enforcement", "other"],
};

export const GROUP_ORG_LABEL: Record<UserGroup, string> = {
  "law-firm": "所属事务所",
  "in-house": "所在公司",
  judiciary: "所在单位(法院 / 检察院)",
  other: "所在机构",
};

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
  /** for text files: rich-text HTML / markdown / json text */
  content?: string;
  /** for non-text files: data URL (`data:mime/type;base64,...`) */
  binaryData?: string;
  /** MIME type as reported at upload time */
  mimeType?: string;
  /** size in bytes */
  size?: number;
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
  icon: string;
  category: string;
  description: string;
  rating: number;
  installs: number;
  version: string;
  featured?: boolean;
  /** Which user groups this skill is most relevant for. Empty/undefined = all. */
  userGroups?: UserGroup[];
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
  marketplaceGroupFilter?: UserGroup | "all";
}
