import { describe, expect, it } from 'vitest';
import { bootOS, consoleLines, login, press, run, since, tick } from './helpers';

describe('[09] console basics', () => {
  it('logs in, runs AUTOEXEC.BAT silently and greets the user', () => {
    const os = bootOS();
    login(os);
    const lines = consoleLines(os);
    expect(lines[0]).toBe('PHOSPHOR OS  VERSION 1.0');
    expect(lines[1]).toMatch(/^\(C\) 1984 PHOSPHOR SYSTEMS\.  640K RAM  \d+K FREE$/);
    expect(lines).toContain('WELCOME, ADMIN.  TYPE HELP FOR A LIST OF COMMANDS.');
    expect(lines.some((l) => l.includes('ECHO OFF'))).toBe(false);
    expect(os.tty.session.env.PATH).toBe('A:\\SYSTEM;C:\\BIN');
    expect(os.tty.session.aliases.LS).toBe('DIR /W');
    expect(os.state.tasks).toHaveLength(1);
    expect(os.tty.console.prompt()).toBe('ADMIN@A:\\>');
  });

  it('lists files like the mockup', () => {
    const os = bootOS();
    login(os);
    const from = consoleLines(os).length;
    run(os, 'DIR *.TXT');
    const out = since(os, from);
    expect(out[0]).toBe('ADMIN@A:\\> DIR *.TXT');
    expect(out[1]).toBe(' VOLUME IN DRIVE A IS SYSTEM');
    expect(out[2]).toBe(' DIRECTORY OF A:\\*.TXT');
    expect(out[3]).toMatch(/^ README   TXT\s+[\d,]+  11-04-84   09:30$/);
    expect(out.slice(3, 7).map((l) => l.slice(1, 9).trim())).toEqual(['README', 'NOTES', 'TODO', 'LOGO']);
    expect(out[7]).toMatch(/^ {8}4 FILE\(S\) {5}\d+K FREE ON A:$/);
  });

  it('prints the exact error texts of board [23]', () => {
    const os = bootOS();
    login(os);
    let from = consoleLines(os).length;
    run(os, 'FORMAT');
    expect(since(os, from)[1]).toBe('BAD COMMAND OR FILE NAME.  TYPE HELP.');
    from = consoleLines(os).length;
    run(os, 'TYPE DOCS\\IDEAZ.TXT');
    expect(since(os, from)[1]).toBe('FILE NOT FOUND: IDEAZ.TXT.  DID YOU MEAN IDEAS.TXT?');
    from = consoleLines(os).length;
    run(os, 'COPY README.TXT');
    expect(since(os, from)[1]).toBe('REQUIRED PARAMETER MISSING.  USAGE: COPY SRC DST');
    from = consoleLines(os).length;
    run(os, 'DEL CONFIG.SYS');
    expect(since(os, from)[1]).toBe('ACCESS DENIED: CONFIG.SYS IS READ-ONLY.');
    // errors are inverse video and logged
    const errLine = os.tty.console.lines[os.tty.console.lines.length - 1];
    expect(errLine[0].style).toBe('i');
    expect(os.state.log.some((e) => e.level === 'ERROR' && e.msg === 'ACCESS DENIED: CONFIG.SYS IS READ-ONLY.')).toBe(true);
  });

  it('keeps history and recalls it with the arrows', () => {
    const os = bootOS();
    login(os);
    run(os, 'VER');
    run(os, 'WHOAMI');
    press(os, 'arrowup');
    expect(os.tty.console.input).toBe('WHOAMI');
    press(os, 'arrowup');
    expect(os.tty.console.input).toBe('VER');
    press(os, 'arrowdown');
    press(os, 'arrowdown');
    expect(os.tty.console.input).toBe('');
  });

  it('completes with Tab and shows a bubble for several choices', () => {
    const os = bootOS();
    login(os);
    run(os, 'CD DOCS');
    for (const ch of 'TYPE CH') os.key({ key: ch, ch: ch === ' ' ? ' ' : ch, ctrl: false, alt: false, shift: false, combo: ch === ' ' ? 'space' : ch.toLowerCase() });
    press(os, 'tab');
    expect(os.tty.console.input).toBe('TYPE CHANGES.TXT ');
    os.tty.console.input = '';
    os.tty.console.cur = 0;
    for (const ch of 'DI') os.key({ key: ch, ch, ctrl: false, alt: false, shift: false, combo: ch.toLowerCase() });
    press(os, 'tab');
    expect(os.tty.console.comp?.options).toEqual(['DIAL', 'DIR']);
    press(os, 'tab');
    expect(os.tty.console.input).toBe('DIAL');
  });
});

