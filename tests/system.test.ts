import { describe, expect, it } from 'vitest';
import { STORAGE_KEY } from '../src/config';
import { setNow } from '../src/kernel/clock';
import { defaultState, loadState, saveState } from '../src/kernel/state';
import { setPassword } from '../src/kernel/users';
import { bootOS, consoleLines, login, newOS, press, run, screen, since, T0, tick, type } from './helpers';

describe('power on, boot, setup', () => {
  it('goes POWER ON -> BOOT -> LOGIN', () => {
    const os = newOS();
    os.powerOn();
    expect(os.mode).toBe('poweron');
    tick(os, 800);
    expect(os.mode).toBe('boot');
    expect(screen(os)).toContain('PRESS ESC TO ENTER SETUP     PRESS F8 FOR SAFE MODE');
    tick(os, 4000);
    expect(os.mode).toBe('running');
    expect(screen(os)).toContain('LOGIN');
    expect(screen(os)).toContain('ACCOUNTS:');
  });

  it('skips the tube animation when POWER-ON EFFECT is off', () => {
    const os = newOS();
    os.state.settings.powerOnEffect = false;
    os.powerOn();
    expect(os.mode).toBe('boot');
  });

  it('changes the phosphor in SETUP and keeps it after F10', () => {
    const os = newOS();
    os.powerOn();
    tick(os, 1000);
    press(os, 'escape');
    expect(os.mode).toBe('setup');
    expect(screen(os)).toContain('PHOSPHOR SETUP UTILITY');
    press(os, 'arrowright'); // PHOSPHOR COLOR: green -> amber
    expect(os.settings.phosphor).toBe('amber');
    expect(screen(os)).toContain('* CHANGED');
    press(os, 'f10');
    tick(os, 6000);
    expect(os.mode).toBe('running');
    expect(os.settings.phosphor).toBe('amber');
  });

  it('discards SETUP changes on ESC', () => {
    const os = newOS();
    os.powerOn();
    tick(os, 1000);
    press(os, 'escape');
    press(os, 'arrowdown'); // GLOW
    press(os, 'arrowright');
    expect(os.settings.glow).toBe(7);
    press(os, 'escape');
    expect(os.settings.glow).toBe(6);
  });

  it('starts in SAFE MODE with F8: no login, no AUTOEXEC, no jobs', () => {
    const os = newOS();
    os.powerOn();
    tick(os, 1000);
    press(os, 'f8');
    tick(os, 5000);
    expect(os.safe).toBe(true);
    expect(os.tty.session.user).toBe('ADMIN');
    expect(os.tty.console.prompt()).toBe('A:\\>');
    expect(os.tty.session.aliases).toEqual({});
    expect(screen(os)).toContain('SAFE MODE');
    run(os, 'PRINT README.TXT &');
    expect(consoleLines(os)).toContain('JOBS ARE DISABLED IN SAFE MODE.  TYPE REBOOT TO RESTART NORMALLY.');
    run(os, 'DIAL 555-0184');
    expect(consoleLines(os)).toContain('DIAL IS NOT AVAILABLE IN SAFE MODE.  TYPE REBOOT TO RESTART NORMALLY.');
    press(os, 'alt+f2');
    expect(os.active).toBe(0);
    run(os, 'REBOOT');
    tick(os, 7000);
    expect(os.safe).toBe(false);
    expect(os.tty.loggedIn).toBe(false);
  });
});

