import { describe, expect, it } from 'vitest';
import { bootOS, login, press, run, screen, type, tick } from './helpers';
import type { OS } from '../src/os';

function files(arg = ''): OS {
  const os = bootOS();
  login(os);
  run(os, arg ? `FILES ${arg}` : 'FILES');
  return os;
}

const down = (os: OS, n: number) => {
  for (let i = 0; i < n; i++) press(os, 'arrowdown');
};

/** Selects a root file of A: (folders first: DOCS GAMES SYSTEM, then files in disk order). */
const NOTES = 6;

describe('[13] FILES', () => {
  it('opens on the cwd, folders first, trash on the right', () => {
    const os = files();
    const t = screen(os);
    expect(t).toContain('PHOSPHOR OS  FILES');
    expect(t).toContain('ADMIN  ');
    expect(t).toContain('DRIVES');
    expect(t).toContain('A: SYSTEM');
    const rows = t.split('\n');
    const iDocs = rows.findIndex((r) => /\bDOCS {5}/.test(r));
    const iAuto = rows.findIndex((r) => r.includes('AUTOEXEC'));
    expect(iDocs).toBeGreaterThan(0);
    expect(iDocs).toBeLessThan(iAuto);
    expect(t).toContain('<DIR>');
    expect(t).toContain('SECRET');
    expect(t).toContain('DRAFT.TXT');
    expect(t).toContain('3 ITEMS');
    expect(t).toContain('U UNDEL');
    expect(rows[24]).toContain('1 HELP');
    expect(rows[24]).toContain('10 QUIT');
    press(os, 'escape');
    expect(screen(os)).not.toContain('DRIVES');
  });

  it('F8 + Enter moves NOTES.TXT to the trash, U restores it', () => {
    const os = files();
    down(os, NOTES);
    press(os, 'f8');
    const t = screen(os);
    expect(t).toContain('MOVE TO TRASH');
    expect(t).toContain('MOVE A:\\NOTES.TXT TO C:\\TRASH ?');
    expect(t).toContain('YOU CAN RESTORE IT LATER WITH UNDEL.');
    expect(t).toContain('[ YES ]');
    press(os, 'enter');
    expect(os.vfs.exists('A:\\NOTES.TXT')).toBe(false);
    expect(os.vfs.exists('C:\\TRASH\\NOTES.TXT')).toBe(true);
    expect(screen(os)).toContain('NOTES.TXT MOVED TO TRASH.');
    expect(os.state.log.some((e) => e.level === 'INFO' && e.msg === 'NOTES.TXT MOVED TO TRASH')).toBe(true);

    press(os, 'tab');
    // trash items: DRAFT.TXT TEMP.DAT SCORES.DAT NOTES.TXT
    down(os, 3);
    press(os, 'u');
    expect(os.vfs.exists('A:\\NOTES.TXT')).toBe(true);
    expect(os.vfs.exists('C:\\TRASH\\NOTES.TXT')).toBe(false);
  });

  it('ESC in the confirm dialog keeps the file', () => {
    const os = files();
    down(os, NOTES);
    press(os, 'f8');
    press(os, 'escape');
    expect(os.vfs.exists('A:\\NOTES.TXT')).toBe(true);
    expect(screen(os)).not.toContain('MOVE TO TRASH');
  });

  it('F5 copies to the other panel', () => {
    const os = files();
    press(os, 'tab');
    press(os, 'f2'); // trash panel -> A:\ is next after C
    press(os, 'f2');
    press(os, 'f2'); // back on C:\
    press(os, 'tab');
    down(os, NOTES);
    press(os, 'f5');
    expect(os.vfs.exists('C:\\NOTES.TXT')).toBe(true);
    expect(os.vfs.exists('A:\\NOTES.TXT')).toBe(true);
    expect(screen(os)).toContain('COPIED NOTES.TXT TO C:\\.');
  });

  it('shows the empty folder and empty trash texts', () => {
    const os = files();
    press(os, 'arrowdown'); // GAMES
    press(os, 'enter');
    expect(screen(os)).toContain('NO FILES IN A:\\GAMES.');
    expect(screen(os)).toContain('F7 TO MAKE A FOLDER.');
    press(os, 'tab');
    press(os, 'e');
    press(os, 'y');
    expect(os.vfs.trashItems()).toHaveLength(0);
    expect(screen(os)).toContain('TRASH IS EMPTY.');
  });

  it('Ctrl+C then Ctrl+V pastes a copy into the active folder', () => {
    const os = files();
    down(os, NOTES);
    press(os, 'ctrl+c');
    expect(screen(os)).toContain('CLIP NOTES.TXT (COPY)');
    press(os, 'arrowup');
    press(os, 'arrowup');
    press(os, 'arrowup');
    press(os, 'arrowup');
    press(os, 'arrowup');
    press(os, 'arrowup'); // DOCS
    press(os, 'enter');
    press(os, 'ctrl+v');
    expect(os.vfs.exists('A:\\DOCS\\NOTES.TXT')).toBe(true);
    expect(os.vfs.exists('A:\\NOTES.TXT')).toBe(true);
  });

  it('F7 makes a folder, F9 changes attributes', () => {
    const os = files();
    press(os, 'f7');
    type(os, 'WORK');
    press(os, 'enter');
    expect(os.vfs.isDir('A:\\WORK')).toBe(true);
    down(os, 20);
    press(os, 'home');
    down(os, NOTES + 2); // TODO.TXT (WORK folder shifts files by one)
    press(os, 'f9');
    press(os, 'r');
    press(os, 'enter');
    expect(os.vfs.get('A:\\TODO.TXT')?.attrs[0]).toBe('R');
  });
});

