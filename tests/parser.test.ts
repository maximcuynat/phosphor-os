import { describe, expect, it } from 'vitest';
import { expandAliases, expandVars, parse } from '../src/shell/parser';
import { substituteParams } from '../src/shell/batch';

describe('parser', () => {
  it('parses pipes, redirections and &', () => {
    const p = parse('TYPE IDEAS.TXT | FIND "TODO" > OUT.TXT &');
    expect(p.background).toBe(true);
    expect(p.cmds.map((c) => c.name)).toEqual(['TYPE', 'FIND']);
    expect(p.cmds[1].args).toEqual(['TODO']);
    expect(p.cmds[1].quoted).toEqual([true]);
    expect(p.cmds[1].redirect).toEqual({ path: 'OUT.TXT', append: false });
  });

  it('keeps the raw argument text', () => {
    expect(parse('ECHO WELCOME, ADMIN.  TYPE HELP.').cmds[0].rest).toBe('WELCOME, ADMIN.  TYPE HELP.');
  });

  it('parses >> as append', () => {
    expect(parse('DIR >> LOG.TXT').cmds[0].redirect).toEqual({ path: 'LOG.TXT', append: true });
  });

  it('rejects broken syntax with a usage line', () => {
    expect(() => parse('| DIR')).toThrow(/SYNTAX ERROR NEAR \|/);
    expect(() => parse('DIR |')).toThrow(/SYNTAX ERROR/);
    expect(() => parse('DIR >')).toThrow(/SYNTAX ERROR NEAR >/);
    expect(() => parse('DIR & DIR')).toThrow(/SYNTAX ERROR AFTER &/);
  });

  it('expands variables and aliases before parsing', () => {
    expect(expandVars('ECHO %USER% IN %temp%', { USER: 'ADMIN', TEMP: 'C:\\TEMP' })).toBe('ECHO ADMIN IN C:\\TEMP');
    expect(expandVars('ECHO %NOPE%.', {})).toBe('ECHO .');
    expect(expandAliases('LS | FIND "TXT"', { LS: 'DIR /W' })).toBe('DIR /W | FIND "TXT"');
    expect(expandAliases('ECHO LS', { LS: 'DIR /W' })).toBe('ECHO LS');
  });

  it('substitutes batch parameters but not %%F', () => {
    expect(substituteParams('COPY %1 %2 %%F', ['X.BAT', 'A.TXT', 'B:\\'])).toBe('COPY A.TXT B:\\ %%F');
  });
});
