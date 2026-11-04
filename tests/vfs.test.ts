import { beforeEach, describe, expect, it } from 'vitest';
import { setNow } from '../src/kernel/clock';
import { defaultState } from '../src/kernel/state';
import type { OSState } from '../src/kernel/types';
import { FsError, NotReadyError, Vfs, fullName, isValidName, matchMask, parsePath, formatPath } from '../src/kernel/vfs';
import { T0 } from './helpers';

const ADMIN = { name: 'ADMIN', role: 'admin' as const };
const GUEST = { name: 'GUEST', role: 'guest' as const };

let st: OSState;
let vfs: Vfs;

beforeEach(() => {
  setNow(T0);
  st = defaultState();
  vfs = new Vfs(() => st);
});

describe('paths and names', () => {
  it('resolves relative, absolute, .. and drive paths', () => {
    expect(formatPath(parsePath('DOCS\\MANUAL.TXT', 'A:\\'))).toBe('A:\\DOCS\\MANUAL.TXT');
    expect(formatPath(parsePath('..', 'A:\\DOCS'))).toBe('A:\\');
    expect(formatPath(parsePath('\\GAMES', 'A:\\DOCS'))).toBe('A:\\GAMES');
    expect(formatPath(parsePath('B:\\BACKUP', 'A:\\DOCS'))).toBe('B:\\BACKUP');
    expect(formatPath(parsePath('c:\\temp', 'A:\\'))).toBe('C:\\TEMP');
  });

  it('validates 8.3 names', () => {
    expect(isValidName('README.TXT')).toBe(true);
    expect(isValidName('TOOLONGNAME.TXT')).toBe(false);
    expect(isValidName('A.TEXT')).toBe(false);
    expect(isValidName('BAD NAME')).toBe(false);
  });

  it('matches masks with * and ?', () => {
    expect(matchMask('README.TXT', '*.TXT')).toBe(true);
    expect(matchMask('README.TXT', 'R?ADME.*')).toBe(true);
    expect(matchMask('DOCS', '*.*')).toBe(true);
    expect(matchMask('NOTES.TXT', '*.BAT')).toBe(false);
  });
});

describe('default disk', () => {
  it('has the files of brief §9 with their attributes', () => {
    expect(vfs.get('A:\\CONFIG.SYS')!.attrs).toBe('RS--');
    expect(vfs.get('A:\\PHOSPHOR.SYS')!.attrs).toBe('RSH-');
    expect(vfs.get('A:\\SECRET.TXT')!.attrs).toBe('--H-');
    expect(vfs.get('A:\\SYSTEM')!.attrs).toBe('-SH-');
    expect(vfs.list('A:\\DOCS').map(fullName)).toEqual(['LETTERS', 'MANUAL.TXT', 'CHANGES.TXT', 'IDEAS.TXT', 'BUDGET.DAT']);
    expect(vfs.get('B:\\SNAKE.PKG')).not.toBeNull();
    expect(vfs.list('C:\\').map(fullName)).toEqual(['BIN', 'TEMP', 'TRASH', 'GAMES']);
  });

  it('hides H files unless asked', () => {
    expect(vfs.list('A:\\').map(fullName)).not.toContain('SECRET.TXT');
    expect(vfs.list('A:\\', { hidden: true }).map(fullName)).toContain('SECRET.TXT');
  });
});

