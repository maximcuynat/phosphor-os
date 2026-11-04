// File commands: DIR CD MKDIR RMDIR COPY MOVE REN DEL UNDEL EMPTY TYPE ATTR FIND PACK UNPACK EJECT INSERT.

import { MemoryError, OsError } from '../../kernel/errors';
import type { DriveId, FsNode } from '../../kernel/types';
import { basename, dirname, fullName, hasAttr, hasWildcard, join, matchMask, nodeSize, TRASH_PATH } from '../../kernel/vfs';
import { stampDate, stampTime } from '../../kernel/clock';
import type { Command } from '../types';
import { dirLine, flags, matchFiles, num, pack, params } from './util';

const kfree = (c: { vfs: { free(d: DriveId): number } }, d: DriveId) => `${Math.floor(c.vfs.free(d) / 1024)}K`;

export const DIR: Command = {
  name: 'DIR',
  usage: 'DIR [MASK] [/W] [/S] [/A]',
  summary: 'LIST FILES.  /W WIDE, /S SUBFOLDERS, /A HIDDEN FILES TOO.',
  group: 'FILES',
  run(c) {
    const f = flags(c);
    const wide = f.includes('/W');
    const sub = f.includes('/S');
    const all = f.includes('/A');
    const target = params(c)[0] ?? '';
    let dirPath = c.cwd;
    let mask = '*.*';
    if (target) {
      const abs = c.abs(target);
      if (c.vfs.isDir(abs)) dirPath = abs;
      else {
        dirPath = dirname(abs);
        mask = basename(abs);
        c.vfs.dir(dirPath); // PATH NOT FOUND
      }
    }
    const drive = dirPath[0] as DriveId;
    const header = !wide && !c.io.captured;
    if (header) {
      c.io.info(` VOLUME IN DRIVE ${drive} IS ${c.vfs.label(drive)}`);
      c.io.info(` DIRECTORY OF ${mask === '*.*' ? dirPath : join(dirPath, mask)}`);
    }
    let count = 0;
    const listDir = (path: string, showHeader: boolean) => {
      const nodes = c.vfs.list(path, { hidden: all }).filter((n) => matchMask(fullName(n), mask));
      if (showHeader && nodes.length) c.io.info(` DIRECTORY OF ${path}`);
      if (wide) for (const l of pack(nodes.map((n) => fullName(n).padEnd(11)), 80, '  ', '')) c.io.print(l.trimEnd());
      else for (const n of nodes) c.io.line(n.type === 'dir' ? [{ text: dirLine(n), style: 'b' }] : [{ text: dirLine(n), style: hasAttr(n, 'H') ? 'f' : 'n' }]);
      count += nodes.length;
      if (sub) for (const d of c.vfs.list(path, { hidden: all }).filter((n) => n.type === 'dir')) listDir(join(path, d.name), true);
    };
    listDir(dirPath, false);
    if (!count) {
      const empty = c.vfs.list(dirPath, { hidden: true }).length === 0;
      if (empty) c.io.info(`NO FILES IN ${dirPath}.  TYPE MKDIR NAME TO MAKE A FOLDER.`);
      else c.io.info(`NO FILE MATCHES ${mask} IN ${dirPath}.`);
      return;
    }
    if (!wide) c.io.info(`        ${count} FILE(S)     ${kfree(c, drive)} FREE ON ${drive}:`);
  },
};

export const CD: Command = {
  name: 'CD',
  aliases: ['CHDIR'],
  usage: 'CD [FOLDER]',
  summary: 'CHANGE THE CURRENT FOLDER.  CD .. GOES UP, CD \\ TO THE ROOT.',
  group: 'FILES',
  run(c) {
    const p = params(c)[0];
    if (!p) {
      c.io.print(c.cwd);
      return;
    }
    const abs = c.abs(p);
    const n = c.vfs.get(abs);
    if (!n) throw new OsError(`PATH NOT FOUND: ${abs}.  TYPE DIR TO LIST FOLDERS.`);
    if (n.type !== 'dir') throw new OsError(`${fullName(n)} IS A FILE.  TYPE ${fullName(n)} TO SEE IT, OR CD TO A FOLDER.`);
    c.session.cwd = abs;
  },
};

