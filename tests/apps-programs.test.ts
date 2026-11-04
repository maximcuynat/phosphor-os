import { describe, expect, it } from 'vitest';
import { HELP_TOPICS, findTopic } from '../src/data/help';
import { MANUAL_TXT } from '../src/data/manual';
import { COMMANDS } from '../src/shell/commands';
import { bootOS, consoleLines, login, press, run, screen, tick, type } from './helpers';

function ready() {
  const os = bootOS();
  login(os);
  return os;
}

describe('[12] HELP', () => {
  it('opens the COPY page', () => {
    const os = ready();
    run(os, 'HELP COPY /M');
    const t = screen(os);
    expect(t).toContain('HELP  PHOSPHOR OS MANUAL');
    expect(t).toMatch(/TOPIC \d+ OF \d+/);
    expect(t).toContain('SYNTAX');
    expect(t).toContain('COPY SOURCE DESTINATION [/Y] [/V]');
    expect(t).toContain('ARGUMENTS');
    expect(t).toContain('EXAMPLES');
    expect(t).toContain('PGUP/DN');
    press(os, 'pagedown');
    expect(screen(os)).toContain('SEE ALSO');
  });

  it('F1 opens GETTING STARTED, unknown topic warns', () => {
    const os = ready();
    press(os, 'f1');
    expect(screen(os)).toContain('FIRST STEPS WITH PHOSPHOR OS');
    press(os, 'escape');
    run(os, 'HELP ZZZ /M');
    expect(screen(os)).toContain('NO HELP FOR ZZZ.  PICK A TOPIC IN THE INDEX.');
    expect(screen(os)).toContain('FIRST STEPS WITH PHOSPHOR OS');
  });

  it('moves with up/down and follows links with Tab+Enter', () => {
    const os = ready();
    run(os, 'HELP COPY /M');
    press(os, 'arrowdown');
    expect(screen(os)).not.toContain('COPY SOURCE DESTINATION');
    press(os, 'arrowup');
    expect(screen(os)).toContain('COPY SOURCE DESTINATION');
    press(os, 'tab');
    press(os, 'enter');
    const t = screen(os);
    expect(t).toContain('MOVE SOURCE DESTINATION');
    press(os, 'escape');
    expect(os.tty.top()).toBeUndefined();
  });

  it('searches with /', () => {
    const os = ready();
    press(os, 'f1');
    press(os, '/');
    type(os, 'BULLETIN');
    press(os, 'enter');
    expect(screen(os)).toContain('DIAL NUMBER');
    press(os, '/');
    type(os, 'QQQQ');
    press(os, 'enter');
    expect(screen(os)).toContain('NOT FOUND: QQQQ.');
  });

  it('has a page for every command, with arguments when the usage has some', () => {
    for (const c of COMMANDS) {
      const topic = findTopic(c.name);
      expect(topic, c.name).toBeDefined();
      const hasArgs = c.usage.trim().includes(' ');
      if (hasArgs) expect(topic!.args.length, c.name).toBeGreaterThan(0);
      for (const a of c.aliases ?? []) expect(findTopic(a)?.id, a).toBe(c.name);
    }
    expect(findTopic('md')?.id).toBe('MKDIR');
    expect(HELP_TOPICS.slice(0, 2).map((t) => t.id)).toEqual(['GETTING STARTED', 'KEYBOARD']);
  });
});

describe('[20] DIAL', () => {
  it('connects to the BBS and hangs up', () => {
    const os = ready();
    run(os, 'DIAL 555-0184');
    tick(os, 1000);
    expect(screen(os)).toContain('ATDT 555-0184');
    expect(os.online).toBe(false);
    tick(os, 2500);
    expect(os.online).toBe(true);
    const t = screen(os);
    expect(t).toContain('CONNECT 2400');
    expect(t).toContain('THE GREEN ROOM BBS');
    expect(t).toContain('WELCOME BACK, ADMIN.');
    expect(t).toContain('MAIN MENU >');
    expect(t).toContain('ALT+H HANG UP');
    press(os, 'm');
    expect(screen(os)).toContain('WELCOME BACK');
    expect(screen(os)).toContain('NIGHTOWL');
    press(os, 'enter');
    expect(screen(os)).toContain('HELLO AND WELCOME BACK');
    press(os, 'escape');
    press(os, 'escape');
    expect(screen(os)).toContain('MAIN MENU >');
    press(os, 'alt+h');
    expect(os.online).toBe(false);
    expect(os.tty.top()).toBeUndefined();
    expect(consoleLines(os).some((l) => l === 'NO CARRIER')).toBe(true);
  });

  it('chats and downloads a file', () => {
    const os = ready();
    run(os, 'DIAL 555-0184');
    tick(os, 3500);
    press(os, 'c');
    type(os, 'HI');
    press(os, 'enter');
    expect(screen(os)).toContain('NIGHTOWL: HELLO!');
    press(os, 'escape');
    press(os, 'd');
    tick(os, 3500);
    expect(screen(os)).toContain('BBSNEWS.TXT SAVED TO C:\\TEMP');
    expect(os.vfs.exists('C:\\TEMP\\BBSNEWS.TXT')).toBe(true);
    press(os, 'escape');
    press(os, 'g');
    tick(os, 2500);
    expect(os.online).toBe(false);
    expect(os.tty.top()).toBeUndefined();
  });

  it('answers BUSY on another number', () => {
    const os = ready();
    run(os, 'DIAL 555-0000');
    tick(os, 3500);
    expect(screen(os)).toContain('BUSY.  NO CARRIER.  R TO REDIAL, ESC TO CANCEL.');
    expect(os.online).toBe(false);
    expect(os.state.log.some((l) => l.level === 'ERROR' && l.msg.includes('BUSY'))).toBe(true);
    press(os, 'r');
    expect(screen(os)).not.toContain('BUSY.');
    tick(os, 3500);
    expect(screen(os)).toContain('BUSY.');
    press(os, 'escape');
    expect(os.tty.top()).toBeUndefined();
  });
});