describe('[10] shell session replays', () => {
  it('replays pipes, env, alias, redirection and a .BAT file', () => {
    const os = bootOS();
    login(os);
    run(os, 'CD DOCS');
    const from = consoleLines(os).length;
    run(os, 'SET PROMPT=$U@$P$G');
    run(os, 'ALIAS LS=DIR /W');
    run(os, 'LS');
    run(os, 'TYPE IDEAS.TXT | FIND "TODO"');
    run(os, 'DIR *.TXT > LIST.TXT');
    run(os, 'SET');
    run(os, 'BACKUP.BAT');
    expect(since(os, from)).toEqual([
      'ADMIN@A:\\DOCS> SET PROMPT=$U@$P$G',
      'ADMIN@A:\\DOCS> ALIAS LS=DIR /W',
      'ALIAS LS CREATED.',
      'ADMIN@A:\\DOCS> LS',
      'LETTERS      MANUAL.TXT   CHANGES.TXT  IDEAS.TXT    BUDGET.DAT',
      'ADMIN@A:\\DOCS> TYPE IDEAS.TXT | FIND "TODO"',
      '  3: TODO  ADD A SNAKE GAME',
      '  9: TODO  AMBER THEME IN SETUP',
      'ADMIN@A:\\DOCS> DIR *.TXT > LIST.TXT',
      'OUTPUT WRITTEN TO LIST.TXT (4 LINES)',
      'ADMIN@A:\\DOCS> SET',
      '  PATH=A:\\SYSTEM;C:\\BIN',
      '  PROMPT=$U@$P$G',
      '  USER=ADMIN',
      '  TEMP=C:\\TEMP',
      'ADMIN@A:\\DOCS> BACKUP.BAT',
      '  ECHO OFF',
      '  IF NOT EXIST B:\\BACKUP MKDIR B:\\BACKUP',
      '  COPY *.TXT B:\\BACKUP',
      '  4 FILE(S) COPIED',
    ]);
    expect(os.vfs.exists('B:\\BACKUP\\LIST.TXT')).toBe(true);
  });

  it('runs IF, FOR and %1 in .BAT files', () => {
    const os = bootOS();
    login(os);
    os.vfs.write('A:\\T.BAT', ['ECHO OFF', 'IF EXIST %1 ECHO FOUND %1', 'IF NOT EXIST NOPE.TXT ECHO NO NOPE', 'FOR %%F IN (*.TXT) DO ECHO FILE %%F'].join('\n'), os.tty.user!);
    const from = consoleLines(os).length;
    run(os, 'T README.TXT');
    const out = since(os, from).filter((l) => !l.startsWith('  '));
    expect(out).toEqual(['ADMIN@A:\\> T README.TXT', 'FOUND README.TXT', 'NO NOPE', 'FILE README.TXT', 'FILE NOTES.TXT', 'FILE TODO.TXT', 'FILE LOGO.TXT']);
  });

  it('expands %VAR% and appends with >>', () => {
    const os = bootOS();
    login(os);
    run(os, 'SET NAME=PHOSPHOR');
    run(os, 'ECHO HELLO %NAME% > C:\\TEMP\\A.TXT');
    run(os, 'ECHO AGAIN >> C:\\TEMP\\A.TXT');
    expect(os.vfs.read('C:\\TEMP\\A.TXT')).toBe('HELLO PHOSPHOR\nAGAIN\n');
  });
});

