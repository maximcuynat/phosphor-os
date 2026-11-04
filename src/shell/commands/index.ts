// Every built-in command, in the order HELP lists them within a group.

import type { Command } from '../types';
import { FILE_COMMANDS } from './files';
import { PROCESS_COMMANDS } from './process';
import { CHKDSK, PROGRAM_COMMANDS } from './programs';
import { SESSION_COMMANDS } from './session';
import { SHELL_COMMANDS } from './shell';

export const COMMANDS: Command[] = [...PROGRAM_COMMANDS, ...FILE_COMMANDS, CHKDSK, ...SHELL_COMMANDS, ...PROCESS_COMMANDS, ...SESSION_COMMANDS];
