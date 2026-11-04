// [13] FILES: two-panel file manager with trash and clipboard, and the confirm dialog [14].

import type { KeyEvent } from '../input';
import { clipLabel, getClip, setClip } from '../kernel/clipboard';
import { dateStr, hhmm, stampDate } from '../kernel/clock';
import { OsError } from '../kernel/errors';
import type { DriveId, FsNode } from '../kernel/types';
import { NotReadyError, TRASH_PATH, basename, dirname, fullName, join, nodeSize } from '../kernel/vfs';
import { COLS, fit, rfit, type Screen, type Style } from '../render/screen';
import { borderTitle, drawMsg, num, type Msg } from './ui';
import type { App, Ctx } from './types';

const DRIVES: DriveId[] = ['A', 'B', 'C'];
/** Panels occupy rows 2..21, list rows are 4..18. */
const PANEL_Y = 2;
const PANEL_H = 20;
const PANEL_W = 40;
const LIST_Y = 4;
const LIST_ROWS = 15;
const MAX_EDIT = 65536;

interface Panel {
  path: string;
  sel: number;
  top: number;
}

interface Dialog {
  title: string;
  l1: string;
  l2: string;
  yes: boolean;
  run(): void;
  /** Shift+F8: delete at once. */
  now?: () => void;
}

type Prompt = { kind: 'mkdir'; text: string } | { kind: 'attr'; path: string; name: string; was: boolean[]; on: boolean[] };

const ATTRS = ['R', 'S', 'H', 'A'];

const isTrash = (p: Panel): boolean => p.path.toUpperCase() === TRASH_PATH;

/** Key bar with items sized to their text. */
function itemBar(s: Screen, y: number, items: Array<[string, string]>): void {
  let x = 0;
  for (const [k, label] of items) {
    x = s.put(x, y, k);
    x = s.put(x, y, ` ${label} `, 'k') + 1;
  }
}

interface View {
  nodes: FsNode[];
  err: string | null;
}

export class FilesApp implements App {
  id = 'files';
  memK = 42;

  private panels: Panel[] = [
    { path: 'A:\\', sel: 0, top: 0 },
    { path: TRASH_PATH, sel: 0, top: 0 },
  ];
  private active = 0;
  private dialog: Dialog | null = null;
  private prompt: Prompt | null = null;
  private msg: Msg | null = null;
  private nr: { drive: string; retry: () => void } | null = null;

  onEnter(ctx: Ctx, args: string[]): void {
    try {
      this.panels[0].path = ctx.vfs.abs(args[0] ?? ctx.session.cwd);
    } catch {
      this.panels[0].path = 'A:\\';
    }
  }

  // ------------------------------------------------------------ helpers

  private say(ctx: Ctx, text: string, level: Msg['level'] = 'INFO'): void {
    this.msg = { text, level };
    if (level !== 'INFO') ctx.log(level, text);
  }

  /** Runs a file operation; shows FsError messages and offers ABORT, RETRY, FAIL when a drive is not ready. */
  private attempt(ctx: Ctx, op: () => void): void {
    try {
      op();
    } catch (e) {
      if (e instanceof NotReadyError) {
        this.nr = { drive: e.drive, retry: () => this.attempt(ctx, op) };
        ctx.log('ERROR', e.message);
      } else if (e instanceof OsError) this.say(ctx, e.message, e.level);
      else throw e;
    }
  }

  /** Fresh listing of a panel (other TTYs can change the disk). A vanished folder falls back to its parent. */
  private view(ctx: Ctx, p: Panel): View {
    for (;;) {
      try {
        return { nodes: ctx.vfs.list(p.path, { hidden: true }), err: null };
      } catch (e) {
        if (e instanceof NotReadyError) return { nodes: [], err: `DRIVE ${e.drive}: IS NOT READY.` };
        if (e instanceof OsError && p.path.length > 3) {
          p.path = dirname(p.path);
          p.sel = 0;
          continue;
        }
        return { nodes: [], err: e instanceof OsError ? e.message : 'CANNOT READ THIS FOLDER.' };
      }
    }
  }