describe('login', () => {
  it('locks an account after 3 wrong passwords, with a live countdown', () => {
    const os = bootOS();
    setPassword(os.state.users[0], 'SECRET');
    type(os, 'ADMIN');
    press(os, 'tab');
    type(os, 'NOPE');
    press(os, 'enter');
    expect(screen(os)).toContain('LOGIN INCORRECT.  2 ATTEMPTS LEFT.');
    type(os, 'NOPE');
    press(os, 'enter');
    type(os, 'NOPE');
    press(os, 'enter');
    expect(screen(os)).toContain('ACCOUNT LOCKED.  TRY AGAIN IN 60 S.');
    setNow(T0 + 20_000);
    tick(os, 100);
    expect(screen(os)).toContain('ACCOUNT LOCKED.  TRY AGAIN IN 40 S.');
    type(os, 'SECRET');
    press(os, 'enter');
    expect(os.tty.loggedIn).toBe(false);
    setNow(T0 + 61_000);
    tick(os, 100);
    type(os, 'SECRET');
    press(os, 'enter');
    expect(os.tty.loggedIn).toBe(true);
    expect(os.state.log.some((e) => e.msg === 'ACCOUNT ADMIN LOCKED')).toBe(true);
    setNow(T0);
  });

  it('asks to set a password when none is set', () => {
    const os = bootOS();
    login(os);
    expect(consoleLines(os)).toContain('NO PASSWORD SET FOR ADMIN.  TYPE PASSWD TO SET ONE.');
  });

  it('changes a password with PASSWD', () => {
    const os = bootOS();
    login(os);
    run(os, 'PASSWD');
    type(os, 'GREEN');
    press(os, 'enter');
    type(os, 'GREEN');
    press(os, 'enter');
    expect(consoleLines(os)).toContain('PASSWORD CHANGED FOR ADMIN.');
    run(os, 'LOGOUT');
    expect(os.tty.loggedIn).toBe(false);
    login(os, 'ADMIN', 'GREEN');
  });
});

describe('virtual consoles and rights', () => {
  it('keeps one session per TTY', () => {
    const os = bootOS();
    login(os);
    run(os, 'CD DOCS');
    press(os, 'alt+f2');
    expect(os.active).toBe(1);
    expect(screen(os)).toContain('TTY2');
    login(os, 'GUEST');
    expect(os.tty.session.cwd).toBe('A:\\');
    press(os, 'alt+1');
    expect(os.tty.session.cwd).toBe('A:\\DOCS');
    expect(screen(os)).toMatch(/ALT\+F1 TTY1 ADMIN.*F2 TTY2 GUEST.*F3 FREE.*F4 FREE/);
  });

  it('refuses admin commands to GUEST and logs a warning', () => {
    const os = bootOS();
    login(os, 'GUEST');
    const from = consoleLines(os).length;
    run(os, 'SHUTDOWN');
    run(os, 'ATTR +S README.TXT');
    run(os, 'INSTALL B:\\SNAKE.PKG');
    const out = since(os, from);
    expect(out).toContain('ADMIN ONLY: SHUTDOWN.  YOU ARE GUEST.');
    expect(out).toContain('ADMIN ONLY: ATTR +S.  YOU ARE GUEST.');
    expect(out).toContain('ADMIN ONLY: INSTALL.  YOU ARE GUEST.');
    expect(os.state.log.filter((e) => e.level === 'WARN' && e.user === 'GUEST').length).toBe(3);
    expect(os.mode).toBe('running');
  });
});