describe('[15] VIEW', () => {
  it('finds a word and jumps to the next match with N', () => {
    const os = bootOS();
    login(os);
    run(os, 'VIEW DOCS\\MANUAL.TXT');
    expect(screen(os)).toContain('VIEW  A:\\DOCS\\MANUAL.TXT');
    expect(screen(os)).toContain('READ ONLY');
    type(os, '/');
    type(os, 'MEMORY');
    press(os, 'enter');
    let t = screen(os);
    expect(t).toMatch(/FIND \/MEMORY {3}MATCH 1 OF \d+/);
    press(os, 'n');
    t = screen(os);
    expect(t).toMatch(/MATCH 2 OF \d+/);
    expect(t).toMatch(/LINES \d+-\d+ OF \d+ {3}\d+%/);
    press(os, 'escape');
    expect(screen(os)).not.toContain('READ ONLY');
  });

  it('shows the binary message', () => {
    const os = bootOS();
    login(os);
    run(os, 'VIEW DOCS\\BUDGET.DAT');
    expect(screen(os)).toContain('BUDGET.DAT IS A BINARY FILE (1,536 BYTES).');
  });
});

describe('[16] EDIT', () => {
  it('types text and saves with Ctrl+S', () => {
    const os = bootOS();
    login(os);
    run(os, 'EDIT NEW1.TXT');
    expect(screen(os)).toContain('NEW FILE');
    type(os, 'HELLO');
    press(os, 'enter');
    type(os, 'WORLD');
    expect(screen(os)).toContain('* MODIFIED');
    expect(screen(os)).toMatch(/LN 2 {2}COL 6 {3}INS/);
    press(os, 'ctrl+s');
    expect(os.vfs.read('A:\\NEW1.TXT')).toBe('HELLO\nWORLD');
    expect(screen(os)).toContain('SAVED NEW1.TXT: 11 BYTES.');
    expect(os.state.log.some((e) => e.level === 'INFO' && e.msg === 'NEW1.TXT SAVED')).toBe(true);
    press(os, 'escape');
    expect(screen(os)).not.toContain('LN 2');
  });

  it('asks to save on ESC and N discards', () => {
    const os = bootOS();
    login(os);
    run(os, 'EDIT NOTES.TXT');
    type(os, 'X');
    press(os, 'escape');
    expect(screen(os)).toContain('SAVE CHANGES TO NOTES.TXT?  (Y/N/ESC)');
    press(os, 'escape');
    expect(screen(os)).not.toContain('SAVE CHANGES');
    press(os, 'escape');
    press(os, 'n');
    expect(screen(os)).not.toContain('EDIT  ');
    expect(os.vfs.read('A:\\NOTES.TXT').startsWith('X')).toBe(false);
  });

  it('holds a TTY switch while modified', () => {
    const os = bootOS();
    login(os);
    run(os, 'EDIT NOTES.TXT');
    type(os, 'X');
    press(os, 'alt+f2');
    expect(os.tty.n).toBe(1);
    expect(screen(os)).toContain('SAVE CHANGES TO NOTES.TXT?');
    press(os, 'n');
    tick(os, 100);
    expect(os.tty.n).toBe(2);
  });

  it('shows the read-only error on CONFIG.SYS', () => {
    const os = bootOS();
    login(os);
    run(os, 'EDIT CONFIG.SYS');
    type(os, 'X');
    press(os, 'ctrl+s');
    expect(screen(os)).toContain('ACCESS DENIED: CONFIG.SYS IS READ-ONLY.');
    expect(os.state.log.some((e) => e.level === 'ERROR' && e.msg === 'ACCESS DENIED: CONFIG.SYS IS READ-ONLY.')).toBe(true);
  });

  it('cuts a line and pastes it back with Ctrl+X and Ctrl+V', () => {
    const os = bootOS();
    login(os);
    run(os, 'EDIT NEW2.TXT');
    type(os, 'AAA');
    press(os, 'enter');
    type(os, 'BBB');
    press(os, 'ctrl+x');
    press(os, 'ctrl+v');
    press(os, 'ctrl+s');
    expect(os.vfs.read('A:\\NEW2.TXT')).toBe('BBB\nAAA');
  });
});
