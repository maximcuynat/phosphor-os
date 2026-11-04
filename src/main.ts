// Start-up: render loop, key routing, theme, persistence.

import '@fontsource/vt323/400.css';
import './render/crt.css';
import { APPS } from './apps/registry';
import { normalize } from './input';
import { OS } from './os';
import { DomRenderer } from './render/dom';
import { Screen } from './render/screen';
import { applyTheme } from './render/theme';
import { COMMANDS } from './shell/commands';

const host = document.getElementById('monitor')!;
const renderer = new DomRenderer(host);
const screen = new Screen();

const os = new OS({
  apps: APPS,
  commands: COMMANDS,
  fx: (fx) => {
    if (fx === 'power-on') void renderer.animate('power-on', 720);
    else if (fx === 'power-off') void renderer.animate('power-off', 300).then(() => renderer.setOff(true));
    else if (fx === 'off') renderer.setOff(true);
    else renderer.setOff(false);
  },
});

let themeKey = '';
function frame(): void {
  const st = os.settings;
  const key = `${st.phosphor}|${st.glow}|${st.scanlines}|${st.cursorBlinkMs}|${st.stretch}`;
  if (key !== themeKey) {
    themeKey = key;
    applyTheme(document.documentElement, st);
    renderer.setStretch(st.stretch);
  }
  os.render(screen);
  renderer.draw(screen);
}

// Keyboard only. Keys the OS uses are kept from the browser.
const PASS_THROUGH = new Set(['f5', 'ctrl+r', 'f11', 'f12', 'ctrl+shift+i']);
window.addEventListener('keydown', (ev) => {
  const k = normalize(ev);
  if (!k) return;
  if (PASS_THROUGH.has(k.combo)) return;
  ev.preventDefault();
  os.key(k);
  frame();
});

// The mouse does nothing.
for (const type of ['mousedown', 'mouseup', 'click', 'dblclick', 'contextmenu', 'wheel'] as const) {
  window.addEventListener(type, (e) => e.preventDefault(), { passive: false, capture: true });
}

window.addEventListener('beforeunload', () => os.save());

let last = performance.now();
setInterval(() => {
  const t = performance.now();
  os.tick(t - last);
  last = t;
  frame();
}, 100);

os.powerOn();
frame();

// Debug handle in the browser console.
(window as unknown as { phosphor: OS }).phosphor = os;
