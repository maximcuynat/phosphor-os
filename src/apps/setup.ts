// [03] Setup: up/down select, left/right change, F9 defaults, F10 save + reboot, ESC exit without saving.
// Changes apply live (preview) and are rolled back on ESC.

import type { KeyEvent } from '../input';
import { dateStr, hhmm } from '../kernel/clock';
import { DEFAULT_SETTINGS, type Settings } from '../kernel/types';
import type { OS } from '../os';
import { COLS, type Screen } from '../render/screen';
import { PALETTES } from '../render/theme';

type Section = 'DATE AND TIME' | 'DISPLAY' | 'BOOT ORDER' | 'PASSWORDS' | 'EXIT';
const SECTIONS: Section[] = ['DATE AND TIME', 'DISPLAY', 'BOOT ORDER', 'PASSWORDS', 'EXIT'];

interface Field {
  section: Section;
  label: string;
  change?(s: Settings, dir: number): void;
  render(scr: Screen, x: number, y: number, s: Settings): void;
}

const cycle = <T,>(list: readonly T[], cur: T, dir: number): T => list[(list.indexOf(cur) + dir + list.length) % list.length];

function chips(scr: Screen, x: number, y: number, options: string[], current: string): void {
  let cx = x;
  for (const o of options) cx = scr.put(cx, y, ` ${o} `, o === current ? 'i' : 'd') + 2;
}

function arrows(scr: Screen, x: number, y: number, value: string, extra = ''): void {
  let cx = scr.put(x, y, '< ');
  cx = scr.put(cx, y, value, 'b');
  cx = scr.put(cx, y, ' >');
  if (extra) scr.put(cx + 3, y, extra, 'd');
}

const BLINKS = [530, 1060, 1600, 0];
const SAVERS = [0, 1, 2, 5, 10, 15, 30];

export class SetupScreen {
  private sel = 2; // PHOSPHOR COLOR
  private original: Settings;
  private msg = '';
  private fields: Field[];

  constructor(private os: OS) {
    this.original = { ...os.settings };
    this.fields = [
      { section: 'DATE AND TIME', label: 'DATE', render: (s, x, y) => s.put(x, y, `${dateStr()}   FROM THE HOST CLOCK`) },
      { section: 'DATE AND TIME', label: 'TIME', render: (s, x, y) => s.put(x, y, `${hhmm()}       FROM THE HOST CLOCK`) },
      {
        section: 'DISPLAY',
        label: 'PHOSPHOR COLOR',
        change: (st, d) => (st.phosphor = cycle(['green', 'amber', 'white'] as const, st.phosphor, d)),
        render: (s, x, y, st) => {
          let cx = x;
          for (const name of ['green', 'amber', 'white'] as const) {
            const on = st.phosphor === name;
            const label = ` ${name.toUpperCase()} `;
            s.overlays.push({ t: 'rect', x: cx + 0.3, y: y + 0.25, w: 1.1, h: 0.5, color: PALETTES[name].fg });
            cx = s.put(cx + 2, y, label, on ? 'i' : 'd') + 2;
          }
        },
      },
      {
        section: 'DISPLAY',
        label: 'GLOW',
        change: (st, d) => (st.glow = Math.max(0, Math.min(12, st.glow + d))),
        render: (s, x, y, st) => {
          for (let i = 1; i <= 12; i++) s.rect(x + (i - 1) * 1.6, y + 0.15, 1.2, 0.7, i <= st.glow ? 'n' : 'k', 'solid', i <= st.glow);
          s.put(x + 21, y, String(st.glow), 'b');
        },
      },
      {
        section: 'DISPLAY',
        label: 'SCANLINES',
        change: (st) => (st.scanlines = !st.scanlines),
        render: (s, x, y, st) => chips(s, x, y, ['ON', 'OFF'], st.scanlines ? 'ON' : 'OFF'),
      },
      {
        section: 'DISPLAY',
        label: 'CURSOR BLINK',
        change: (st, d) => (st.cursorBlinkMs = cycle(BLINKS, BLINKS.includes(st.cursorBlinkMs) ? st.cursorBlinkMs : 1060, d)),
        render: (s, x, y, st) => arrows(s, x, y, st.cursorBlinkMs ? `${(st.cursorBlinkMs / 1000).toFixed(2)} S` : 'OFF'),
      },
      {
        section: 'DISPLAY',
        label: 'SCREENSAVER',
        change: (st, d) => (st.screensaverMin = cycle(SAVERS, SAVERS.includes(st.screensaverMin) ? st.screensaverMin : 5, d)),
        render: (s, x, y, st) => arrows(s, x, y, st.screensaverMin ? `AFTER ${st.screensaverMin} MIN` : 'NEVER'),
      },
      {
        section: 'DISPLAY',
        label: 'LOCK ON WAKE',
        change: (st) => (st.lockOnWake = !st.lockOnWake),
        render: (s, x, y, st) => arrows(s, x, y, st.lockOnWake ? 'YES' : 'NO', 'ASKS THE PASSWORD'),
      },
      {
        section: 'DISPLAY',
        label: 'POWER-ON EFFECT',
        change: (st) => (st.powerOnEffect = !st.powerOnEffect),
        render: (s, x, y, st) => chips(s, x, y, ['ON', 'OFF'], st.powerOnEffect ? 'ON' : 'OFF'),
      },
      {
        section: 'BOOT ORDER',
        label: 'BOOT ORDER',
        change: (st) => (st.bootOrder = st.bootOrder === 'A: C:' ? 'C: A:' : 'A: C:'),
        render: (s, x, y, st) => arrows(s, x, y, st.bootOrder, 'FIRST DRIVE TRIED AT BOOT'),
      },
      {
        section: 'PASSWORDS',
        label: 'ACCOUNTS',
        render: (s, x, y) => {
          let cy = y;
          for (const u of this.os.state.users) {
            s.put(x, cy, u.name.padEnd(8));
            s.put(x + 9, cy, u.role === 'guest' ? 'NO PASSWORD' : u.passwordHash ? 'PASSWORD SET' : 'NOT SET', u.passwordHash || u.role === 'guest' ? 'd' : 'b');
            cy++;
          }
          s.put(x, cy + 1, 'CHANGE THEM WITH PASSWD AFTER LOGIN.', 'd');
        },
      },
      {
        section: 'EXIT',
        label: 'SAVE AND REBOOT',
        change: () => this.saveAndReboot(),
        render: (s, x, y) => s.put(x, y, 'PRESS ENTER OR F10', 'd'),
      },
      {
        section: 'EXIT',
        label: 'DISCARD CHANGES',
        change: () => this.discard(),
        render: (s, x, y) => s.put(x, y, 'PRESS ENTER OR ESC', 'd'),
      },
    ];
  }