  private fixSel(p: Panel, n: number): void {
    p.sel = Math.max(0, Math.min(n - 1, p.sel));
    if (p.sel < p.top) p.top = p.sel;
    if (p.sel >= p.top + LIST_ROWS) p.top = p.sel - LIST_ROWS + 1;
    p.top = Math.max(0, Math.min(p.top, Math.max(0, n - LIST_ROWS)));
  }

  private cur(ctx: Ctx): { p: Panel; other: Panel; nodes: FsNode[]; node: FsNode | undefined; path: string } {
    const p = this.panels[this.active];
    const { nodes } = this.view(ctx, p);
    this.fixSel(p, nodes.length);
    const node = nodes[p.sel];
    return { p, other: this.panels[1 - this.active], nodes, node, path: node ? join(p.path, fullName(node)) : p.path };
  }

  private openFolder(ctx: Ctx, p: Panel, path: string, select?: string): void {
    this.attempt(ctx, () => {
      const nodes = ctx.vfs.list(path, { hidden: true });
      p.path = path;
      p.sel = Math.max(0, select ? nodes.findIndex((n) => fullName(n) === select) : 0);
      p.top = 0;
    });
  }

  private launch(ctx: Ctx, appId: string, path: string): void {
    if (!ctx.open(appId, [path])) this.say(ctx, ctx.os.lastError ?? `CANNOT OPEN ${appId.toUpperCase()}.`, 'ERROR');
  }

  // ------------------------------------------------------------ keys

  onKey(ctx: Ctx, e: KeyEvent): void {
    if (this.nr) {
      const nr = this.nr;
      if (e.combo === 'a') this.nr = null;
      else if (e.combo === 'r') {
        this.nr = null;
        nr.retry();
      } else if (e.combo === 'f') {
        this.nr = null;
        this.say(ctx, `DRIVE ${nr.drive}: IS NOT READY.  THE OPERATION FAILED.`, 'ERROR');
      }
      return;
    }
    if (this.dialog) {
      this.dialogKey(ctx, e);
      return;
    }
    if (this.prompt) {
      this.promptKey(ctx, e);
      return;
    }
    this.msg = null;
    const L = this.cur(ctx);
    const { p, node } = L;
    const n = L.nodes.length;
    switch (e.combo) {
      case 'escape':
      case 'f10':
        ctx.exit();
        return;
      case 'arrowup':
        p.sel -= 1;
        break;
      case 'arrowdown':
        p.sel += 1;
        break;
      case 'pageup':
        p.sel -= LIST_ROWS;
        break;
      case 'pagedown':
        p.sel += LIST_ROWS;
        break;
      case 'home':
        p.sel = 0;
        break;
      case 'end':
        p.sel = n - 1;
        break;
      case 'tab':
        this.active = 1 - this.active;
        break;
      case 'backspace':
        if (p.path.length <= 3) this.say(ctx, `${p.path} IS THE ROOT FOLDER.  F2 CHANGES THE DRIVE.`);
        else this.openFolder(ctx, p, dirname(p.path), basename(p.path));
        break;
      case 'enter':
        if (!node) this.say(ctx, 'NOTHING SELECTED.  F7 TO MAKE A FOLDER.');
        else if (node.type === 'dir') this.openFolder(ctx, p, L.path);
        else this.launch(ctx, 'view', L.path);
        break;
      case 'f1':
        if (!ctx.open('help', ['FILES'])) this.say(ctx, ctx.os.lastError ?? 'CANNOT OPEN HELP.', 'ERROR');
        break;
      case 'f2': {
        const next = DRIVES[(DRIVES.indexOf(p.path[0] as DriveId) + 1) % DRIVES.length];
        this.openFolder(ctx, p, `${next}:\\`);
        break;
      }
      case 'f3':
        if (!node) this.say(ctx, 'NOTHING SELECTED.  PICK A FILE FIRST.');
        else if (node.type === 'dir') this.say(ctx, `${fullName(node)} IS A FOLDER.  PRESS ENTER TO OPEN IT.`);
        else this.launch(ctx, 'view', L.path);
        break;
      case 'f4':
        if (!node) this.say(ctx, 'NOTHING SELECTED.  PICK A FILE FIRST.');
        else if (node.type === 'dir') this.say(ctx, `${fullName(node)} IS A FOLDER.  PRESS ENTER TO OPEN IT.`);
        else if (node.content === null) this.say(ctx, `${fullName(node)} IS A BINARY FILE.  OPEN IT WITH F3 VIEW.`, 'WARN');
        else if (node.content.length > MAX_EDIT) this.say(ctx, `${fullName(node)} IS TOO LARGE TO EDIT (MAX 64K).  USE F3 TO VIEW IT.`, 'WARN');
        else this.launch(ctx, 'edit', L.path);
        break;
      case 'f5':
        this.transfer(ctx, 'copy');
        break;
      case 'f6':
        this.transfer(ctx, 'move');
        break;
      case 'f7':
        if (isTrash(p)) this.say(ctx, 'THE TRASH HOLDS DELETED FILES ONLY.  PRESS TAB TO PICK ANOTHER PANEL.', 'WARN');
        else this.prompt = { kind: 'mkdir', text: '' };
        break;
      case 'f8':
        this.askDelete(ctx, false);
        break;
      case 'shift+f8':
        this.askDelete(ctx, true);
        break;
      case 'f9':
        this.askAttr(ctx);
        break;
      case 'ctrl+c':
      case 'ctrl+x': {
        if (!node) {
          this.say(ctx, 'NOTHING SELECTED.  PICK A FILE FIRST.');
          break;
        }
        const cut = e.combo === 'ctrl+x';
        setClip(ctx.os.state, { kind: 'file', mode: cut ? 'cut' : 'copy', path: L.path });
        this.say(ctx, `${fullName(node)} ${cut ? 'CUT' : 'COPIED'} TO THE CLIPBOARD.  CTRL+V PASTES IT.`);
        break;
      }
      case 'ctrl+v':
        this.paste(ctx);
        break;
      case 'u':
        if (isTrash(p)) this.undelete(ctx, node);
        break;
      case 'e':
        if (isTrash(p)) this.askEmpty(ctx, n);
        break;
    }
    this.fixSel(p, n);
  }

