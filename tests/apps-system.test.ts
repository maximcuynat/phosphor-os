import { describe, expect, it } from 'vitest';
import { bootOS, login, press, run, screen, tick } from './helpers';

function setup() {
  const os = bootOS();
  login(os);
  return os;
}

describe('TOP', () => {
  it('lists the processes and kills a background job with K then Y', () => {
    const os = setup();
    run(os, 'PRINT README.TXT &');
    expect(os.procs.list.some((p) => p.name === 'PRINT')).toBe(true);
    run(os, 'TOP');
    let text = screen(os);
    expect(text).toContain('PHOSPHOR TOP');
    for (const n of ['KERNEL', 'SHELL', 'PRINT', 'IDLE']) expect(text).toContain(n);
    expect(text).toMatch(/UPTIME \d\d:\d\d:\d\d\s+TASKS \d+\s+RUNNING \d+\s+SLEEPING \d+\s+REFRESH 1S/);
    // move down until the confirmation names PRINT
    for (let i = 0; i < 12; i++) {
      press(os, 'k');
      if (screen(os).includes(' PRINT? (Y/N)')) break;
      press(os, 'n');
      press(os, 'arrowdown');
    }
    expect(screen(os)).toMatch(/KILL PID \d+ PRINT\? \(Y\/N\)/);
    press(os, 'y');
    expect(os.procs.list.some((p) => p.name === 'PRINT')).toBe(false);
    text = screen(os);
    expect(text).toMatch(/TERMINATED\s+PRINT/);
    expect(os.state.log.some((e) => e.level === 'WARN' && /KILLED BY USER/.test(e.msg))).toBe(true);
  });

  it('changes the sort column with S', () => {
    const os = setup();
    run(os, 'TOP');
    expect(screen(os)).toContain('%CPUv');
    press(os, 's');
    expect(screen(os)).toContain('MEMv');
    press(os, 's');
    const t = screen(os);
    expect(t).toContain('PIDv');
    const pids = t.split('\n').slice(12, 22).map((l) => /^\s+(\d+)\s/.exec(l.slice(2))?.[1]).filter(Boolean).map(Number);
    expect(pids).toEqual([...pids].sort((a, b) => a - b));
    press(os, '+');
    expect(screen(os)).toContain('REFRESH 0.5S');
    press(os, 'escape');
    expect(os.tty.top()).toBeUndefined();
  });

  it('refuses to kill a system process with an inverse message', () => {
    const os = setup();
    run(os, 'TOP');
    press(os, 's');
    press(os, 's'); // by PID: PID 2 is a system process
    press(os, 'arrowdown');
    press(os, 'k');
    press(os, 'y');
    expect(screen(os)).toContain('IT CANNOT BE KILLED');
    expect(os.state.log.some((e) => e.level === 'ERROR' && /CANNOT BE KILLED/.test(e.msg))).toBe(true);
  });
});

