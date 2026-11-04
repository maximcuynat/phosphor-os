// Session commands: LOGIN LOGOUT WHOAMI USERS PASSWD SHUTDOWN REBOOT.

import { OsError } from '../../kernel/errors';
import { checkPassword, findUser, setPassword } from '../../kernel/users';
import type { Command } from '../types';
import { params } from './util';

export const LOGOUT: Command = {
  name: 'LOGOUT',
  aliases: ['EXIT'],
  usage: 'LOGOUT',
  summary: 'CLOSE THE SESSION OF THIS CONSOLE.',
  group: 'SESSION',
  run(c) {
    if (c.tty.detached) return;
    c.os.logout(c.tty);
  },
};

export const LOGIN: Command = {
  name: 'LOGIN',
  usage: 'LOGIN [USER]',
  summary: 'LOG IN AS ANOTHER USER ON THIS CONSOLE.',
  group: 'SESSION',
  noSafe: true,
  run(c) {
    if (c.tty.detached) return;
    const name = params(c)[0]?.toUpperCase() ?? '';
    if (name && !findUser(c.os.state, name)) throw new OsError(`UNKNOWN USER ${name}.  TYPE USERS TO LIST ACCOUNTS.`);
    const t = c.tty;
    c.os.logout(t);
    t.login.user = name;
    t.login.focus = name ? 'password' : 'user';
  },
};

export const WHOAMI: Command = {
  name: 'WHOAMI',
  usage: 'WHOAMI',
  summary: 'SHOW THE CURRENT USER.',
  group: 'SESSION',
  run(c) {
    c.io.print(`${c.user.name}  (${c.user.role.toUpperCase()})  TTY${c.tty.n}`);
  },
};

export const USERS: Command = {
  name: 'USERS',
  usage: 'USERS',
  summary: 'LIST ACCOUNTS AND WHO IS LOGGED IN WHERE.',
  group: 'SESSION',
  run(c) {
    for (const u of c.os.state.users) {
      const on = c.os.ttys.filter((t) => t.session.user === u.name).map((t) => `TTY${t.n}`);
      c.io.print(`  ${u.name.padEnd(8)}${u.role.toUpperCase().padEnd(8)}${on.length ? on.join(' ') : '-'}`);
    }
  },
};

export const PASSWD: Command = {
  name: 'PASSWD',
  usage: 'PASSWD [USER]',
  summary: 'CHANGE A PASSWORD.  ADMIN CAN CHANGE ANY ACCOUNT.',
  group: 'SESSION',
  run(c) {
    const targetName = params(c)[0]?.toUpperCase() ?? c.user.name;
    const target = findUser(c.os.state, targetName);
    if (!target) throw new OsError(`UNKNOWN USER ${targetName}.  TYPE USERS TO LIST ACCOUNTS.`);
    if (target.name !== c.user.name && c.user.role !== 'admin') throw new OsError(`ADMIN ONLY: PASSWD ${target.name}.  YOU ARE ${c.user.name}.`, 'WARN');
    if (target.role === 'guest') throw new OsError('GUEST HAS NO PASSWORD.  LOG IN AS ADMIN OR USER.');
    const out = c.tty.console.io;
    const askNew = () =>
      c.ask({
        prompt: `NEW PASSWORD FOR ${target.name}:`,
        line: true,
        mask: true,
        onAnswer: (pw1) => {
          if (!pw1) {
            out.error('PASSWORD CANNOT BE EMPTY.  NOTHING CHANGED.');
            return;
          }
          c.ask({
            prompt: 'TYPE IT AGAIN:',
            line: true,
            mask: true,
            onAnswer: (pw2) => {
              if (pw1 !== pw2) {
                out.error('PASSWORDS DO NOT MATCH.  NOTHING CHANGED.');
                return;
              }
              setPassword(target, pw1);
              c.os.log('INFO', `PASSWORD CHANGED FOR ${target.name}`, c.user.name);
              out.info(`PASSWORD CHANGED FOR ${target.name}.`);
              c.os.save();
            },
          });
        },
      });
    const started =
      target.name === c.user.name && target.passwordHash
        ? c.ask({
            prompt: 'OLD PASSWORD:',
            line: true,
            mask: true,
            onAnswer: (old) => {
              if (!checkPassword(target, old)) {
                out.error('WRONG PASSWORD.  NOTHING CHANGED.');
                return;
              }
              askNew();
            },
          })
        : askNew();
    if (!started) throw new OsError('PASSWD ONLY WORKS AT THE PROMPT.');
  },
};

export const SHUTDOWN: Command = {
  name: 'SHUTDOWN',
  usage: 'SHUTDOWN',
  summary: 'STOP EVERYTHING SAFELY BEFORE TURNING THE COMPUTER OFF.',
  group: 'SESSION',
  noGuest: true,
  run(c) {
    const head = `${c.tty.console.prompt()} ${c.line.trim()}`;
    const others = c.os.ttys.filter((t) => t.loggedIn && t !== c.tty);
    if (!others.length) {
      c.os.shutdown([head]);
      return;
    }
    const who = others.map((t) => `${t.session.user} IS LOGGED IN ON TTY${t.n}`).join(', ');
    const q = `WARNING: ${who}.  CONTINUE? (Y/N)`;
    const asked = c.ask({
      prompt: q,
      style: 'b',
      keys: ['Y', 'N', 'ESC'],
      onAnswer: (k) => {
        if (k === 'Y') c.os.shutdown([head, `${q} Y`]);
        else c.tty.console.io.info('SHUTDOWN CANCELLED.');
      },
    });
    if (!asked) c.os.shutdown([head]);
  },
};

export const REBOOT: Command = {
  name: 'REBOOT',
  usage: 'REBOOT',
  summary: 'RESTART THE COMPUTER.',
  group: 'SESSION',
  noGuest: true,
  run(c) {
    c.os.log('INFO', 'REBOOT', c.user.name);
    c.os.reboot();
  },
};

export const SESSION_COMMANDS = [LOGIN, LOGOUT, WHOAMI, USERS, PASSWD, SHUTDOWN, REBOOT];