  private transfer(ctx: Ctx, mode: 'copy' | 'move'): void {
    const L = this.cur(ctx);
    if (!L.node) return this.say(ctx, 'NOTHING SELECTED.  PICK A FILE FIRST.');
    if (isTrash(L.p)) return this.say(ctx, 'USE U TO RESTORE FILES FROM THE TRASH.', 'WARN');
    this.copyOrMove(ctx, mode, L.path, L.other.path, false);
  }

  private copyOrMove(ctx: Ctx, mode: 'copy' | 'move', src: string, dstDir: string, clearClip: boolean): void {
    if (dstDir.toUpperCase() === TRASH_PATH) return this.say(ctx, 'THE TRASH TAKES DELETED FILES ONLY.  USE F8 TO DELETE.', 'WARN');
    this.attempt(ctx, () => {
      if (mode === 'copy') ctx.vfs.copy(src, dstDir, ctx.user);
      else ctx.vfs.move(src, dstDir, ctx.user);
      if (clearClip) setClip(ctx.os.state, null);
      this.say(ctx, `${mode === 'copy' ? 'COPIED' : 'MOVED'} ${basename(src)} TO ${dstDir}.`);
    });
  }

  private paste(ctx: Ctx): void {
    const clip = getClip(ctx.os.state);
    const p = this.panels[this.active];
    if (!clip) return this.say(ctx, 'CLIPBOARD IS EMPTY.  USE CTRL+C OR CTRL+X FIRST.');
    if (clip.kind === 'text') return this.say(ctx, 'CLIPBOARD HOLDS TEXT, NOT A FILE.  COPY A FILE FIRST.', 'WARN');
    this.copyOrMove(ctx, clip.mode === 'cut' ? 'move' : 'copy', clip.path, p.path, clip.mode === 'cut');
  }

  private undelete(ctx: Ctx, node: FsNode | undefined): void {
    if (!node) return this.say(ctx, 'TRASH IS EMPTY.');
    this.attempt(ctx, () => {
      const name = fullName(node);
      const to = ctx.vfs.undel(name, ctx.user);
      ctx.log('INFO', `${name} RESTORED`);
      this.say(ctx, `RESTORED ${name} TO ${dirname(to)}.`);
    });
  }

  // ------------------------------------------------------------ dialogs

