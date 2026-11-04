// Virtual file system: drives A: B: C:, 8.3 names, RSHA attributes, trash in C:\TRASH.

import { stamp } from './clock';
import { OsError } from './errors';
import type { DriveId, FsNode, OSState, Role } from './types';

export const TRASH_PATH = 'C:\\TRASH';
const DRIVES: DriveId[] = ['A', 'B', 'C'];

/** Error with a ready-to-print one-line message (brief §10). */
export class FsError extends OsError {
  constructor(message: string) {
    super(message);
    this.name = 'FsError';
  }
}

/** Drive without a disk: the caller must offer ABORT, RETRY, FAIL. */
export class NotReadyError extends FsError {
  constructor(public drive: DriveId) {
    super(`NOT READY READING DRIVE ${drive}:  ABORT, RETRY, FAIL?`);
    this.name = 'NotReadyError';
  }
}

export interface Actor {
  name: string;
  role: Role;
}

export interface PathRef {
  drive: DriveId;
  /** Full names, e.g. ['DOCS', 'README.TXT'] */
  parts: string[];
}

// ---------- names and paths ----------

export function fullName(n: FsNode): string {
  return n.ext ? `${n.name}.${n.ext}` : n.name;
}

export function splitName(full: string): { name: string; ext: string } {
  const i = full.lastIndexOf('.');
  if (i <= 0) return { name: full, ext: '' };
  return { name: full.slice(0, i), ext: full.slice(i + 1) };
}

