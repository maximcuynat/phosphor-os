// Serializable OS state (see board [24] and brief §8).

export type DriveId = 'A' | 'B' | 'C';
export type Role = 'admin' | 'user' | 'guest';
export type Level = 'INFO' | 'WARN' | 'ERROR';

export interface FsNode {
  name: string;
  ext: string;
  type: 'file' | 'dir';
  /** 4 chars RSHA, '-' when absent. */
  attrs: string;
  size: number;
  /** ISO-like local timestamp "1984-11-04T09:30". */
  modified: string;
  owner: string;
  content: string | null;
  children: FsNode[] | null;
  /** Trash only: folder the node came from. */
  from?: string;
  /** Trash only. */
  deletedAt?: string;
}

export interface Drive {
  label: string;
  capacity: number;
  ready: boolean;
  root: FsNode;
}

export interface User {
  name: string;
  role: Role;
  passwordHash: string;
  failedTries: number;
  lockedUntil: number | null;
  lastLogin: string | null;
  lastTty?: number;
}

export interface SessionData {
  tty: number;
  user: string | null;
  cwd: string;
  env: Record<string, string>;
  aliases: Record<string, string>;
  history: string[];
  screen: string;
}

export interface ProcInfo {
  pid: number;
  /** Short name shown in TOP (FILES, SHELL, PRINT...). */
  name: string;
  /** Full command line. */
  cmd: string;
  user: string;
  tty: number;
  state: 'run' | 'sleep' | 'stopped';
  background: boolean;
  jobId: number | null;
  memK: number;
  cpu: number;
  progress: number | null;
  /** ms timestamp */
  startedAt: number;
  /** accumulated cpu time, seconds */
  cpuTime: number;
  kind: 'system' | 'shell' | 'app' | 'job';
}

export interface Task {
  id: number;
  /** "1984-11-04T18:00" in fake time (real date with year 84). */
  at: string;
  /** real ms timestamp when it fires */
  due: number;
  cmd: string;
  user: string;
}

export interface LogEntry {
  /** "09:48:20" */
  t: string;
  /** "11-04-84" */
  d: string;
  level: Level;
  user: string;
  msg: string;
}

export type Clip =
  | { kind: 'file'; mode: 'copy' | 'cut'; path: string }
  | { kind: 'text'; text: string };

export interface Settings {
  phosphor: 'green' | 'amber' | 'white';
  glow: number;
  scanlines: boolean;
  cursorBlinkMs: number;
  screensaverMin: number;
  lockOnWake: boolean;
  powerOnEffect: boolean;
  bootOrder: string;
}

export interface Installed {
  name: string;
  version: string;
  command: string;
  path: string;
  memK: number;
}

export interface OSState {
  version: 1;
  drives: Record<DriveId, Drive>;
  users: User[];
  sessions: SessionData[];
  processes: ProcInfo[];
  tasks: Task[];
  log: LogEntry[];
  clipboard: Clip | null;
  settings: Settings;
  installed: Installed[];
  counters: { pid: number; task: number; boot: number };
}

export const DEFAULT_SETTINGS: Settings = {
  phosphor: 'green',
  glow: 6,
  scanlines: true,
  cursorBlinkMs: 1060,
  screensaverMin: 5,
  lockOnWake: true,
  powerOnEffect: true,
  bootOrder: 'A: C:',
};