  private askDelete(ctx: Ctx, forGood: boolean): void {
    const L = this.cur(ctx);
    if (!L.node) return this.say(ctx, 'NOTHING SELECTED.  PICK A FILE FIRST.');
    const { path } = L;
    const name = fullName(L.node);
    const now = (): void =>
      this.attempt(ctx, () => {
        ctx.vfs.deleteNow(path, ctx.user);
        ctx.log('INFO', `${name} DELETED`);
        this.say(ctx, `${name} DELETED FOR GOOD.`);
      });
    if (forGood || isTrash(L.p)) {
      this.dialog = { title: 'DELETE FOR GOOD', l1: `DELETE ${path} FOR GOOD ?`, l2: 'THIS CANNOT BE UNDONE.', yes: false, run: now };
      return;
    }
    this.dialog = {
      title: 'MOVE TO TRASH',
      l1: `MOVE ${path} TO ${TRASH_PATH} ?`,
      l2: 'YOU CAN RESTORE IT LATER WITH UNDEL.',
      yes: true,
      run: () =>
        this.attempt(ctx, () => {
          ctx.vfs.trash(path, ctx.user);
          ctx.log('INFO', `${name} MOVED TO TRASH`);
          this.say(ctx, `${name} MOVED TO TRASH.`);
        }),
      now,
    };
  }

  private askEmpty(ctx: Ctx, n: number): void {
    if (!n) return this.say(ctx, 'TRASH IS EMPTY.');
    this.dialog = {
      title: 'EMPTY TRASH',
      l1: `DELETE ${n} ${n === 1 ? 'ITEM' : 'ITEMS'} FOR GOOD ?`,
      l2: 'THIS CANNOT BE UNDONE.',
      yes: false,
      run: () =>
        this.attempt(ctx, () => {
          const k = ctx.vfs.emptyTrash();
          ctx.log('INFO', `TRASH EMPTIED: ${k} ITEMS`);
          this.say(ctx, `TRASH EMPTIED: ${k} ${k === 1 ? 'ITEM' : 'ITEMS'} DELETED.`);
        }),
    };
  }

  private dialogKey(ctx: Ctx, e: KeyEvent): void {
    const d = this.dialog!;
    const close = (): void => {
      this.dialog = null;
    };
    switch (e.combo) {
      case 'y':
        close();
        d.run();
        break;
      case 'n':
      case 'escape':
        close();
        break;
      case 'arrowleft':
      case 'arrowright':
      case 'tab':
        d.yes = !d.yes;
        break;
      case 'enter':
        close();
        if (d.yes) d.run();
        break;
      case 'shift+f8':
        if (d.now) {
          close();
          d.now();
        }
        break;
    }
    void ctx;
  }

  // ------------------------------------------------------------ prompts

  private askAttr(ctx: Ctx): void {
    const L = this.cur(ctx);
    if (!L.node) return this.say(ctx, 'NOTHING SELECTED.  PICK A FILE FIRST.');
    const was = ATTRS.map((a) => L.node!.attrs.includes(a));
    this.prompt = { kind: 'attr', path: L.path, name: fullName(L.node), was, on: [...was] };
  }

  private promptKey(ctx: Ctx, e: KeyEvent): void {
    const pr = this.prompt!;
    if (e.combo === 'escape') {
      this.prompt = null;
      return;
    }
    if (pr.kind === 'mkdir') {
      if (e.combo === 'backspace') pr.text = pr.text.slice(0, -1);
      else if (e.combo === 'enter') {
        this.prompt = null;
        if (!pr.text) return;
        const target = join(this.panels[this.active].path, pr.text);
        this.attempt(ctx, () => {
          ctx.vfs.mkdir(target, ctx.user);
          this.say(ctx, `FOLDER ${pr.text} MADE.`);
          const p = this.panels[this.active];
          const nodes = ctx.vfs.list(p.path, { hidden: true });
          p.sel = Math.max(0, nodes.findIndex((n) => fullName(n) === pr.text));
        });
      } else if (e.ch !== null && e.ch.length === 1 && e.ch !== ' ' && pr.text.length < 12) pr.text += e.ch;
      return;
    }
    const i = ATTRS.indexOf(e.combo.toUpperCase());
    if (i >= 0) pr.on[i] = !pr.on[i];
    else if (e.combo === 'enter') {
      this.prompt = null;
      const changes = ATTRS.flatMap((a, k) => (pr.on[k] === pr.was[k] ? [] : [`${pr.on[k] ? '+' : '-'}${a}`]));
      if (!changes.length) return;
      this.attempt(ctx, () => {
        const node = ctx.vfs.setAttrs(pr.path, changes, ctx.user);
        this.say(ctx, `ATTRIBUTES OF ${pr.name} ARE NOW ${node.attrs}.`);
      });
    }
  }

