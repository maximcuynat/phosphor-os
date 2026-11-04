import { describe, expect, it } from 'vitest';
import { normalize } from '../src/input';

const ev = (key: string, code: string, mods: Partial<Record<'ctrlKey' | 'altKey' | 'shiftKey' | 'metaKey', boolean>> = {}) => ({
  key,
  code,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  metaKey: false,
  ...mods,
});

describe('keyboard normalisation', () => {
  it('maps Ctrl+1..Ctrl+0 to F1..F10 (macOS keeps the real F keys)', () => {
    expect(normalize(ev('1', 'Digit1', { ctrlKey: true }))!.combo).toBe('f1');
    expect(normalize(ev('0', 'Digit0', { ctrlKey: true }))!.combo).toBe('f10');
    expect(normalize(ev('*', 'Digit8', { ctrlKey: true, shiftKey: true }))!.combo).toBe('shift+f8');
  });

  it('keeps the real F keys, Alt+digit for TTYs and Cmd shortcuts apart', () => {
    expect(normalize(ev('F8', 'F8', { shiftKey: true }))!.combo).toBe('shift+f8');
    expect(normalize(ev('¡', 'Digit1', { altKey: true }))!.combo).toBe('alt+1');
    expect(normalize(ev('1', 'Digit1', { metaKey: true }))!.combo).toBe('ctrl+1');
  });

  it('uppercases printable characters', () => {
    expect(normalize(ev('a', 'KeyA'))!.ch).toBe('A');
    expect(normalize(ev('s', 'KeyS', { ctrlKey: true }))!.combo).toBe('ctrl+s');
  });
});
