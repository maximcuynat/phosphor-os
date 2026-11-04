// Program registry: id -> factory. ESC in any program returns to the console.

import type { AppFactory } from './types';
import { DialApp } from './dial';
import { EditApp } from './edit';
import { FilesApp } from './files';
import { HelpApp } from './help';
import { InstallApp } from './install';
import { LogApp } from './log';
import { SysinfoApp } from './sysinfo';
import { TopApp } from './top';
import { ViewApp } from './view';

export const APPS: Record<string, AppFactory> = {
  files: () => new FilesApp(),
  view: () => new ViewApp(),
  edit: () => new EditApp(),
  help: () => new HelpApp(),
  top: () => new TopApp(),
  sysinfo: () => new SysinfoApp(),
  log: () => new LogApp(),
  dial: () => new DialApp(),
  install: () => new InstallApp(),
};