  // ------------------------------------------------------------ drawing

  render(s: Screen, ctx: Ctx): void {
    const dim = !!this.dialog;
    const activeDrive = this.panels[this.active].path[0] as DriveId;
    s.titleBar(0, 'PHOSPHOR OS  FILES', `${ctx.user.name}  ${dateStr()}  ${hhmm()}`);

    s.put(0, 1, 'DRIVES', 'd');
    let x = 7;
    for (const d of DRIVES) x = s.put(x, 1, ` ${d}: ${ctx.vfs.label(d)} `, d === activeDrive && !dim ? 'i' : 'n') + 2;
    s.putRight(COLS - 1, 1, 'F2 CHANGE DRIVE', 'd');

    this.panels.forEach((p, i) => this.drawPanel(s, ctx, p, i, i === this.active && !dim));

    // clipboard and free space
    s.putSegs(0, 22, [
      { text: 'CLIP ', style: 'd' },
      { text: clipLabel(ctx.os.state, true), style: 'b' },
      { text: '   CTRL+C COPY  CTRL+X CUT  CTRL+V PASTE', style: 'd' },
    ]);
    try {
      s.putRight(COLS - 1, 22, `${activeDrive}: ${num(Math.floor(ctx.vfs.free(activeDrive) / 1024))}K FREE`, 'd');
    } catch {
      s.putRight(COLS - 1, 22, `${activeDrive}: NOT READY`, 'd');
    }

    if (dim) {
      for (let y = 1; y <= 22; y++) for (let cx = 0; cx < COLS; cx++) if (s.chars[y * COLS + cx] !== ' ') s.styles[y * COLS + cx] = 'd';
      this.drawDialog(s, this.dialog!);
      itemBar(s, 24, [
        ['Y', 'YES'],
        ['N', 'NO'],
        ['<->', 'CHOOSE'],
        ['ENTER', 'CONFIRM'],
        ['ESC', 'CANCEL'],
        ['SHIFT+F8', 'DELETE NOW'],
      ]);
      return;
    }

    this.drawPrompt(s, ctx);
    s.keyBar(24, [
      ['1', 'HELP'],
      ['2', 'DRIVE'],
      ['3', 'VIEW'],
      ['4', 'EDIT'],
      ['5', 'COPY'],
      ['6', 'MOVE'],
      ['7', 'MKDIR'],
      ['8', 'TRASH'],
      ['9', 'ATTR'],
      ['10', 'QUIT'],
    ]);
  }

  private drawPrompt(s: Screen, ctx: Ctx): void {
    const pr = this.prompt;
    if (this.nr) s.put(0, 23, `NOT READY READING DRIVE ${this.nr.drive}:  ABORT, RETRY, FAIL?`, 'i');
    else if (pr?.kind === 'mkdir') {
      const cx = s.putSegs(0, 23, [{ text: 'NEW FOLDER NAME: ', style: 'd' }, { text: pr.text, style: 'b' }]);
      s.setCursor(cx, 23);
      s.putRight(COLS - 1, 23, 'ENTER OK  ESC CANCEL', 'd');
    } else if (pr?.kind === 'attr') {
      const segs = [{ text: `ATTR ${pr.name}  `, style: 'd' as Style }];
      ATTRS.forEach((a, i) => segs.push({ text: `${a}[${pr.on[i] ? 'X' : ' '}] `, style: pr.on[i] ? 'b' : 'n' }));
      segs.push({ text: ' ENTER OK  ESC CANCEL', style: 'd' });
      s.putSegs(0, 23, segs);
    } else drawMsg(s, 23, this.msg);
    void ctx;
  }