const NAME_RE = /^[A-Z0-9_\-$~!#%&{}()@']{1,8}$/;
const EXT_RE = /^[A-Z0-9_\-$~!#%&{}()@']{0,3}$/;

export function isValidName(full: string): boolean {
  const { name, ext } = splitName(full.toUpperCase());
  return NAME_RE.test(name) && EXT_RE.test(ext) && !(full.endsWith('.') && ext === '');
}

export function parsePath(input: string, cwd: string): PathRef {
  let s = input.trim().toUpperCase().replace(/\//g, '\\');
  const base = parseAbs(cwd);
  let drive = base.drive;
  let parts = [...base.parts];
  const dm = /^([A-Z]):/.exec(s);
  if (dm) {
    const d = dm[1] as DriveId;
    if (!DRIVES.includes(d)) throw new FsError(`INVALID DRIVE ${dm[1]}:.  DRIVES ARE A:, B: AND C:.`);
    drive = d;
    s = s.slice(2);
    parts = d === base.drive ? parts : [];
    if (!s.startsWith('\\') && d !== base.drive) parts = [];
  }
  if (s.startsWith('\\')) {
    parts = [];
    s = s.slice(1);
  }
  for (const seg of s.split('\\')) {
    if (!seg || seg === '.') continue;
    if (seg === '..') parts.pop();
    else parts.push(seg);
  }
  return { drive, parts };
}

function parseAbs(path: string): PathRef {
  const m = /^([A-C]):\\?(.*)$/i.exec(path);
  if (!m) return { drive: 'A', parts: [] };
  return { drive: m[1].toUpperCase() as DriveId, parts: m[2].split('\\').filter(Boolean).map((p) => p.toUpperCase()) };
}

export function formatPath(r: PathRef): string {
  return `${r.drive}:\\${r.parts.join('\\')}`;
}

/** Joins a directory path and a name. */
export function join(dir: string, name: string): string {
  return dir.endsWith('\\') ? dir + name : `${dir}\\${name}`;
}

export function dirname(path: string): string {
  const r = parseAbs(path);
  r.parts.pop();
  return formatPath(r);
}

export function basename(path: string): string {
  const r = parseAbs(path);
  return r.parts[r.parts.length - 1] ?? '';
}

/** DOS-style mask match with * and ?. "*" and "*.*" match everything. */
export function matchMask(full: string, mask: string): boolean {
  const m = mask.toUpperCase();
  if (m === '*' || m === '*.*') return true;
  const re = new RegExp(
    '^' +
      m
        .split('')
        .map((c) => (c === '*' ? '.*' : c === '?' ? '.' : c.replace(/[.+^${}()|[\]\\]/g, '\\$&')))
        .join('') +
      '$',
  );
  if (re.test(full)) return true;
  // "README.*" should match "README" (no extension)
  if (m.endsWith('.*') && !full.includes('.')) return matchMask(full, m.slice(0, -2));
  return false;
}

export function hasWildcard(s: string): boolean {
  return /[*?]/.test(s);
}

export function levenshtein(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...new Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return dp[a.length][b.length];
}

export function hasAttr(n: FsNode, a: 'R' | 'S' | 'H' | 'A'): boolean {
  return n.attrs.includes(a);
}

export function nodeSize(n: FsNode): number {
  if (n.type === 'dir') return (n.children ?? []).reduce((s, c) => s + nodeSize(c), 0);
  return n.content !== null ? n.content.length : n.size;
}

export function makeFile(full: string, content: string | null, opts: Partial<FsNode> = {}): FsNode {
  const { name, ext } = splitName(full.toUpperCase());
  return {
    name,
    ext,
    type: 'file',
    attrs: '---A',
    size: content !== null ? content.length : 0,
    modified: stamp(),
    owner: 'ADMIN',
    content,
    children: null,
    ...opts,
  };
}

export function makeDir(full: string, children: FsNode[] = [], opts: Partial<FsNode> = {}): FsNode {
  return {
    name: full.toUpperCase(),
    ext: '',
    type: 'dir',
    attrs: '----',
    size: 0,
    modified: stamp(),
    owner: 'ADMIN',
    content: null,
    children,
    ...opts,
  };
}

function cloneNode(n: FsNode): FsNode {
  return JSON.parse(JSON.stringify(n));
}

function setAttrChar(attrs: string, a: string, on: boolean): string {
  const order = 'RSHA';
  const i = order.indexOf(a);
  const arr = (attrs + '----').slice(0, 4).split('');
  arr[i] = on ? a : '-';
  return arr.join('');
}

// ---------- the file system ----------

export interface VfsHooks {
  /** Returns generated content for virtual files (EVENTS.LOG), or null. */
  virtual?(path: string): string | null;
}

export class Vfs {
  constructor(
    private state: () => OSState,
    private hooks: VfsHooks = {},
  ) {}

  private drives() {
    return this.state().drives;
  }

  ensureReady(d: DriveId): void {
    if (!this.drives()[d].ready) throw new NotReadyError(d);
  }

  resolve(path: string, cwd = 'A:\\'): PathRef {
    return parsePath(path, cwd);
  }

  abs(path: string, cwd = 'A:\\'): string {
    return formatPath(parsePath(path, cwd));
  }

  /** Node at path, or null. Throws NotReadyError on an empty drive. */
  get(path: string, cwd = 'A:\\'): FsNode | null {
    const r = parsePath(path, cwd);
    this.ensureReady(r.drive);
    let node: FsNode = this.drives()[r.drive].root;
    for (const part of r.parts) {
      if (node.type !== 'dir' || !node.children) return null;
      const next = node.children.find((c) => fullName(c) === part);
      if (!next) return null;
      node = next;
    }
    return node;
  }

  exists(path: string, cwd = 'A:\\'): boolean {
    try {
      return this.get(path, cwd) !== null;
    } catch {
      return false;
    }
  }

  isDir(path: string, cwd = 'A:\\'): boolean {
    try {
      return this.get(path, cwd)?.type === 'dir';
    } catch {
      return false;
    }
  }

  /** Directory node or a PATH NOT FOUND error. */
  dir(path: string, cwd = 'A:\\'): FsNode {
    const n = this.get(path, cwd);
    if (!n || n.type !== 'dir') throw new FsError(`PATH NOT FOUND: ${this.abs(path, cwd)}.  TYPE DIR TO LIST FOLDERS.`);
    return n;
  }

  /** File node or FILE NOT FOUND with a suggestion when 1 or 2 letters off. */
  file(path: string, cwd = 'A:\\'): FsNode {
    const n = this.get(path, cwd);
    if (n && n.type === 'file') return n;
    if (n && n.type === 'dir') throw new FsError(`${basename(this.abs(path, cwd))} IS A FOLDER.  TYPE CD ${basename(this.abs(path, cwd))} TO OPEN IT.`);
    throw this.notFound(path, cwd);
  }

  notFound(path: string, cwd = 'A:\\'): FsError {
    const abs = this.abs(path, cwd);
    const name = basename(abs) || abs;
    const sug = this.suggest(dirname(abs), name);
    return new FsError(
      sug ? `FILE NOT FOUND: ${name}.  DID YOU MEAN ${sug}?` : `FILE NOT FOUND: ${name}.  TYPE DIR TO LIST FILES.`,
    );
  }

  suggest(dirPath: string, name: string): string | null {
    let best: string | null = null;
    let bestD = 3;
    try {
      const d = this.get(dirPath);
      for (const c of d?.children ?? []) {
        const fn = fullName(c);
        const dist = levenshtein(fn, name);
        if (dist > 0 && dist < bestD) {
          bestD = dist;
          best = fn;
        }
      }
    } catch {
      /* ignore */
    }
    return best;
  }

  list(dirPath: string, opts: { hidden?: boolean } = {}): FsNode[] {
    const d = this.dir(dirPath);
    const visible = (d.children ?? []).filter((c) => opts.hidden || !hasAttr(c, 'H'));
    // folders first, then files, each in disk order
    return [...visible.filter((c) => c.type === 'dir'), ...visible.filter((c) => c.type === 'file')];
  }

  /** Files matching a path that may hold wildcards in its last part. */
  glob(pattern: string, cwd: string, opts: { hidden?: boolean; dirs?: boolean } = {}): { dir: string; nodes: FsNode[] } {
    const abs = this.abs(pattern, cwd);
    const name = basename(abs);
    if (!hasWildcard(name)) {
      const n = this.get(abs);
      return { dir: dirname(abs), nodes: n && (opts.dirs || n.type === 'file') ? [n] : [] };
    }
    const dir = dirname(abs);
    const nodes = this.list(dir, opts).filter((c) => (opts.dirs || c.type === 'file') && matchMask(fullName(c), name));
    return { dir, nodes };
  }

  read(path: string, cwd = 'A:\\'): string {
    const abs = this.abs(path, cwd);
    const n = this.file(abs);
    const v = this.hooks.virtual?.(abs);
    if (v !== null && v !== undefined) return v;
    if (n.content === null) return `${fullName(n)} IS A BINARY FILE (${n.size.toLocaleString('en-US')} BYTES).`;
    return n.content;
  }

  used(d: DriveId): number {
    return nodeSize(this.drives()[d].root);
  }

  free(d: DriveId): number {
    return Math.max(0, this.drives()[d].capacity - this.used(d));
  }

  checkWritable(n: FsNode, who: Actor): void {
    if (hasAttr(n, 'R')) throw new FsError(`ACCESS DENIED: ${fullName(n)} IS READ-ONLY.`);
    if (hasAttr(n, 'S') && who.role !== 'admin')
      throw new FsError(`ACCESS DENIED: ${fullName(n)} IS A SYSTEM FILE.  ADMIN ONLY.`);
  }

  private checkSpace(d: DriveId, extra: number, op: string): void {
    if (extra <= 0) return;
    const free = this.free(d);
    if (extra > free) throw new FsError(`DISK FULL: ${free.toLocaleString('en-US')} BYTES FREE ON ${d}:.  ${op} CANCELLED.`);
  }

  private parentAndName(path: string, cwd: string): { parent: FsNode; name: string; ref: PathRef } {
    const ref = parsePath(path, cwd);
    if (!ref.parts.length) throw new FsError(`${formatPath(ref)} IS THE ROOT FOLDER.  NAME A FILE INSIDE IT.`);
    const name = ref.parts[ref.parts.length - 1];
    const parent = this.dir(formatPath({ drive: ref.drive, parts: ref.parts.slice(0, -1) }));
    return { parent, name, ref };
  }

  /** Creates or replaces a text file. */
  write(path: string, content: string, who: Actor, opts: { append?: boolean; op?: string } = {}, cwd = 'A:\\'): FsNode {
    const { parent, name, ref } = this.parentAndName(path, cwd);
    if (!isValidName(name)) throw new FsError(`INVALID NAME: ${name}.  USE 8.3 NAMES, A-Z 0-9 _ -.`);
    const existing = (parent.children ?? []).find((c) => fullName(c) === name);
    if (existing && existing.type === 'dir') throw new FsError(`${name} IS A FOLDER.  CHOOSE ANOTHER NAME.`);
    if (existing) this.checkWritable(existing, who);
    const prev = existing ? nodeSize(existing) : 0;
    const text = opts.append && existing?.content ? existing.content + content : content;
    this.checkSpace(ref.drive, text.length - prev, opts.op ?? 'SAVE');
    if (existing) {
      existing.content = text;
      existing.size = text.length;
      existing.modified = stamp();
      existing.attrs = setAttrChar(existing.attrs, 'A', true);
      return existing;
    }
    const n = makeFile(name, text, { owner: who.name });
    parent.children!.push(n);
    return n;
  }

  mkdir(path: string, who: Actor, cwd = 'A:\\'): FsNode {
    const { parent, name } = this.parentAndName(path, cwd);
    if (!isValidName(name)) throw new FsError(`INVALID NAME: ${name}.  USE 8.3 NAMES, A-Z 0-9 _ -.`);
    if ((parent.children ?? []).some((c) => fullName(c) === name))
      throw new FsError(`${name} ALREADY EXISTS.  CHOOSE ANOTHER NAME.`);
    if (who.role === 'guest' && hasAttr(parent, 'S')) throw new FsError(`ACCESS DENIED: ${fullName(parent)} IS A SYSTEM FOLDER.  ADMIN ONLY.`);
    const n = makeDir(name, [], { owner: who.name });
    parent.children!.push(n);
    return n;
  }

  /**
   * Copies a file or a folder (recursively). dst may be an existing folder
   * (the source keeps its name) or a new path.
   */
  copy(src: string, dst: string, who: Actor, opts: { overwrite?: boolean } = {}, cwd = 'A:\\'): string {
    const sAbs = this.abs(src, cwd);
    const node = this.get(sAbs);
    if (!node) throw this.notFound(sAbs);
    const target = this.targetPath(sAbs, dst, cwd);
    if (target === sAbs) throw new FsError(`CANNOT COPY ${fullName(node)} ONTO ITSELF.  NAME ANOTHER DESTINATION.`);
    if (node.type === 'dir' && (target + '\\').startsWith(sAbs + '\\'))
      throw new FsError(`CANNOT COPY ${fullName(node)} INTO ITSELF.  CHOOSE ANOTHER FOLDER.`);
    const { parent, name, ref } = this.parentAndName(target, 'A:\\');
    const existing = (parent.children ?? []).find((c) => fullName(c) === name);
    if (existing) {
      if (!opts.overwrite) throw new FsError(`${name} ALREADY EXISTS IN ${dirname(target)}.  USE /Y TO OVERWRITE.`);
      this.checkWritable(existing, who);
    }
    const prev = existing ? nodeSize(existing) : 0;
    this.checkSpace(ref.drive, nodeSize(node) - prev, 'COPY');
    const copy = cloneNode(node);
    const { name: n, ext } = splitName(name);
    copy.name = node.type === 'dir' ? name : n;
    copy.ext = node.type === 'dir' ? '' : ext;
    copy.attrs = setAttrChar(setAttrChar(copy.attrs, 'R', false), 'S', false);
    copy.owner = who.name;
    copy.modified = stamp();
    delete copy.from;
    delete copy.deletedAt;
    if (existing) parent.children!.splice(parent.children!.indexOf(existing), 1, copy);
    else parent.children!.push(copy);
    return target;
  }

  move(src: string, dst: string, who: Actor, cwd = 'A:\\'): string {
    const sAbs = this.abs(src, cwd);
    const node = this.get(sAbs);
    if (!node) throw this.notFound(sAbs);
    this.checkWritable(node, who);
    const target = this.targetPath(sAbs, dst, cwd);
    if (target === sAbs) return target;
    if (node.type === 'dir' && (target + '\\').startsWith(sAbs + '\\'))
      throw new FsError(`CANNOT MOVE ${fullName(node)} INTO ITSELF.  CHOOSE ANOTHER FOLDER.`);
    const { parent, name, ref } = this.parentAndName(target, 'A:\\');
    if ((parent.children ?? []).some((c) => fullName(c) === name))
      throw new FsError(`${name} ALREADY EXISTS IN ${dirname(target)}.  DELETE OR RENAME IT FIRST.`);
    const srcRef = parsePath(sAbs, 'A:\\');
    if (srcRef.drive !== ref.drive) this.checkSpace(ref.drive, nodeSize(node), 'MOVE');
    this.detach(sAbs);
    const { name: n, ext } = splitName(name);
    node.name = node.type === 'dir' ? name : n;
    node.ext = node.type === 'dir' ? '' : ext;
    parent.children!.push(node);
    return target;
  }

  /** Renames in place (keeps position in the folder). */
  rename(path: string, newName: string, who: Actor, cwd = 'A:\\'): string {
    const abs = this.abs(path, cwd);
    const node = this.get(abs);
    if (!node) throw this.notFound(abs);
    this.checkWritable(node, who);
    const nn = newName.toUpperCase();
    if (!isValidName(nn)) throw new FsError(`INVALID NAME: ${nn}.  USE 8.3 NAMES, A-Z 0-9 _ -.`);
    const parent = this.dir(dirname(abs));
    if (parent.children!.some((c) => c !== node && fullName(c) === nn))
      throw new FsError(`${nn} ALREADY EXISTS.  CHOOSE ANOTHER NAME.`);
    const { name, ext } = splitName(nn);
    node.name = node.type === 'dir' ? nn : name;
    node.ext = node.type === 'dir' ? '' : ext;
    return join(dirname(abs), nn);
  }

  private detach(abs: string): FsNode {
    const parent = this.dir(dirname(abs));
    const name = basename(abs);
    const i = parent.children!.findIndex((c) => fullName(c) === name);
    if (i < 0) throw this.notFound(abs);
    return parent.children!.splice(i, 1)[0];
  }

  /** Destination path for COPY/MOVE: into an existing folder, or to a new name. */
  private targetPath(srcAbs: string, dst: string, cwd: string): string {
    const dAbs = this.abs(dst, cwd);
    const dn = this.get(dAbs);
    if (dn && dn.type === 'dir') return join(dAbs, basename(srcAbs));
    return dAbs;
  }

  /** Moves a node to C:\TRASH (or deletes it for good when already in the trash). */
  trash(path: string, who: Actor, cwd = 'A:\\'): void {
    const abs = this.abs(path, cwd);
    const node = this.get(abs);
    if (!node) throw this.notFound(abs);
    this.checkWritable(node, who);
    if (abs === TRASH_PATH) throw new FsError('THE TRASH CANNOT BE DELETED.  TYPE EMPTY TO PURGE IT.');
    if (dirname(abs) === TRASH_PATH) {
      this.detach(abs);
      return;
    }
    this.ensureTrash();
    this.detach(abs);
    node.from = dirname(abs);
    node.deletedAt = stamp();
    this.dir(TRASH_PATH).children!.push(node);
  }

  /** Deletes at once, without the trash (Shift+F8). */
  deleteNow(path: string, who: Actor, cwd = 'A:\\'): void {
    const abs = this.abs(path, cwd);
    const node = this.get(abs);
    if (!node) throw this.notFound(abs);
    this.checkWritable(node, who);
    if (abs === TRASH_PATH) throw new FsError('THE TRASH CANNOT BE DELETED.  TYPE EMPTY TO PURGE IT.');
    this.detach(abs);
  }

  ensureTrash(): FsNode {
    const c = this.drives().C.root;
    let t = c.children!.find((n) => fullName(n) === 'TRASH');
    if (!t) {
      t = makeDir('TRASH');
      c.children!.push(t);
    }
    return t;
  }

  trashItems(): FsNode[] {
    return this.ensureTrash().children ?? [];
  }

  /** Restores the most recent trash entry with this name. Returns the restored path. */
  undel(name: string, who: Actor): string {
    const items = this.trashItems();
    const nn = name.toUpperCase();
    let idx = -1;
    for (let i = items.length - 1; i >= 0; i--) if (fullName(items[i]) === nn) { idx = i; break; }
    if (idx < 0) {
      if (!items.length) throw new FsError('TRASH IS EMPTY.');
      const sug = this.suggest(TRASH_PATH, nn);
      throw new FsError(sug ? `FILE NOT FOUND: ${nn}.  DID YOU MEAN ${sug}?` : `FILE NOT FOUND: ${nn}.  TYPE DIR C:\\TRASH TO LIST IT.`);
    }
    const node = items[idx];
    const from = node.from ?? 'C:\\TEMP';
    let parent: FsNode;
    try {
      parent = this.dir(from);
    } catch {
      throw new FsError(`PATH NOT FOUND: ${from}.  MAKE THE FOLDER AGAIN, THEN RETRY.`);
    }
    if (parent.children!.some((c) => fullName(c) === nn))
      throw new FsError(`${nn} ALREADY EXISTS IN ${from}.  RENAME IT FIRST, THEN RETRY.`);
    const ref = parsePath(from, 'A:\\');
    if (ref.drive !== 'C') this.checkSpace(ref.drive, nodeSize(node), 'UNDEL');
    items.splice(idx, 1);
    delete node.from;
    delete node.deletedAt;
    void who;
    parent.children!.push(node);
    return join(from, nn);
  }

  emptyTrash(): number {
    const t = this.ensureTrash();
    const n = t.children!.length;
    t.children = [];
    return n;
  }

  setAttrs(path: string, changes: string[], who: Actor, cwd = 'A:\\'): FsNode {
    const abs = this.abs(path, cwd);
    const node = this.get(abs);
    if (!node) throw this.notFound(abs);
    const touchesS = changes.some((c) => c[1] === 'S');
    if ((hasAttr(node, 'S') || touchesS) && who.role !== 'admin')
      throw new FsError(`ADMIN ONLY: ATTR ${changes.join(' ')}.  YOU ARE ${who.name}.`);
    let a = node.attrs;
    for (const c of changes) {
      const m = /^([+-])([RSHA])$/.exec(c.toUpperCase());
      if (!m) throw new FsError(`BAD ATTRIBUTE ${c}.  USE +R -R +S -S +H -H +A -A.`);
      a = setAttrChar(a, m[2], m[1] === '+');
    }
    node.attrs = a;
    return node;
  }

  /** Walks a tree depth first, calling fn with each node's absolute path. */
  walk(dirPath: string, fn: (path: string, n: FsNode) => void, opts: { hidden?: boolean } = {}): void {
    const d = this.dir(dirPath);
    for (const c of d.children ?? []) {
      if (!opts.hidden && hasAttr(c, 'H')) continue;
      const p = join(dirPath, fullName(c));
      fn(p, c);
      if (c.type === 'dir') this.walk(p, fn, opts);
    }
  }

  label(d: DriveId): string {
    return this.drives()[d].label;
  }
}