describe('SYSINFO', () => {
  it('shows the memory map numbers of the process table', () => {
    const os = setup();
    run(os, 'SYSINFO');
    const t = screen(os);
    expect(t).toContain('MEMORY MAP');
    expect(t).toContain(`${os.procs.usedK()}K USED   ${os.procs.freeK()}K FREE`);
    expect(t).toContain('DISKS');
    expect(t).toContain('DEVICES');
    expect(t).toMatch(/C: .*\d+\.\d+M\/21\.0M/);
    expect(t).toMatch(/A: .*\d+K\/360K/);
  });

  it('MEM opens SYSINFO on the detail view, M toggles back to the map', () => {
    const os = setup();
    run(os, 'MEM');
    let t = screen(os);
    expect(t).toContain('SYSINFO');
    expect(t).toContain('MEMORY DETAIL');
    expect(t).toMatch(/PID\s+NAME\s+USER\s+TTY\s+MEM/);
    expect(t).toContain(`${os.procs.usedK()}K USED   ${os.procs.freeK()}K FREE`);
    press(os, 'm');
    t = screen(os);
    expect(t).toContain('MEMORY MAP');
    expect(t).toContain('640K CONVENTIONAL');
  });

  it('CHKDSK C: finds 2 bad sectors the first time only', () => {
    const os = setup();
    run(os, 'CHKDSK C:');
    expect(screen(os)).toMatch(/CHECKING C: \d+%/);
    tick(os, 2500);
    let t = screen(os);
    expect(t).toMatch(/CHKDSK C: {2}21,504K TOTAL/);
    expect(t).toContain('2 BAD SECTORS FOUND AND MARKED.');
    expect(os.state.log.some((e) => e.level === 'WARN' && e.msg === 'C: 2 BAD SECTORS MARKED')).toBe(true);
    press(os, 'c');
    tick(os, 2500);
    t = screen(os);
    expect(t).toContain('0 LOST CHAINS.  DISK OK.');
    expect(t).not.toContain('BAD SECTORS FOUND');
  });

  it('asks ABORT, RETRY, FAIL when the drive has no disk', () => {
    const os = setup();
    os.state.drives.B.ready = false;
    run(os, 'SYSINFO');
    expect(screen(os)).toContain('NO DISK');
    press(os, 'arrowup'); // B:
    press(os, 'c');
    expect(screen(os)).toContain('NOT READY READING DRIVE B:  ABORT, RETRY, FAIL?');
    press(os, 'r');
    expect(screen(os)).toContain('ABORT, RETRY, FAIL?');
    os.state.drives.B.ready = true;
    press(os, 'r');
    tick(os, 2500);
    expect(screen(os)).toContain('0 LOST CHAINS.  DISK OK.');
    expect(os.state.log.some((e) => e.level === 'ERROR' && /NOT READY READING DRIVE B:/.test(e.msg))).toBe(true);
  });
});

describe('LOG', () => {
  it('shows entries, filters to ERROR with F and exports with E', () => {
    const os = setup();
    run(os, 'DEL CONFIG.SYS'); // logs an ERROR
    run(os, 'LOG');
    let t = screen(os);
    expect(t).toContain('LOG  A:\\SYSTEM\\EVENTS.LOG');
    expect(t).toMatch(/\d+ OF \d+ ENTRIES/);
    expect(t).toContain('BOOT COMPLETE');
    expect(t).toContain('ACCESS DENIED: CONFIG.SYS IS READ-ONLY.');
    press(os, 'f'); // INFO
    press(os, 'f'); // WARN
    press(os, 'f'); // ERROR
    t = screen(os);
    expect(t).not.toContain('BOOT COMPLETE');
    expect(t).toContain('ACCESS DENIED');
    const shown = Number(/(\d+) OF \d+ ENTRIES/.exec(t)![1]);
    expect(shown).toBe(os.state.log.filter((e) => e.level === 'ERROR').length);
    press(os, 'e');
    expect(screen(os)).toContain(`EXPORTED ${shown} ENTRIES TO C:\\TEMP\\EVENTS.TXT`);
    const file = os.vfs.read('C:\\TEMP\\EVENTS.TXT');
    expect(file.split('\n').filter(Boolean)).toHaveLength(shown);
    expect(file).toContain('ACCESS DENIED');
  });

  it('searches messages and follows new entries live', () => {
    const os = setup();
    run(os, 'LOG');
    press(os, '/');
    for (const ch of 'login') press(os, ch);
    press(os, 'enter');
    const t = screen(os);
    expect(t).toContain('LOGIN ON TTY1');
    expect(t).not.toContain('BOOT COMPLETE');
    press(os, '/');
    for (let i = 0; i < 5; i++) press(os, 'backspace');
    press(os, 'enter');
    expect(screen(os)).toContain('SEARCH CLEARED.');
    os.log('INFO', 'LIVE ENTRY TEST');
    expect(screen(os)).toContain('LIVE ENTRY TEST');
  });
});
