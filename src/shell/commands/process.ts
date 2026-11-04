// Process commands: PS JOBS FG KILL AT PRINT MEM.

import { stampDate, stampTime } from '../../kernel/clock';
import { OsError } from '../../kernel/errors';
import { cancelTask, schedule } from '../../kernel/scheduler';
import { now } from '../../kernel/clock';
import type { Command } from '../types';
import { params } from './util';

export const PS: Command = {
  name: 'PS',
  usage: 'PS',
  summary: 'LIST PROCESSES WITH THEIR PID, OWNER AND MEMORY.',
  group: 'PROCESSES',
  run(c) {
    c.io.info('  PID  USER    TTY   STATE   MEM   COMMAND');
    for (const p of c.os.procs.list)
      c.io.print(`  ${String(p.pid).padStart(3)}  ${p.user.padEnd(8)}${(p.tty ? `TTY${p.tty}` : '-').padEnd(6)}${p.state.toUpperCase().padEnd(8)}${`${p.memK}K`.padStart(4)}   ${p.cmd}`);
  },
};

export const JOBS: Command = {
  name: 'JOBS',
  usage: 'JOBS',
  summary: 'LIST THE BACKGROUND JOBS OF THIS CONSOLE.',
  group: 'PROCESSES',
  noSafe: true,
  run(c) {
    const jobs = c.os.procs.jobs(c.tty.n);
    if (!jobs.length) {
      c.io.info(`NO JOBS ON TTY${c.tty.n}.  END A COMMAND WITH & TO START ONE.`);
      return;
    }
    for (const j of jobs) c.io.print(`  [${j.jobId}] ${'RUNNING'.padEnd(10)}${j.cmd.padEnd(25)}${String(j.progress ?? 0).padStart(2)}%`);
  },
};

export const FG: Command = {
  name: 'FG',
  usage: 'FG N',
  summary: 'BRING JOB N TO THE FOREGROUND.  CTRL+Z SENDS IT BACK.',
  group: 'PROCESSES',
  noSafe: true,
  run(c) {
    const jobs = c.os.procs.jobs(c.tty.n);
    const n = params(c)[0] ? Number(params(c)[0]) : jobs[jobs.length - 1]?.jobId;
    const j = n !== undefined && n !== null ? c.os.procs.job(c.tty.n, n) : undefined;
    if (!j) throw new OsError(`NO JOB ${params(c)[0] ?? ''}ON TTY${c.tty.n}.  TYPE JOBS TO LIST THEM.`.replace('  ', ' '));
    if (c.io.captured || c.batch) throw new OsError('FG ONLY WORKS AT THE PROMPT.');
    j.background = false;
    c.tty.console.fgPid = j.pid;
  },
};

export const KILL: Command = {
  name: 'KILL',
  usage: 'KILL PID',
  summary: 'STOP A PROCESS.  TYPE PS OR JOBS TO FIND ITS PID.',
  group: 'PROCESSES',
  minArgs: 1,
  run(c) {
    const pid = Number(params(c)[0]);
    if (!Number.isInteger(pid)) throw new OsError(`BAD PID ${params(c)[0]}.  USAGE: KILL PID`);
    const r = c.os.kill(pid, c.user);
    if (!r.ok) throw new OsError(r.msg);
    if (r.msg) c.io.info(r.msg);
  },
};

export const AT: Command = {
  name: 'AT',
  usage: 'AT HH:MM COMMAND',
  summary: 'RUN A COMMAND LATER.  AT ALONE LISTS TASKS, AT /D N CANCELS ONE.',
  group: 'PROCESSES',
  noSafe: true,
  run(c) {
    const st = c.os.state;
    if (!c.args.length) {
      if (!st.tasks.length) {
        c.io.info('NO TASKS.  TYPE AT HH:MM COMMAND TO ADD ONE.');
        return;
      }
      for (const t of st.tasks) c.io.print(`  ${String(t.id).padStart(3)}  ${stampDate(t.at)} ${stampTime(t.at)}  ${t.cmd.padEnd(24)}${t.user}`);
      return;
    }
    if (c.args[0].toUpperCase() === '/D') {
      const id = Number(c.args[1]);
      const t = st.tasks.find((x) => x.id === id);
      if (!t) throw new OsError(`NO TASK ${c.args[1] ?? ''}.  TYPE AT TO LIST THEM.`);
      if (t.user !== c.user.name && c.user.role !== 'admin') throw new OsError(`ACCESS DENIED: TASK ${id} BELONGS TO ${t.user}.`);
      cancelTask(st, id);
      c.io.info(`TASK ${id} CANCELLED.`);
      return;
    }
    if (c.args.length < 2) throw new OsError(`REQUIRED PARAMETER MISSING.  USAGE: ${AT.usage}`);
    const [time, ...rest] = c.rest.trim().split(/\s+/);
    const { task, existed } = schedule(st, time, rest.join(' '), c.user.name, now());
    if (c.batch?.silent) return; // AUTOEXEC.BAT at login: no noise
    if (!existed) c.log('INFO', `TASK ${task.id} SCHEDULED ${stampTime(task.at)}`);
    c.io.info(`TASK ${task.id} SCHEDULED FOR ${stampDate(task.at)} ${stampTime(task.at)}`);
  },
};

export const PRINT: Command = {
  name: 'PRINT',
  usage: 'PRINT FILE',
  summary: 'PRINT A TEXT FILE ON PRN.  ADD & TO PRINT IN THE BACKGROUND.',
  group: 'PROCESSES',
  minArgs: 1,
  noSafe: true,
  run(c) {
    if (!c.os.loaded.has('PRN.DRV')) throw new OsError('PRINTER NOT READY: PRN.DRV IS NOT LOADED.  CHECK AUTOEXEC.BAT.');
    const arg = params(c)[0];
    const abs = c.abs(arg);
    const text = c.vfs.read(abs);
    const pages = Math.max(1, Math.ceil(text.split('\n').length / 24));
    const cmd = `PRINT ${arg.toUpperCase()}`;
    c.job({
      name: 'PRINT',
      cmd,
      memK: 12,
      totalMs: pages * 1500,
      status: (p) => `${cmd}  PAGE ${Math.min(pages, Math.floor((p / 100) * pages) + 1)}/${pages}   CTRL+Z TO SEND BACK`,
      done: (io) => io.info(`${cmd}: ${pages} PAGE(S) PRINTED.`),
    });
  },
};

export const MEM: Command = {
  name: 'MEM',
  usage: 'MEM',
  summary: 'SHOW HOW THE 640K OF MEMORY IS SHARED.',
  group: 'PROCESSES',
  run(c) {
    if (c.io.captured || c.batch) {
      for (const r of c.os.procs.memoryMap()) c.io.print(`  ${r.label.padEnd(14)}${`${r.k}K`.padStart(5)}`);
      return;
    }
    c.launch('sysinfo', ['MEM']);
  },
};

export const PROCESS_COMMANDS = [PS, JOBS, FG, KILL, AT, PRINT, MEM];