describe('[21] INSTALL', () => {
  it('installs SNAKE and refuses a second install', () => {
    const os = ready();
    run(os, 'INSTALL B:\\SNAKE.PKG');
    let t = screen(os);
    expect(t).toContain('INSTALL  B:\\SNAKE.PKG');
    expect(t).toContain('24K ON DISK  16K RAM');
    expect(t).toContain('PRESS ENTER TO INSTALL, ESC TO CANCEL.');
    press(os, 'enter');
    tick(os, 1500);
    t = screen(os);
    expect(t).toContain('COPYING...');
    tick(os, 3000);
    t = screen(os);
    expect(t).toContain('SNAKE 1.2 INSTALLED.  TYPE SNAKE TO START IT.');
    expect(os.state.installed.map((i) => i.name)).toEqual(['SNAKE']);
    expect(os.state.installed[0]).toMatchObject({ version: '1.2', command: 'SNAKE', path: 'C:\\GAMES\\SNAKE', memK: 16 });
    expect(os.vfs.get('C:\\GAMES\\SNAKE\\SNAKE.EXE')?.size).toBe(18432);
    expect(os.state.log.some((l) => l.msg === 'SNAKE.PKG INSTALLED')).toBe(true);
    press(os, 'enter');
    expect(os.tty.top()).toBeUndefined();

    run(os, 'INSTALL B:\\SNAKE.PKG');
    expect(screen(os)).toContain('SNAKE 1.2 IS ALREADY INSTALLED.  TYPE UNINSTALL SNAKE FIRST.');
    press(os, 'escape');
  });

  it('cancels during the copy and removes what was copied', () => {
    const os = ready();
    run(os, 'INSTALL B:\\SNAKE.PKG');
    press(os, 'enter');
    tick(os, 2800);
    expect(os.vfs.exists('C:\\GAMES\\SNAKE')).toBe(true);
    press(os, 'escape');
    expect(os.vfs.exists('C:\\GAMES\\SNAKE')).toBe(false);
    expect(os.state.installed).toHaveLength(0);
    expect(consoleLines(os)).toContain('INSTALL CANCELLED.  NOTHING WAS CHANGED.');
  });

  it('rejects a bad manifest', () => {
    const os = ready();
    os.vfs.write('C:\\TEMP\\BAD.PKG', 'HELLO', { name: 'ADMIN', role: 'admin' });
    run(os, 'INSTALL C:\\TEMP\\BAD.PKG');
    expect(screen(os)).toContain('BAD.PKG IS NOT A VALID PACKAGE.  ASK ITS AUTHOR FOR A NEW COPY.');
    press(os, 'escape');
    expect(os.tty.top()).toBeUndefined();
  });

  it('checks memory', () => {
    const os = ready();
    os.vfs.write('C:\\TEMP\\BIG.PKG', 'PKG BIG 1.0\nCOMMAND BIG\nDEST C:\\BIG\nRAM 900\nFILE BIG.EXE 100', { name: 'ADMIN', role: 'admin' });
    run(os, 'INSTALL C:\\TEMP\\BIG.PKG');
    press(os, 'enter');
    tick(os, 2000);
    expect(screen(os)).toMatch(/NOT ENOUGH MEMORY: \d+K FREE, 900K NEEDED\./);
    expect(os.vfs.exists('C:\\BIG')).toBe(false);
  });
});

describe('MANUAL.TXT', () => {
  it('keeps chapter 4 and starts with the title', () => {
    const lines = MANUAL_TXT.split('\n');
    expect(lines[0]).toBe('PHOSPHOR OS 1.0  USER MANUAL');
    expect(lines.length).toBeGreaterThan(190);
    expect(MANUAL_TXT).toContain('PHOSPHOR OS RUNS IN 640K OF CONVENTIONAL MEMORY.');
    expect(MANUAL_TXT).toContain('    NOT ENOUGH MEMORY: 228K FREE, 256K NEEDED.');
    expect(MANUAL_TXT).toContain('TYPE MEM TO SEE HOW MEMORY IS SHARED.');
  });
});