describe('[11] jobs, scheduler, find, memory', () => {
  it('replays the board, including the memory error', () => {
    const os = bootOS();
    login(os);
    // context of the board: GUEST on TTY2 with FILES and EDIT open
    press(os, 'alt+f2');
    login(os, 'GUEST');
    expect(os.openApp(os.tty, 'files', ['A:\\'])).toBeNull();
    expect(os.openApp(os.tty, 'edit', ['A:\\README.TXT'])).toBeNull();
    press(os, 'alt+f1');
    expect(os.active).toBe(0);

    const from = consoleLines(os).length;
    run(os, 'PRINT DOCS\\MANUAL.TXT &');
    run(os, 'PACK DOCS DOCS.ARC &');
    tick(os, 1000);
    run(os, 'JOBS');
    run(os, 'AT 18:00 BACKUP.BAT');
    run(os, 'FIND A:\\ *.TXT /S');
    const out = since(os, from);
    expect(out[1]).toMatch(/^\[1\] PID \d+ +PRINT DOCS\\MANUAL\.TXT   RUNNING IN BACKGROUND$/);
    expect(out[3]).toMatch(/^\[2\] PID \d+ +PACK DOCS DOCS\.ARC +RUNNING IN BACKGROUND$/);
    expect(out[5]).toMatch(/^ {2}\[1\] RUNNING {3}PRINT DOCS\\MANUAL\.TXT {4,5}\d+%$/);
    expect(out[6]).toMatch(/^ {2}\[2\] RUNNING {3}PACK DOCS DOCS\.ARC {7,8}\d+%$/);
    expect(out[8]).toBe('TASK 1 SCHEDULED FOR 11-04-84 18:00');
    expect(out.slice(10)).toEqual([
      '  A:\\README.TXT  A:\\NOTES.TXT  A:\\TODO.TXT  A:\\LOGO.TXT',
      '  A:\\DOCS\\MANUAL.TXT  A:\\DOCS\\CHANGES.TXT  A:\\DOCS\\IDEAS.TXT',
      '  7 MATCHES IN 3 DIRECTORIES',
    ]);

    const packPid = os.procs.job(1, 2)!.pid;
    let mark = consoleLines(os).length;
    run(os, `KILL ${packPid}`);
    expect(since(os, mark)[1]).toBe('[2] TERMINATED  PACK DOCS DOCS.ARC');

    run(os, 'FG 1');
    expect(os.tty.console.fgPid).toBe(os.procs.job(1, 1)!.pid);
    press(os, 'ctrl+z');
    expect(os.tty.console.fgPid).toBeNull();

    mark = consoleLines(os).length;
    run(os, 'UNPACK C:\\ARCHIVE.ARC');
    expect(since(os, mark).slice(1)).toEqual(['NOT ENOUGH MEMORY: 228K FREE, 256K NEEDED.', 'CLOSE A PROGRAM OR TYPE MEM FOR DETAILS.']);
  });

  it('reports a finished job with [N] DONE', () => {
    const os = bootOS();
    login(os);
    run(os, 'PRINT README.TXT &');
    tick(os, 3000);
    expect(consoleLines(os)).toContain('[1] DONE  PRINT README.TXT');
    expect(os.procs.jobs(1)).toHaveLength(0);
  });

  it('runs a foreground job, then gives the prompt back', () => {
    const os = bootOS();
    login(os);
    run(os, 'PRINT README.TXT');
    expect(os.tty.console.fgPid).not.toBeNull();
    tick(os, 3000);
    expect(os.tty.console.fgPid).toBeNull();
    expect(consoleLines(os)).toContain('PRINT README.TXT: 1 PAGE(S) PRINTED.');
  });

  it('runs AT tasks when due', () => {
    const os = bootOS();
    login(os);
    os.vfs.write('C:\\BIN\\STAMP.BAT', 'ECHO DONE > C:\\TEMP\\STAMP.TXT', os.tty.user!);
    run(os, 'AT 09:41 STAMP.BAT');
    tick(os, 200);
    expect(os.vfs.exists('C:\\TEMP\\STAMP.TXT')).toBe(false);
    // move the clock past 09:41
    os.state.tasks.forEach((t) => (t.due = 0));
    tick(os, 200);
    expect(os.vfs.read('C:\\TEMP\\STAMP.TXT')).toBe('DONE\n');
    expect(os.state.log.some((e) => e.msg === `TASK 2 STARTED: STAMP.BAT`)).toBe(true);
  });

  it('packs and unpacks an archive', () => {
    const os = bootOS();
    login(os);
    run(os, 'PACK DOCS C:\\DOCS.ARC');
    tick(os, 30000);
    expect(os.vfs.exists('C:\\DOCS.ARC')).toBe(true);
    run(os, 'MKDIR C:\\OUT');
    run(os, 'UNPACK C:\\DOCS.ARC C:\\OUT');
    tick(os, 5000);
    expect(os.vfs.read('C:\\OUT\\DOCS\\IDEAS.TXT')).toBe(os.vfs.read('A:\\DOCS\\IDEAS.TXT'));
  });
});

describe('HELP in the console', () => {
  it('HELP COPY prints the command, each argument and examples', () => {
    const os = bootOS();
    login(os);
    const from = consoleLines(os).length;
    run(os, 'HELP COPY');
    const out = since(os, from);
    expect(out[1]).toBe('COPY  COPY ONE OR MORE FILES TO ANOTHER PLACE.');
    expect(out[2]).toBe('USAGE   COPY SOURCE DESTINATION [/Y] [/V]');
    expect(out).toContain('        SOURCE       FILE TO COPY.  * AND ? ALLOWED.');
    expect(out).toContain('        /Y           OVERWRITE WITHOUT ASKING.');
    expect(out.some((l) => l.startsWith('EXAMPLE COPY README.TXT B:\\'))).toBe(true);
    expect(os.tty.top()).toBeUndefined();
  });

  it('HELP gives a one-screen summary, HELP <SECTION> one line per command, HELP X /M the manual', () => {
    const os = bootOS();
    login(os);
    let from = consoleLines(os).length;
    run(os, 'HELP');
    let out = since(os, from);
    expect(out[1]).toBe('HELP SECTIONS');
    expect(out.some((l) => l.startsWith('  DISKS      DIR  CD'))).toBe(true);
    expect(out.length).toBeLessThanOrEqual(23);
    from = consoleLines(os).length;
    run(os, 'HELP DISKS');
    out = since(os, from);
    expect(out[1]).toBe('DISKS: FILES AND FOLDERS');
    expect(out.some((l) => /^ {2}DIR {7}\S/.test(l))).toBe(true);
    expect(out.length).toBeLessThanOrEqual(23);
    run(os, 'HELP DIR /M');
    expect(os.tty.top()?.app.id).toBe('help');
  });
});