  private drawPanel(s: Screen, ctx: Ctx, p: Panel, i: number, active: boolean): void {
    const x0 = i * PANEL_W;
    const iw = PANEL_W - 2;
    const ix = x0 + 1;
    const v = this.view(ctx, p);
    this.fixSel(p, v.nodes.length);
    s.box(x0, PANEL_Y, PANEL_W, PANEL_H, active ? 'b' : 'd', { glow: active });
    const title = p.path.length > 30 ? `...${p.path.slice(-27)}` : p.path;
    s.overlays.push({ t: 'rect', x: x0 + Math.floor((PANEL_W - title.length - 2) / 2), y: PANEL_Y, w: title.length + 2, h: 1, tone: 'bg' });
    borderTitle(s, x0, PANEL_Y, PANEL_W, title, active ? 'i' : 'd');

    const trash = isTrash(p);
    const head = trash
      ? ` ${fit('NAME', 12)} ${fit('FROM', 13)} ${fit('DELETED', 8)}`
      : ` ${fit('NAME', 8)} ${fit('EXT', 3)} ${fit('ATTR', 4)} ${rfit('SIZE', iw - 20)} `;
    s.put(ix, 3, fit(head, iw), 'd');

    if (v.err) {
      s.center(10, v.err, 'b', ix, iw);
    } else if (!v.nodes.length) {
      if (trash) s.center(11, 'TRASH IS EMPTY.', 'd', ix, iw);
      else {
        const t = `NO FILES IN ${p.path}.  F7 TO MAKE A FOLDER.`;
        if (t.length <= iw) s.center(11, t, 'd', ix, iw);
        else {
          s.center(10, `NO FILES IN ${p.path}.`.slice(0, iw), 'd', ix, iw);
          s.center(11, 'F7 TO MAKE A FOLDER.', 'd', ix, iw);
        }
      }
    } else {
      for (let r = 0; r < LIST_ROWS; r++) {
        const node = v.nodes[p.top + r];
        if (!node) break;
        const hidden = node.attrs.includes('H');
        const line = trash
          ? ` ${fit(fullName(node), 12)} ${fit(node.from ?? '', 13)} ${fit(stampDate(node.deletedAt ?? ''), 8)}`
          : ` ${fit(node.name, 8)} ${fit(node.ext, 3)} ${fit(node.attrs, 4)} ${rfit(node.type === 'dir' ? '<DIR>' : num(nodeSize(node)), iw - 20)} `;
        let st: Style;
        if (active && p.top + r === p.sel) st = 'i';
        else if (hidden) st = 'f';
        else if (!active) st = 'd';
        else st = node.type === 'dir' ? 'b' : 'n';
        s.put(ix, LIST_Y + r, fit(line, iw), st);
      }
    }

    // footer: two lines inside the panel
    const fy = PANEL_Y + PANEL_H - 3;
    if (trash) {
      const bytes = v.nodes.reduce((a, n) => a + nodeSize(n), 0);
      const off = v.nodes.length === 0;
      s.put(ix + 1, fy, `${v.nodes.length} ITEMS  ${num(bytes)} BYTES`, 'd');
      s.put(ix + 1, fy + 1, 'U UNDEL', off ? 'f' : active ? 'n' : 'd');
      s.put(ix + 11, fy + 1, 'E EMPTY', off ? 'f' : active ? 'n' : 'd');
    } else {
      s.put(ix + 1, fy, 'R READ-ONLY  S SYSTEM', 'd');
      s.put(ix + 1, fy + 1, 'H HIDDEN  A ARCHIVE', 'd');
    }
  }

  private drawDialog(s: Screen, d: Dialog): void {
    const w = 46;
    const h = 8;
    const x = Math.floor((COLS - w) / 2);
    const y = 7;
    s.overlays.push({ t: 'rect', x: x - 1, y: y - 1, w: w + 2, h: h + 2, tone: 'bg' });
    s.fill(x - 1, y - 1, w + 2, h + 2);
    s.box(x, y, w, h, 'b', { glow: true });
    borderTitle(s, x, y, w, d.title, 'ib');
    const inner = w - 4;
    s.center(y + 2, d.l1.slice(0, inner), 'b', x, w);
    s.center(y + 3, d.l2.slice(0, inner), 'd', x, w);
    const bx = x + Math.floor((w - 17) / 2);
    s.put(bx, y + 5, '[ YES ]', d.yes ? 'i' : 'n');
    s.put(bx + 11, y + 5, '[ NO ]', d.yes ? 'n' : 'i');
  }
}