  private get st(): Settings {
    return this.os.state.settings;
  }

  private changed(): boolean {
    return JSON.stringify(this.st) !== JSON.stringify(this.original);
  }

  private saveAndReboot(): void {
    this.os.log('INFO', 'SETUP SAVED');
    this.os.save();
    this.os.reboot();
  }

  private discard(): void {
    this.os.state.settings = { ...this.original };
    this.os.reboot();
  }

  onKey(e: KeyEvent): void {
    this.msg = '';
    const f = this.fields[this.sel];
    switch (e.combo) {
      case 'arrowup':
        this.sel = (this.sel - 1 + this.fields.length) % this.fields.length;
        return;
      case 'arrowdown':
        this.sel = (this.sel + 1) % this.fields.length;
        return;
      case 'arrowleft':
      case 'arrowright':
      case 'enter':
        if (f.change) f.change(this.st, e.combo === 'arrowleft' ? -1 : 1);
        else this.msg = f.section === 'DATE AND TIME' ? 'THE CLOCK FOLLOWS THE HOST.  NOTHING TO CHANGE HERE.' : 'READ ONLY.  USE PASSWD AFTER LOGIN.';
        return;
      case 'f9':
        this.os.state.settings = { ...DEFAULT_SETTINGS };
        this.msg = 'DEFAULT VALUES LOADED.  F10 TO SAVE.';
        return;
      case 'f10':
        this.saveAndReboot();
        return;
      case 'escape':
        this.discard();
        return;
    }
  }

  render(s: Screen): void {
    s.titleBar(0, 'PHOSPHOR SETUP UTILITY  BIOS V2.1', this.changed() ? '* CHANGED' : '');
    const cur = this.fields[this.sel];
    // Menu
    s.box(0, 1, 21, 22, 'd');
    SECTIONS.forEach((sec, i) => {
      const on = sec === cur.section;
      s.put(2, 2 + i, ` ${sec}`.padEnd(17), on ? 'i' : 'n');
    });
    // Fields of the current section
    s.box(22, 1, 58, 22, 'n', { glow: true });
    s.put(24, 2, cur.section, 'd');
    let y = 4;
    for (const f of this.fields.filter((x) => x.section === cur.section)) {
      const on = f === cur;
      s.put(24, y, on ? `>${f.label}` : ` ${f.label}`, on ? 'b' : 'n');
      f.render(s, 44, y, this.st);
      y += f.section === 'PASSWORDS' ? 6 : 2;
    }
    // Preview with the live palette
    s.box(23, 17, 56, 5, 'k', { single: true });
    s.put(25, 18, 'PREVIEW', 'd');
    let px = s.put(25, 19, 'ADMIN@A:\\> DIR    ');
    px = s.put(px, 19, ' SELECTED ', 'i') + 3;
    px = s.put(px, 19, 'DIM TEXT', 'd') + 3;
    s.put(px, 19, 'BRIGHT', 'b');
    if (this.msg) s.put(1, 23, this.msg, 'b');
    s.keyBar(24, [
      ['UP/DN', 'SELECT'],
      ['<->', 'CHANGE'],
      ['F9', 'DEFAULTS'],
      ['F10', 'SAVE + REBOOT'],
      ['ESC', 'EXIT NO SAVE'],
    ]);
    void COLS;
  }
}