export const MKDIR: Command = {
  name: 'MKDIR',
  aliases: ['MD'],
  usage: 'MKDIR FOLDER',
  summary: 'MAKE A FOLDER.',
  group: 'FILES',
  minArgs: 1,
  run(c) {
    const abs = c.abs(params(c)[0]);
    c.vfs.mkdir(abs, c.user);
    c.log('INFO', `FOLDER ${abs} CREATED`);
  },
};

export const RMDIR: Command = {
  name: 'RMDIR',
  aliases: ['RD'],
  usage: 'RMDIR FOLDER',
  summary: 'REMOVE AN EMPTY FOLDER.',
  group: 'FILES',
  minArgs: 1,
  run(c) {
    const abs = c.abs(params(c)[0]);
    const n = c.vfs.get(abs);
    if (!n || n.type !== 'dir') throw new OsError(`PATH NOT FOUND: ${abs}.  TYPE DIR TO LIST FOLDERS.`);
    if (n.children?.length) throw new OsError(`FOLDER NOT EMPTY: ${fullName(n)}.  DELETE ITS FILES FIRST.`);
    if (abs === c.cwd || c.cwd.startsWith(abs + '\\')) throw new OsError(`${fullName(n)} IS THE CURRENT FOLDER.  CD .. FIRST.`);
    c.vfs.deleteNow(abs, c.user);
  },
};

function copyOrMove(mode: 'COPY' | 'MOVE'): Command['run'] {
  return (c) => {
    const [src, dst] = params(c);
    const overwrite = flags(c).includes('/Y') || !!c.batch;
    const sources = matchFiles(c, src, { dirs: !hasWildcard(src) });
    const dAbs = c.abs(dst);
    if (sources.length > 1 && !c.vfs.isDir(dAbs)) throw new OsError(`${dAbs} IS NOT A FOLDER.  NAME A FOLDER TO ${mode} SEVERAL FILES.`);
    let n = 0;
    for (const s of sources) {
      if (mode === 'COPY') c.vfs.copy(s, dAbs, c.user, { overwrite });
      else c.vfs.move(s, dAbs, c.user);
      n++;
    }
    c.io.print(`  ${n} FILE(S) ${mode === 'COPY' ? 'COPIED' : 'MOVED'}`);
    if (mode === 'COPY' && flags(c).includes('/V')) c.io.info('  VERIFIED.');
    if (mode === 'MOVE') c.log('INFO', `${n} FILE(S) MOVED TO ${dAbs}`);
  };
}

export const COPY: Command = {
  name: 'COPY',
  usage: 'COPY SRC DST',
  summary: 'COPY ONE OR MORE FILES TO ANOTHER PLACE.  /Y OVERWRITE, /V VERIFY.',
  group: 'FILES',
  minArgs: 2,
  run: copyOrMove('COPY'),
};

export const MOVE: Command = {
  name: 'MOVE',
  usage: 'MOVE SRC DST',
  summary: 'MOVE OR RENAME FILES.',
  group: 'FILES',
  minArgs: 2,
  run: copyOrMove('MOVE'),
};

export const REN: Command = {
  name: 'REN',
  aliases: ['RENAME'],
  usage: 'REN FILE NEWNAME',
  summary: 'RENAME A FILE IN PLACE.',
  group: 'FILES',
  minArgs: 2,
  run(c) {
    const [a, b] = params(c);
    const p = c.vfs.rename(a, b, c.user, c.cwd);
    c.io.info(`RENAMED TO ${basename(p)}.`);
  },
};

export const DEL: Command = {
  name: 'DEL',
  aliases: ['ERASE'],
  usage: 'DEL FILE',
  summary: 'MOVE FILES TO THE TRASH (C:\\TRASH).  UNDEL BRINGS THEM BACK.',
  group: 'FILES',
  minArgs: 1,
  run(c) {
    const paths = matchFiles(c, params(c)[0], { dirs: !hasWildcard(params(c)[0]) });
    let n = 0;
    for (const p of paths) {
      const node = c.vfs.get(p)!;
      if (node.type === 'dir' && !flags(c).includes('/S')) throw new OsError(`${fullName(node)} IS A FOLDER.  USE DEL ${fullName(node)} /S OR RMDIR.`);
      const inTrash = dirname(p) === TRASH_PATH;
      c.vfs.trash(p, c.user);
      c.log('INFO', `${basename(p)} ${inTrash ? 'DELETED FROM TRASH' : 'MOVED TO TRASH'}`);
      n++;
    }
    c.io.print(`  ${n} FILE(S) MOVED TO TRASH.  TYPE UNDEL NAME TO RESTORE.`);
  },
};

