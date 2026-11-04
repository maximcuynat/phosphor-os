// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { DomRenderer } from '../src/render/dom';
import { Screen } from '../src/render/screen';
import { applyTheme, glowShadow } from '../src/render/theme';
import { bootOS, login, run } from './helpers';

describe('DOM renderer', () => {
  it('draws 25 rows, groups styles into spans and escapes text', () => {
    document.body.innerHTML = '<div id="m"></div>';
    const r = new DomRenderer(document.getElementById('m')!);
    const s = new Screen();
    s.put(0, 0, 'A<B>&C');
    s.put(10, 0, 'ERR', 'i');
    s.box(0, 2, 20, 5, 'n', { glow: true });
    s.setCursor(3, 4);
    r.draw(s);
    const rows = document.querySelectorAll('.text .row');
    expect(rows).toHaveLength(25);
    expect(rows[0].innerHTML).toContain('A&lt;B&gt;&amp;C');
    expect(rows[0].querySelector('.s-i')!.textContent).toBe('ERR');
    expect(document.querySelectorAll('.ov.box.glow')).toHaveLength(1);
    expect((document.querySelector('.cursor') as HTMLElement).classList.contains('hidden')).toBe(false);
    expect(document.querySelector('.scanlines')).not.toBeNull();
  });

  it('applies the theme as CSS variables', () => {
    applyTheme(document.documentElement, { phosphor: 'amber', glow: 6, scanlines: false, cursorBlinkMs: 1060 });
    const st = document.documentElement.style;
    expect(st.getPropertyValue('--fg')).toBe('#ffb000');
    expect(st.getPropertyValue('--blink')).toBe('1060ms');
    expect(document.documentElement.classList.contains('no-scanlines')).toBe(true);
    expect(glowShadow(6, '51,255,102')).toBe('0 0 3px rgba(51,255,102,.85), 0 0 12px rgba(51,255,102,.35)');
  });

  it('renders a real console screen without errors', () => {
    document.body.innerHTML = '<div id="m"></div>';
    const r = new DomRenderer(document.getElementById('m')!);
    const os = bootOS();
    login(os);
    run(os, 'DIR');
    const s = new Screen();
    os.render(s);
    r.draw(s);
    const text = [...document.querySelectorAll('.text .row')].map((e) => e.textContent).join('\n');
    expect(text).toContain('VOLUME IN DRIVE A IS SYSTEM');
    expect(text).toContain('ALT+F1 TTY1 ADMIN');
  });
});
