// Process table and 640K memory accounting (brief §8, boards [11], [17], [18]).

import { MEM_BUFFERS_K, MEM_DRIVERS_K, MEM_KERNEL_K, MEM_TOTAL_K } from '../config';
import { now } from './clock';
import { MemoryError } from './errors';
import type { OSState, ProcInfo } from './types';

export const MEM_FIXED_K = MEM_KERNEL_K + MEM_DRIVERS_K + MEM_BUFFERS_K;

export interface SpawnOpts {
  name: string;
  cmd?: string;
  user: string;
  tty: number;
  memK: number;
  kind: ProcInfo['kind'];
  background?: boolean;
  state?: ProcInfo['state'];
}

export class ProcessTable {
  constructor(private state: () => OSState) {}

  get list(): ProcInfo[] {
    return this.state().processes;
  }

  /** Memory taken by processes outside the fixed kernel/driver/buffer area. */
  usedK(): number {
    return MEM_FIXED_K + this.list.filter((p) => p.kind !== 'system').reduce((s, p) => s + p.memK, 0);
  }

  freeK(): number {
    return Math.max(0, MEM_TOTAL_K - this.usedK());
  }

  /** Memory map rows for SYSINFO / MEM: label, K. */
  memoryMap(): Array<{ label: string; k: number; kind: 'kernel' | 'drivers' | 'buffers' | 'proc' | 'free' }> {
    const rows: Array<{ label: string; k: number; kind: 'kernel' | 'drivers' | 'buffers' | 'proc' | 'free' }> = [
      { label: 'KERNEL', k: MEM_KERNEL_K, kind: 'kernel' },
      { label: 'DRIVERS', k: MEM_DRIVERS_K, kind: 'drivers' },
    ];
    for (const p of this.list.filter((q) => q.kind !== 'system')) {
      rows.push({ label: p.kind === 'shell' ? `SHELL TTY${p.tty}` : p.name, k: p.memK, kind: 'proc' });
    }
    rows.push({ label: 'BUFFERS', k: MEM_BUFFERS_K, kind: 'buffers' });
    rows.push({ label: 'FREE', k: this.freeK(), kind: 'free' });
    return rows;
  }

  nextPid(): number {
    return this.state().counters.pid++;
  }

  /** Reserves memory and creates a process. Throws MemoryError when it does not fit. */
  spawn(o: SpawnOpts): ProcInfo {
    if (o.kind !== 'system' && o.memK > this.freeK()) throw new MemoryError(this.freeK(), o.memK);
    const p: ProcInfo = {
      pid: this.nextPid(),
      name: o.name.toUpperCase(),
      cmd: (o.cmd ?? o.name).toUpperCase(),
      user: o.user,
      tty: o.tty,
      state: o.state ?? (o.kind === 'job' ? 'run' : 'sleep'),
      background: !!o.background,
      jobId: null,
      memK: o.memK,
      cpu: 0,
      progress: null,
      startedAt: now(),
      cpuTime: 0,
      kind: o.kind,
    };
    if (o.kind === 'job') {
      const ids = this.list.filter((q) => q.tty === o.tty && q.jobId !== null).map((q) => q.jobId as number);
      p.jobId = ids.length ? Math.max(...ids) + 1 : 1;
    }
    this.list.push(p);
    return p;
  }

  get(pid: number): ProcInfo | undefined {
    return this.list.find((p) => p.pid === pid);
  }

  remove(pid: number): ProcInfo | undefined {
    const i = this.list.findIndex((p) => p.pid === pid);
    if (i < 0) return undefined;
    return this.list.splice(i, 1)[0];
  }

  jobs(tty: number): ProcInfo[] {
    return this.list.filter((p) => p.tty === tty && p.kind === 'job');
  }

  job(tty: number, jobId: number): ProcInfo | undefined {
    return this.list.find((p) => p.tty === tty && p.jobId === jobId);
  }

  shellOf(tty: number): ProcInfo | undefined {
    return this.list.find((p) => p.tty === tty && p.kind === 'shell');
  }

  /** Simulated CPU load, updated every tick. */
  updateCpu(dtMs: number, activeTty: number, rand: () => number = Math.random): void {
    let total = 0;
    for (const p of this.list) {
      let target: number;
      if (p.name === 'IDLE') target = 0;
      else if (p.kind === 'job' && p.state === 'run') target = 12 + rand() * 18;
      else if (p.kind === 'app' && p.tty === activeTty && p.state === 'run') target = 3 + rand() * 20;
      else if (p.kind === 'shell' && p.tty === activeTty) target = 2 + rand() * 10;
      else if (p.name === 'KERNEL') target = 4 + rand() * 4;
      else target = rand() * 1.5;
      p.cpu = Math.round((p.cpu * 0.6 + target * 0.4) * 10) / 10;
      total += p.cpu;
      if (p.cpu > 0) p.cpuTime += (dtMs / 1000) * (p.cpu / 100) * 10;
    }
    void total;
  }

  totalCpu(): number {
    return Math.min(100, Math.round(this.list.filter((p) => p.name !== 'IDLE').reduce((s, p) => s + p.cpu, 0)));
  }
}