export const UNDEL: Command = {
  name: 'UNDEL',
  usage: 'UNDEL [FILE]',
  summary: 'RESTORE A FILE FROM THE TRASH.  NO NAME: LIST THE TRASH.',
  group: 'FILES',
  run(c) {
    const name = params(c)[0];
    if (!name) {
      const items = c.vfs.trashItems();
      if (!items.length) {
        c.io.info('TRASH IS EMPTY.');
        return;
      }
      for (const n of items)
        c.io.print(`  ${fullName(n).padEnd(14)}${(n.from ?? '').padEnd(16)}${n.deletedAt ? `${stampDate(n.deletedAt)} ${stampTime(n.deletedAt)}` : ''}`);
      c.io.info(`  ${items.length} ITEM(S)  ${num(items.reduce((s, n) => s + nodeSize(n), 0))} BYTES`);
      return;
    }
    const p = c.vfs.undel(name, c.user);
    c.log('INFO', `${basename(p)} RESTORED FROM TRASH`);
    c.io.print(`  ${basename(p)} RESTORED TO ${dirname(p)}`);
  },
};

export const EMPTY: Command = {
  name: 'EMPTY',
  usage: 'EMPTY',
  summary: 'PURGE THE TRASH FOR GOOD.',
  group: 'FILES',
  run(c) {
    const items = c.vfs.trashItems();
    if (!items.length) {
      c.io.info('TRASH IS EMPTY.');
      return;
    }
    const doIt = () => {
      const n = c.vfs.emptyTrash();
      c.log('INFO', `TRASH EMPTIED (${n} ITEMS)`);
      c.io.print(`  TRASH EMPTIED: ${n} ITEM(S) DELETED FOR GOOD.`);
    };
    const asked = c.ask({
      prompt: `DELETE ${items.length} ITEM(S) FOR GOOD?  (Y/N)`,
      style: 'b',
      keys: ['Y', 'N', 'ESC'],
      onAnswer: (k) => (k === 'Y' ? doIt() : c.os.tty.console.io.info('NOTHING DELETED.')),
    });
    if (!asked) doIt();
  },
};

export const TYPE: Command = {
  name: 'TYPE',
  usage: 'TYPE FILE',
  summary: 'PRINT A TEXT FILE.',
  group: 'FILES',
  minArgs: 1,
  run(c) {
    const paths = matchFiles(c, params(c)[0]);
    for (const p of paths) {
      if (paths.length > 1) c.io.info(`---------- ${basename(p)}`);
      const node = c.vfs.file(p);
      if (node.content === null) {
        c.io.info(c.vfs.read(p));
        continue;
      }
      const lines = c.vfs.read(p).split('\n');
      if (c.io.captured) c.io.print(lines.join('\n'));
      else lines.forEach((l, i) => c.io.line([{ text: String(i + 1).padStart(3), style: 'd' }, { text: `  ${l}` }]));
    }
  },
};

export const ATTR: Command = {
  name: 'ATTR',
  usage: 'ATTR [+R -R +S -S +H -H +A -A] FILE',
  summary: 'SHOW OR CHANGE ATTRIBUTES: R READ-ONLY, S SYSTEM, H HIDDEN, A ARCHIVE.',
  group: 'FILES',
  minArgs: 1,
  run(c) {
    const changes = c.args.filter((a) => /^[+-][RSHA]$/i.test(a));
    const target = c.args.find((a) => !/^[+-][RSHA]$/i.test(a) && !a.startsWith('/'));
    if (!target) throw new OsError(`REQUIRED PARAMETER MISSING.  USAGE: ${ATTR.usage}`);
    if (changes.some((x) => x[1] === 'S') && c.user.role !== 'admin') throw new OsError(`ADMIN ONLY: ATTR ${changes.join(' ')}.  YOU ARE ${c.user.name}.`, 'WARN');
    const paths = matchFiles(c, target, { dirs: true, hidden: true });
    for (const p of paths) {
      const n = changes.length ? c.vfs.setAttrs(p, changes, c.user) : c.vfs.get(p)!;
      c.io.print(`  ${n.attrs}  ${p}`);
    }
    if (changes.length) c.log('INFO', `ATTR ${changes.join(' ')} ${target}`);
  },
};