describe('reading and writing', () => {
  it('suggests a name 1 or 2 letters off', () => {
    expect(() => vfs.file('A:\\DOCS\\IDEAZ.TXT')).toThrow('FILE NOT FOUND: IDEAZ.TXT.  DID YOU MEAN IDEAS.TXT?');
    expect(() => vfs.file('A:\\ZZZZ.TXT')).toThrow('FILE NOT FOUND: ZZZZ.TXT.  TYPE DIR TO LIST FILES.');
  });

  it('writes, appends and updates sizes', () => {
    vfs.write('A:\\NEW.TXT', 'HELLO', ADMIN);
    vfs.write('A:\\NEW.TXT', ' WORLD', ADMIN, { append: true });
    expect(vfs.read('A:\\NEW.TXT')).toBe('HELLO WORLD');
    expect(vfs.get('A:\\NEW.TXT')!.size).toBe(11);
  });

  it('refuses to modify read-only and system files', () => {
    expect(() => vfs.write('A:\\CONFIG.SYS', 'X', ADMIN)).toThrow('ACCESS DENIED: CONFIG.SYS IS READ-ONLY.');
    vfs.setAttrs('A:\\CONFIG.SYS', ['-R'], ADMIN);
    expect(() => vfs.write('A:\\CONFIG.SYS', 'X', GUEST)).toThrow(/SYSTEM FILE/);
    expect(() => vfs.setAttrs('A:\\README.TXT', ['+S'], GUEST)).toThrow('ADMIN ONLY: ATTR +S.  YOU ARE GUEST.');
  });

  it('stops a copy when the disk is full', () => {
    st.drives.B.capacity = vfs.used('B');
    expect(() => vfs.copy('A:\\README.TXT', 'B:\\', ADMIN)).toThrow('DISK FULL: 0 BYTES FREE ON B:.  COPY CANCELLED.');
    expect(vfs.exists('B:\\README.TXT')).toBe(false);
  });

  it('reports a drive without a disk', () => {
    st.drives.B.ready = false;
    expect(() => vfs.get('B:\\')).toThrow(NotReadyError);
    expect(() => vfs.get('B:\\')).toThrow('NOT READY READING DRIVE B:  ABORT, RETRY, FAIL?');
  });
});

describe('copy, move and trash', () => {
  it('copies into a folder and onto a new name', () => {
    vfs.copy('A:\\README.TXT', 'B:\\BACKUP', ADMIN);
    vfs.copy('A:\\README.TXT', 'C:\\TEMP\\READ.BAK', ADMIN);
    expect(vfs.read('B:\\BACKUP\\README.TXT')).toBe(vfs.read('A:\\README.TXT'));
    expect(vfs.exists('C:\\TEMP\\READ.BAK')).toBe(true);
    expect(() => vfs.copy('A:\\README.TXT', 'B:\\BACKUP', ADMIN)).toThrow(/ALREADY EXISTS/);
    vfs.copy('A:\\README.TXT', 'B:\\BACKUP', ADMIN, { overwrite: true });
  });

  it('copies folders recursively but not into themselves', () => {
    vfs.copy('A:\\DOCS', 'C:\\', ADMIN);
    expect(vfs.exists('C:\\DOCS\\LETTERS\\BBS.LTR')).toBe(true);
    expect(() => vfs.copy('A:\\DOCS', 'A:\\DOCS\\LETTERS', ADMIN)).toThrow(/INTO ITSELF/);
  });

  it('moves and renames', () => {
    vfs.move('A:\\TODO.TXT', 'B:\\', ADMIN);
    expect(vfs.exists('A:\\TODO.TXT')).toBe(false);
    expect(vfs.exists('B:\\TODO.TXT')).toBe(true);
    vfs.rename('B:\\TODO.TXT', 'LIST.TXT', ADMIN);
    expect(vfs.exists('B:\\LIST.TXT')).toBe(true);
  });

  it('moves to the trash and restores', () => {
    vfs.trash('A:\\NOTES.TXT', ADMIN);
    expect(vfs.exists('A:\\NOTES.TXT')).toBe(false);
    const t = vfs.trashItems().find((n) => fullName(n) === 'NOTES.TXT')!;
    expect(t.from).toBe('A:\\');
    expect(vfs.undel('NOTES.TXT', ADMIN)).toBe('A:\\NOTES.TXT');
    expect(vfs.exists('A:\\NOTES.TXT')).toBe(true);
  });

  it('empties the trash and says so', () => {
    expect(vfs.emptyTrash()).toBe(3);
    expect(() => vfs.undel('X.TXT', ADMIN)).toThrow('TRASH IS EMPTY.');
  });

  it('deletes for good from inside the trash', () => {
    vfs.trash('C:\\TRASH\\DRAFT.TXT', ADMIN);
    expect(vfs.trashItems().map(fullName)).not.toContain('DRAFT.TXT');
  });

  it('throws FsError, never a raw Error, for user mistakes', () => {
    expect(() => vfs.mkdir('A:\\DOCS', ADMIN)).toThrow(FsError);
    expect(() => vfs.dir('A:\\NOPE')).toThrow('PATH NOT FOUND: A:\\NOPE.  TYPE DIR TO LIST FOLDERS.');
  });
});
