// Simulated devices (board [18]).

import type { OSState } from './types';

export interface DeviceRow {
  id: string;
  name: string;
  state: 'OK' | 'BUSY' | 'IDLE' | 'ONLINE' | 'NO DISK' | 'OFF';
}

export interface DeviceFlags {
  /** Modem connected (DIAL). */
  online: boolean;
  /** Drivers loaded by AUTOEXEC (LOAD). */
  loaded: Set<string>;
  safeMode: boolean;
}

export function deviceTable(state: OSState, f: DeviceFlags): DeviceRow[] {
  const printing = state.processes.some((p) => p.name === 'PRINT');
  const prnLoaded = f.loaded.has('PRN.DRV');
  const modemLoaded = f.loaded.has('MODEM.DRV');
  return [
    { id: 'CON', name: 'MONO PHOSPHOR 80X25', state: 'OK' },
    { id: 'KBD', name: 'KEYBOARD 84 KEYS', state: 'OK' },
    { id: 'CLOCK', name: 'REAL TIME CLOCK', state: 'OK' },
    { id: 'PRN', name: 'DOT MATRIX PRINTER', state: !prnLoaded || f.safeMode ? 'OFF' : printing ? 'BUSY' : 'IDLE' },
    { id: 'COM1', name: 'MODEM 2400 BAUD', state: !modemLoaded || f.safeMode ? 'OFF' : f.online ? 'ONLINE' : 'IDLE' },
    { id: 'A:', name: 'FLOPPY 360K', state: state.drives.A.ready ? 'OK' : 'NO DISK' },
    { id: 'B:', name: 'FLOPPY 360K', state: state.drives.B.ready ? 'OK' : 'NO DISK' },
    { id: 'C:', name: 'HARD DISK 21M', state: 'OK' },
  ];
}