export const FIND: Command = {
  name: 'FIND',
  usage: 'FIND "TEXT" [FILE]  OR  FIND PATH MASK [/S]',
  summary: 'SEARCH TEXT IN FILES OR IN THE PIPE, OR SEARCH FILE NAMES.',
  group: 'FILES',
  run(c) {
    const ps = params(c);
    if (!ps.length) throw new OsError(`REQUIRED PARAMETER MISSING.  USAGE: ${FIND.usage}`);
    const textMode = c.quoted[c.args.indexOf(ps[0])] || (c.io.stdin !== null && ps.length === 1);
    if (textMode) {
      const needle = ps[0].toUpperCase();
      const show = (text: string) => {
        let hits = 0;
        text.split('\n').forEach((l, i) => {
          if (l.toUpperCase().includes(needle)) {
            hits++;
            c.io.line([{ text: `${String(i + 1).padStart(3)}:`, style: 'b' }, { text: ` ${l}` }]);
          }
        });
        return hits;
      };
      let hits = 0;
      if (ps.length > 1) {
        for (const p of ps.slice(1).flatMap((a) => matchFiles(c, a))) {
          c.io.info(`---------- ${basename(p)}`);
          hits += show(c.vfs.read(p));
        }
      } else hits = show(c.io.stdin ?? '');
      if (!hits) c.io.info(`NO MATCHES FOR "${needle}".`);
      return;
    }
    // name search
    const sub = flags(c).includes('/S');
    const [root, mask] = ps.length >= 2 ? [c.abs(ps[0]), ps[1]] : [c.cwd, ps[0]];
    c.vfs.dir(root);
    let total = 0;
    const dirsWithFiles = new Set<string>();
    const visit = (dir: string) => {
      const nodes = c.vfs.list(dir);
      const found: string[] = [];
      for (const n of nodes.filter((x) => x.type === 'file')) {
        dirsWithFiles.add(dir);
        if (matchMask(fullName(n), mask)) found.push(join(dir, fullName(n)));
      }
      for (const l of pack(found)) c.io.print(l); // one group of lines per folder
      total += found.length;
      if (sub) for (const n of nodes.filter((x) => x.type === 'dir')) visit(join(dir, fullName(n)));
    };
    visit(root);
    if (!total) {
      c.io.info(`NO FILE MATCHES ${mask} IN ${root}${sub ? ' AND BELOW' : ''}.`);
      return;
    }
    c.io.info(`  ${total} MATCHES IN ${dirsWithFiles.size} DIRECTORIES`);
  },
};

// ------------------------------------------------------------ archives

const ARC_MAGIC = 'PHOSPHOR ARCHIVE 1\n';

function countFiles(n: FsNode): number {
  return n.type === 'file' ? 1 : (n.children ?? []).reduce((s, x) => s + countFiles(x), 0);
}

export const PACK: Command = {
  name: 'PACK',
  usage: 'PACK SOURCE ARCHIVE.ARC',
  summary: 'PACK A FILE OR A FOLDER INTO AN ARCHIVE.  ADD & TO RUN IN THE BACKGROUND.',
  group: 'FILES',
  minArgs: 2,
  run(c) {
    const [src, dst] = params(c);
    const sAbs = c.abs(src);
    const node = c.vfs.get(sAbs);
    if (!node) throw c.vfs.notFound(sAbs);
    const dAbs = c.abs(dst.includes('.') ? dst : `${dst}.ARC`);
    const size = nodeSize(node);
    const cmd = `PACK ${params(c).join(' ')}`;
    c.job({
      name: 'PACK',
      cmd,
      memK: 32,
      totalMs: 2000 + Math.min(20000, size / 2),
      status: (p) => `${cmd}  ${p}%   CTRL+Z TO SEND BACK`,
      done: (io) => {
        const live = c.vfs.get(sAbs);
        if (!live) throw new OsError(`FILE NOT FOUND: ${basename(sAbs)}.  PACK CANCELLED.`);
        const content = ARC_MAGIC + JSON.stringify(live);
        c.vfs.write(dAbs, content, c.user, { op: 'PACK' });
        io.info(`${basename(dAbs)} CREATED: ${countFiles(live)} FILE(S), ${num(content.length)} BYTES.`);
      },
    });
  },
};