describe('shutdown, screensaver, fatal error', () => {
  it('warns about other users, then shuts down and powers on again', () => {
    const os = bootOS();
    login(os);
    press(os, 'alt+f2');
    login(os, 'GUEST');
    press(os, 'alt+f1');
    run(os, 'SHUTDOWN');
    expect(screen(os)).toContain('WARNING: GUEST IS LOGGED IN ON TTY2.  CONTINUE? (Y/N)');
    press(os, 'y');
    expect(os.mode).toBe('shutdown');
    tick(os, 3000);
    const text = screen(os);
    expect(text).toContain('LOGGING OUT GUEST ON TTY2');
    expect(text).toContain('FLUSHING DISK BUFFERS C:');
    expect(text).toContain('IT IS NOW SAFE TO TURN OFF');
    expect(os.ttys.every((t) => !t.loggedIn)).toBe(true);
    press(os, 'space');
    expect(os.mode).toBe('poweron');
  });

  it('starts the screensaver after 5 minutes and wakes on a key', () => {
    const os = bootOS();
    login(os);
    tick(os, 5 * 60_000, 1000);
    expect(os.saver).not.toBeNull();
    expect(screen(os)).toContain('PRESS ANY KEY');
    press(os, 'a');
    expect(os.saver).toBeNull();
    expect(os.tty.console.input).toBe('');
  });

  it('asks the password on wake when the user has one', () => {
    const os = bootOS();
    login(os);
    setPassword(os.tty.user!, 'GREEN');
    tick(os, 5 * 60_000, 1000);
    press(os, 'a');
    expect(os.saver?.asking).toBe(true);
    type(os, 'GREEN');
    press(os, 'enter');
    expect(os.saver).toBeNull();
  });

  it('shows FATAL ERROR when a program crashes and writes CRASH.LOG', () => {
    const os = bootOS();
    login(os);
    os.registerApp('boom', () => ({
      id: 'boom',
      memK: 4,
      onEnter() {},
      onKey() {
        throw new Error('null pointer');
      },
      render() {},
    }));
    expect(os.openApp(os.tty, 'boom')).toBeNull();
    press(os, 'a');
    expect(os.mode).toBe('fatal');
    const text = screen(os);
    expect(text).toContain('*** SYSTEM HALTED ***');
    expect(text).toContain('IN MODULE  BOOM');
    expect(os.vfs.read('A:\\SYSTEM\\CRASH.LOG')).toContain('NULL POINTER');
    press(os, 'f8');
    tick(os, 7000);
    expect(os.safe).toBe(true);
  });

  it('KILL 1 crashes the kernel', () => {
    const os = bootOS();
    login(os);
    run(os, 'KILL 1');
    expect(os.mode).toBe('fatal');
  });
});

describe('drives, memory, persistence', () => {
  it('asks ABORT, RETRY, FAIL for a drive without a disk', () => {
    const os = bootOS();
    login(os);
    run(os, 'EJECT B:');
    run(os, 'DIR B:\\');
    expect(os.tty.console.pending?.prompt).toBe('NOT READY READING DRIVE B:  ABORT, RETRY, FAIL?');
    press(os, 'x'); // ignored
    expect(os.tty.console.pending).not.toBeNull();
    os.state.drives.B.ready = true; // disk put back
    press(os, 'r');
    expect(os.tty.console.pending).toBeNull();
    expect(consoleLines(os).some((l) => l.includes('SNAKE    PKG'))).toBe(true);
  });

  it('refuses a program when memory is short', () => {
    const os = bootOS();
    login(os);
    os.procs.spawn({ name: 'HOG', user: 'ADMIN', tty: 1, memK: 320, kind: 'job' });
    run(os, 'FILES');
    expect(consoleLines(os)).toContain(`NOT ENOUGH MEMORY: ${os.procs.freeK()}K FREE, 42K NEEDED.`);
    expect(os.tty.stack).toHaveLength(0);
  });

  it('saves the whole state as one JSON and loads it back', () => {
    const store = new Map<string, string>();
    const fake = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) };
    const st = defaultState();
    st.settings.phosphor = 'white';
    st.drives.A.root.children!.push({ name: 'KEEP', ext: 'TXT', type: 'file', attrs: '---A', size: 2, modified: '1984-11-04T09:00', owner: 'ADMIN', content: 'OK', children: null });
    saveState(st, fake);
    expect(store.has(STORAGE_KEY)).toBe(true);
    const back = loadState(fake);
    expect(back.settings.phosphor).toBe('white');
    expect(back.drives.A.root.children!.some((n) => n.name === 'KEEP')).toBe(true);
    store.set(STORAGE_KEY, '{broken');
    expect(loadState(fake).version).toBe(1);
  });
});
