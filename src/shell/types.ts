// Command interface and I/O for the shell.

import type { Level, SessionData, User } from '../kernel/types';
import type { Vfs } from '../kernel/vfs';
import type { OS } from '../os';
import type { Seg, Style } from '../render/screen';
import type { Tty } from '../tty';

export type Line = Seg[];

export interface IO {
  /** Prints one or more lines (split on \n). */
  print(text?: string, style?: Style): void;
  /** Prints one styled line. */
  line(segs: Seg[]): void;
  /** Error: inverse video, logged as ERROR. Never captured by pipes. */
  error(msg: string): void;
  /** Warning: bright, logged as WARN. Never captured by pipes. */
  warn(msg: string): void;
  /** Info: dim. Part of the output. */
  info(msg: string): void;
  /** Input from the previous command of a pipe, or null. */
  stdin: string | null;
  /** True when the output goes to a pipe or a file. */
  captured: boolean;
}

export interface JobSpec {
  /** Short name in TOP / MEM: PRINT, PACK... */
  name: string;
  /** Command line shown by JOBS. */
  cmd: string;
  memK: number;
  /** Simulated run time. */
  totalMs: number;
  /** Status line while in the foreground (pct 0..100). */
  status(pct: number): string;
  /** Effects and output at the end. */
  done(io: IO): void;
}

export interface Ask {
  /** Question shown on its own line. */
  prompt: string;
  style?: Style;
  /** Single-key answer: accepted keys (uppercase). */
  keys?: string[];
  /** Line answer (PASSWD). */
  line?: boolean;
  mask?: boolean;
  onAnswer(answer: string): void;
  /** ESC on a line question. */
  onCancel?(): void;
}

export interface BatchFrame {
  path: string;
  params: string[];
  echo: boolean;
  /** Run without trace (AUTOEXEC at login, AT tasks). */
  silent: boolean;
}

export interface CmdCtx {
  os: OS;
  tty: Tty;
  session: SessionData;
  user: User;
  vfs: Vfs;
  io: IO;
  /** Command name as typed (uppercase). */
  name: string;
  args: string[];
  quoted: boolean[];
  /** Raw argument text with its spacing (ECHO, SET, ALIAS). */
  rest: string;
  /** Whole line after expansion. */
  line: string;
  /** Ended with &. */
  background: boolean;
  batch: BatchFrame | null;
  readonly cwd: string;
  /** Absolute path from a user argument. */
  abs(p: string): string;
  /** Opens a full-screen program when the line is done. */
  launch(appId: string, args?: string[]): void;
  /** Starts a long-running job in the foreground or background. */
  job(spec: JobSpec): void;
  /** Asks a question in the console (not available in pipes or batch files). */
  ask(q: Ask): boolean;
  /** Runs another command line in the same context (IF, FOR, AT). */
  run(line: string): void;
  log(level: Level, msg: string): void;
}

export interface Command {
  name: string;
  /** Other names (MD for MKDIR...). */
  aliases?: string[];
  usage: string;
  summary: string;
  group: 'SESSION' | 'FILES' | 'SHELL' | 'PROCESSES' | 'PROGRAMS';
  /** Admin role required. */
  admin?: boolean;
  /** Refused to GUEST (message still says ADMIN ONLY, board [23]). */
  noGuest?: boolean;
  /** Not available in safe mode. */
  noSafe?: boolean;
  /** Minimum number of arguments; fewer prints REQUIRED PARAMETER MISSING. */
  minArgs?: number;
  run(c: CmdCtx): void;
}

export type { User };