export const UNPACK: Command = {
  name: 'UNPACK',
  usage: 'UNPACK ARCHIVE.ARC [FOLDER]',
  summary: 'EXTRACT AN ARCHIVE.  NEEDS 256K OF FREE MEMORY.',
  group: 'FILES',
  minArgs: 1,
  run(c) {
    const need = 256;
    if (c.os.procs.freeK() < need) throw new MemoryError(c.os.procs.freeK(), need);
    const [arc, dest] = params(c);
    const aAbs = c.abs(arc);
    const text = c.vfs.read(aAbs);
    if (!text.startsWith(ARC_MAGIC)) throw new OsError(`${basename(aAbs)} IS NOT AN ARCHIVE.  MAKE ONE WITH PACK.`);
    const node = JSON.parse(text.slice(ARC_MAGIC.length)) as FsNode;
    const target = dest ? c.abs(dest) : c.cwd;
    c.vfs.dir(target);
    const cmd = `UNPACK ${params(c).join(' ')}`;
    c.job({
      name: 'UNPACK',
      cmd,
      memK: need,
      totalMs: 2500,
      status: (p) => `${cmd}  ${p}%   CTRL+Z TO SEND BACK`,
      done: (io) => {
        const parent = c.vfs.dir(target);
        const name = fullName(node);
        if (parent.children!.some((x) => fullName(x) === name)) throw new OsError(`${name} ALREADY EXISTS IN ${target}.  UNPACK CANCELLED.`);
        const free = c.vfs.free(target[0] as DriveId);
        if (nodeSize(node) > free) throw new OsError(`DISK FULL: ${num(free)} BYTES FREE ON ${target[0]}:.  UNPACK CANCELLED.`);
        node.owner = c.user.name;
        parent.children!.push(node);
        io.info(`${countFiles(node)} FILE(S) EXTRACTED TO ${join(target, name)}.`);
      },
    });
  },
};

// ------------------------------------------------------------ floppy drives

export const EJECT: Command = {
  name: 'EJECT',
  usage: 'EJECT B:',
  summary: 'TAKE THE DISK OUT OF A FLOPPY DRIVE (A: OR B:).',
  group: 'FILES',
  minArgs: 1,
  run(c) {
    const d = params(c)[0].replace(':', '').toUpperCase() as DriveId;
    if (d !== 'A' && d !== 'B') throw new OsError(`ONLY A: AND B: CAN BE EJECTED.  C: IS A HARD DISK.`);
    if (c.cwd.startsWith(`${d}:`)) c.session.cwd = 'C:\\';
    c.os.state.drives[d].ready = false;
    c.io.info(`DISK EJECTED FROM ${d}:.  TYPE INSERT ${d}: TO PUT IT BACK.`);
  },
};

export const INSERT: Command = {
  name: 'INSERT',
  usage: 'INSERT B:',
  summary: 'PUT THE DISK BACK IN A FLOPPY DRIVE.',
  group: 'FILES',
  minArgs: 1,
  run(c) {
    const d = params(c)[0].replace(':', '').toUpperCase() as DriveId;
    if (d !== 'A' && d !== 'B') throw new OsError(`ONLY A: AND B: TAKE A DISK.`);
    c.os.state.drives[d].ready = true;
    c.io.info(`DISK INSERTED IN ${d}:.`);
  },
};

export const FILE_COMMANDS = [DIR, CD, MKDIR, RMDIR, COPY, MOVE, REN, DEL, UNDEL, EMPTY, TYPE, ATTR, FIND, PACK, UNPACK, EJECT, INSERT];
