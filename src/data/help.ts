// Pages of the HELP program (board [12]) and of the console HELP command.
// One topic per command and program, plus GETTING STARTED and KEYBOARD.

export interface HelpArg {
  name: string;
  desc: string;
}

export interface HelpTopic {
  id: string;
  title: string;
  /** One short line (about 60 characters at most). */
  summary: string;
  /** Usage lines: arguments in CAPS, optional ones in [BRACKETS]. */
  syntax: string[];
  /** Every argument and option of the syntax, one line each. */
  args: HelpArg[];
  examples: Array<{ cmd: string; desc: string }>;
  /** Ids of other topics, shown as links. */
  seeAlso: string[];
  /** Free text: GETTING STARTED, KEYBOARD and the key lists of programs. */
  body?: string[];
}

type A = [string, string];

function t(id: string, summary: string, syntax: string[], args: A[], examples: A[], seeAlso: string[], body?: string[]): HelpTopic {
  return {
    id,
    title: id,
    summary,
    syntax,
    args: args.map(([name, desc]) => ({ name, desc })),
    examples: examples.map(([cmd, desc]) => ({ cmd, desc })),
    seeAlso,
    ...(body ? { body } : {}),
  };
}

const TOPICS: HelpTopic[] = [
  // ------------------------------------------------------------ programs
  t('FILES', 'OPEN THE FILE MANAGER.', ['FILES [FOLDER]'], [['FOLDER', 'FOLDER TO OPEN.  DEFAULT: THE CURRENT ONE.']], [['FILES', 'OPEN THE CURRENT FOLDER.'], ['FILES C:\\GAMES', 'OPEN C:\\GAMES.']], ['VIEW', 'EDIT', 'COPY', 'DEL'], [
    'UP/DN  MOVE     ENTER  OPEN     BKSP  PARENT FOLDER',
    'TAB    OTHER PANEL',
    'F1 HELP   F2 DRIVE   F3 VIEW   F4 EDIT   F5 COPY',
    'F6 MOVE   F7 MKDIR   F8 TRASH  F9 ATTR   F10 QUIT',
    'SHIFT+F8  DELETE NOW, WITHOUT THE TRASH',
    'CTRL+C / X / V  COPY, CUT, PASTE THROUGH THE CLIPBOARD',
  ]),
  t('VIEW', 'READ A FILE PAGE BY PAGE.', ['VIEW FILE'], [['FILE', 'FILE TO READ.']], [['VIEW A:\\DOCS\\MANUAL.TXT', 'READ THE USER MANUAL.']], ['EDIT', 'TYPE', 'FILES'], [
    'UP/DN  ONE LINE     PGUP/PGDN  ONE PAGE',
    '/      FIND TEXT    N          NEXT MATCH',
    'G      GO TO LINE   F4         EDIT THIS FILE',
    'ESC    QUIT',
  ]),
  t('EDIT', 'EDIT A TEXT FILE, UP TO 64K.', ['EDIT FILE'], [['FILE', 'FILE TO EDIT.  A NEW NAME MAKES A NEW FILE.']], [['EDIT NOTES.TXT', 'CHANGE AN EXISTING FILE.'], ['EDIT C:\\TEMP\\NEW.TXT', 'START A NEW FILE.']], ['VIEW', 'FILES', 'ATTR'], [
    'CTRL+S  SAVE            CTRL+F  FIND',
    'CTRL+G  GO TO LINE      CTRL+X  CUT LINE',
    'INS     INSERT / OVERWRITE',
    'F1      HELP            ESC     QUIT (ASKS TO SAVE)',
  ]),
  t('TOP', 'WATCH PROCESSES, CPU AND MEMORY LIVE.', ['TOP'], [], [['TOP', 'OPEN THE LIVE PROCESS LIST.']], ['PS', 'KILL', 'MEM', 'SYSINFO'], [
    'UP/DN  SELECT A PROCESS    K  KILL IT',
    'S      CHANGE SORT ORDER   +/-  REFRESH RATE',
    'H      HELP                ESC  QUIT',
  ]),
  t('SYSINFO', 'SHOW DISKS, MEMORY MAP AND DEVICES.', ['SYSINFO'], [], [['SYSINFO', 'OPEN THE SYSTEM SCREEN.']], ['MEM', 'CHKDSK', 'TOP'], [
    'C  CHKDSK       M  MEMORY DETAIL',
    'D  DEVICES      R  REFRESH       ESC  QUIT',
  ]),
  t('LOG', 'READ EVENTS.LOG: ERRORS, WARNINGS, EVENTS.', ['LOG'], [], [['LOG', 'OPEN THE EVENT LOG.']], ['SYSINFO', 'TOP', 'TYPE'], [
    'UP/DN  SCROLL       END  JUMP TO THE LATEST ENTRY',
    'F      CHANGE FILTER   /  SEARCH',
    'E      EXPORT          ESC  QUIT',
  ]),
  t('DIAL', 'CALL A BULLETIN BOARD WITH THE MODEM ON COM1.', ['DIAL NUMBER'], [['NUMBER', 'PHONE NUMBER TO CALL.  NEEDS MODEM.DRV.']], [['DIAL 555-0184', 'CALL THE GREEN ROOM BBS.']], ['HANGUP', 'LOAD', 'INSTALL'], [
    'IN THE BOARD PRESS THE LETTER OF A MENU ITEM:',
    'M MESSAGES   F FILE LIBRARY   C CHAT WITH SYSOP',
    'B BULLETINS  D DOWNLOAD       G GOODBYE',
    'ESC          BACK TO THE MAIN MENU',
    'ESC OR ALT+H  HANG UP FROM THE MAIN MENU',
  ]),
  t('INSTALL', 'INSTALL A .PKG PACKAGE AND ITS COMMAND.', ['INSTALL FILE.PKG'], [['FILE.PKG', 'PACKAGE FILE TO INSTALL.  NOT FOR GUEST.']], [['INSTALL B:\\SNAKE.PKG', 'INSTALL SNAKE IN C:\\GAMES\\SNAKE.']], ['UNINSTALL', 'MEM', 'CHKDSK'], [
    'FOUR STEPS: CHECK SPACE, CHECK MEMORY, COPY FILES,',
    'REGISTER COMMAND.',
    'ENTER  START, THEN CLOSE    ESC  CANCEL',
    'F1     HELP',
  ]),

  // ------------------------------------------------------------ files
  t('DIR', 'LIST THE FILES OF A FOLDER.', ['DIR [MASK] [/W] [/S] [/A]'], [['MASK', 'FOLDER OR NAME TO LIST.  * AND ? ALLOWED.'], ['/W', 'WIDE LIST, NAMES ONLY.'], ['/S', 'INCLUDE SUBFOLDERS.'], ['/A', 'SHOW HIDDEN FILES TOO.']], [['DIR', 'LIST THE CURRENT FOLDER.'], ['DIR *.TXT /W', 'LIST TEXT FILES, NAMES ONLY.'], ['DIR A:\\DOCS /S', 'LIST DOCS AND ITS SUBFOLDERS.']], ['CD', 'FIND', 'FILES', 'ATTR']),
  t('CD', 'CHANGE THE CURRENT FOLDER.  ALSO CHDIR.', ['CD [FOLDER]'], [['FOLDER', 'WHERE TO GO.  .. IS UP, \\ IS THE ROOT.']], [['CD DOCS', 'ENTER THE DOCS FOLDER.'], ['CD ..', 'GO UP ONE FOLDER.'], ['CD', 'PRINT THE CURRENT FOLDER.']], ['DIR', 'MKDIR', 'RMDIR']),
  t('MKDIR', 'MAKE A FOLDER.  ALSO MD.', ['MKDIR FOLDER'], [['FOLDER', 'NEW FOLDER, 8.3 NAME.']], [['MKDIR LETTERS', 'MAKE LETTERS HERE.'], ['MD C:\\TEMP\\WORK', 'MAKE WORK ON THE HARD DISK.']], ['RMDIR', 'CD', 'DIR']),
  t('RMDIR', 'REMOVE AN EMPTY FOLDER.  ALSO RD.', ['RMDIR FOLDER'], [['FOLDER', 'EMPTY FOLDER TO REMOVE.']], [['RMDIR C:\\TEMP\\WORK', 'REMOVE THE FOLDER WORK.']], ['MKDIR', 'DEL', 'CD']),
  t('COPY', 'COPY ONE OR MORE FILES TO ANOTHER PLACE.', ['COPY SOURCE DESTINATION [/Y] [/V]'], [['SOURCE', 'FILE TO COPY.  * AND ? ALLOWED.'], ['DESTINATION', 'FOLDER OR NEW NAME.'], ['/Y', 'OVERWRITE WITHOUT ASKING.'], ['/V', 'VERIFY AFTER COPY.']], [['COPY README.TXT B:\\', 'COPY ONE FILE TO DISK B:.'], ['COPY *.TXT B:\\BACKUP /Y', 'COPY ALL TEXT FILES, REPLACING OLD ONES.'], ['COPY A:\\DOCS\\IDEAS.TXT C:\\TEMP\\IDEAS.BAK', 'COPY AND RENAME.']], ['MOVE', 'DEL', 'ATTR', 'FILES']),
  t('MOVE', 'MOVE OR RENAME FILES.', ['MOVE SOURCE DESTINATION'], [['SOURCE', 'FILE TO MOVE.  * AND ? ALLOWED.'], ['DESTINATION', 'FOLDER, OR NEW NAME FOR ONE FILE.']], [['MOVE TODO.TXT C:\\TEMP', 'MOVE A FILE TO C:\\TEMP.'], ['MOVE *.BAK B:\\BACKUP', 'MOVE ALL .BAK FILES.']], ['COPY', 'REN', 'DEL']),
  t('REN', 'RENAME A FILE IN PLACE.  ALSO RENAME.', ['REN FILE NEWNAME'], [['FILE', 'FILE TO RENAME.'], ['NEWNAME', 'NEW NAME ONLY, NO DRIVE OR FOLDER.']], [['REN NOTES.TXT NOTES.OLD', 'RENAME A FILE.']], ['MOVE', 'COPY', 'ATTR']),
  t('DEL', 'SEND FILES TO THE TRASH.  ALSO ERASE.', ['DEL FILE [/S]'], [['FILE', 'FILE TO DELETE.  * AND ? ALLOWED.'], ['/S', 'ALSO DELETE A FOLDER AND ITS FILES.']], [['DEL DRAFT.TXT', 'SEND A FILE TO C:\\TRASH.'], ['DEL *.BAK', 'SEND ALL .BAK FILES TO THE TRASH.']], ['UNDEL', 'EMPTY', 'RMDIR']),
  t('UNDEL', 'RESTORE A FILE FROM THE TRASH.', ['UNDEL [FILE]'], [['FILE', 'FILE TO RESTORE.  NONE: LIST THE TRASH.']], [['UNDEL', 'LIST THE TRASH.'], ['UNDEL DRAFT.TXT', 'PUT DRAFT.TXT BACK WHERE IT WAS.']], ['DEL', 'EMPTY', 'FILES']),
  t('EMPTY', 'DELETE EVERYTHING IN THE TRASH FOR GOOD.', ['EMPTY'], [], [['EMPTY', 'ASK, THEN PURGE THE TRASH.']], ['DEL', 'UNDEL']),
  t('TYPE', 'PRINT A TEXT FILE ON THE SCREEN.', ['TYPE FILE'], [['FILE', 'FILE TO PRINT.  * AND ? ALLOWED.']], [['TYPE README.TXT', 'PRINT THE README.'], ['TYPE TODO.TXT | FIND "[ ]"', 'SHOW THE OPEN TASKS ONLY.']], ['VIEW', 'FIND', 'PRINT']),
  t('ATTR', 'SHOW OR CHANGE FILE ATTRIBUTES.', ['ATTR [+R -R +S -S +H -H +A -A] FILE'], [['FILE', 'FILE OR MASK.  NO CHANGE: SHOW ATTRIBUTES.'], ['+R -R', 'SET OR CLEAR READ-ONLY.'], ['+S -S', 'SET OR CLEAR SYSTEM.  ADMIN ONLY.'], ['+H -H', 'SET OR CLEAR HIDDEN.'], ['+A -A', 'SET OR CLEAR ARCHIVE.']], [['ATTR NOTES.TXT', 'SHOW THE ATTRIBUTES.'], ['ATTR +R README.TXT', 'MAKE README.TXT READ-ONLY.']], ['DIR', 'COPY', 'FILES']),
  t('FIND', 'SEARCH TEXT IN FILES, OR FILE NAMES.', ['FIND "TEXT" [FILE]', 'FIND [PATH] MASK [/S]'], [['"TEXT"', 'TEXT TO SEARCH, IN QUOTES.'], ['FILE', 'FILE TO SEARCH.  IN A PIPE: NONE.'], ['PATH', 'FOLDER WHERE TO SEARCH NAMES.'], ['MASK', 'FILE NAME TO LOOK FOR.  * AND ? ALLOWED.'], ['/S', 'ALSO LOOK IN SUBFOLDERS.']], [['FIND "BBS" A:\\NOTES.TXT', 'SHOW LINES WITH BBS.'], ['FIND A:\\ *.TXT /S', 'FIND EVERY TEXT FILE ON A:.']], ['DIR', 'TYPE', 'VIEW']),
  t('PACK', 'PACK A FILE OR FOLDER INTO AN ARCHIVE.', ['PACK SOURCE ARCHIVE.ARC [&]'], [['SOURCE', 'FILE OR FOLDER TO PACK.'], ['ARCHIVE.ARC', 'ARCHIVE TO CREATE.'], ['&', 'RUN IN THE BACKGROUND.  USES 32K.']], [['PACK A:\\DOCS B:\\DOCS.ARC', 'PACK THE DOCS FOLDER.'], ['PACK A:\\DOCS B:\\DOCS.ARC &', 'SAME, AS A BACKGROUND JOB.']], ['UNPACK', 'JOBS', 'COPY']),
  t('UNPACK', 'EXTRACT AN ARCHIVE MADE WITH PACK.', ['UNPACK ARCHIVE.ARC [FOLDER]'], [['ARCHIVE.ARC', 'ARCHIVE TO EXTRACT.  NEEDS 256K FREE.'], ['FOLDER', 'WHERE TO EXTRACT.  DEFAULT: HERE.']], [['UNPACK B:\\DOCS.ARC C:\\TEMP', 'EXTRACT TO C:\\TEMP.']], ['PACK', 'MEM', 'JOBS']),
  t('EJECT', 'TAKE THE DISK OUT OF A FLOPPY DRIVE.', ['EJECT DRIVE:'], [['DRIVE:', 'A: OR B:.  C: CANNOT BE EJECTED.']], [['EJECT B:', 'TAKE OUT THE DATA DISK.']], ['INSERT', 'CHKDSK']),
  t('INSERT', 'PUT THE DISK BACK IN A FLOPPY DRIVE.', ['INSERT DRIVE:'], [['DRIVE:', 'A: OR B:.']], [['INSERT B:', 'PUT THE DATA DISK BACK.']], ['EJECT', 'DIR']),
  t('CHKDSK', 'CHECK A DISK FOR ERRORS.', ['CHKDSK [DRIVE:]'], [['DRIVE:', 'DISK TO CHECK.  DEFAULT: THE CURRENT ONE.']], [['CHKDSK', 'CHECK THE CURRENT DISK.'], ['CHKDSK B:', 'CHECK THE DATA DISK.']], ['SYSINFO', 'DIR', 'MEM']),

  // ------------------------------------------------------------ shell
  t('ECHO', 'PRINT A LINE OF TEXT.', ['ECHO [TEXT]', 'ECHO OFF | ON'], [['TEXT', 'TEXT TO PRINT.  %VAR% IS REPLACED.'], ['OFF | ON', 'IN A .BAT: HIDE OR SHOW COMMANDS.']], [['ECHO HELLO, %USER%.', 'PRINT A GREETING.'], ['ECHO NOTE >> C:\\TEMP\\LOG.TXT', 'APPEND A LINE TO A FILE.']], ['SET', 'TYPE', 'IF']),
  t('SET', 'SHOW OR SET ENVIRONMENT VARIABLES.', ['SET [VAR=VALUE]'], [['VAR', 'VARIABLE NAME.  NONE: LIST ALL.'], ['VALUE', 'NEW VALUE.  EMPTY REMOVES THE VARIABLE.']], [['SET PROMPT=$U@$P$G', 'SET THE PROMPT.  $U USER  $P PATH  $G >  $T TIME'], ['ECHO %USER%', 'READ A VARIABLE.']], ['ECHO', 'ALIAS', 'IF']),
  t('ALIAS', 'MAKE A SHORTCUT COMMAND.', ['ALIAS [NAME=COMMAND]'], [['NAME', 'SHORTCUT, UP TO 8 LETTERS OR DIGITS.'], ['COMMAND', 'WHAT IT RUNS.  EMPTY REMOVES THE ALIAS.']], [['ALIAS LS=DIR /W', 'LS NOW LISTS WIDE.'], ['ALIAS', 'LIST ALL ALIASES.']], ['UNALIAS', 'SET', 'HISTORY']),
  t('UNALIAS', 'REMOVE AN ALIAS.', ['UNALIAS NAME'], [['NAME', 'ALIAS TO REMOVE.']], [['UNALIAS LS', 'FORGET THE LS SHORTCUT.']], ['ALIAS']),
  t('CLS', 'CLEAR THE SCREEN.', ['CLS'], [], [['CLS', 'CLEAR THIS CONSOLE.']], ['ECHO', 'HISTORY']),
  t('VER', 'SHOW THE SYSTEM VERSION.', ['VER'], [], [['VER', 'PRINT THE VERSION.']], ['DATE', 'TIME', 'SYSINFO']),
  t('DATE', 'SHOW THE DATE.', ['DATE'], [], [['DATE', 'PRINT TODAY IN 1984.']], ['TIME', 'AT']),
  t('TIME', 'SHOW THE TIME.', ['TIME'], [], [['TIME', 'PRINT THE TIME.']], ['DATE', 'AT']),
  t('HISTORY', 'LIST THE LAST COMMANDS OF THIS CONSOLE.', ['HISTORY'], [], [['HISTORY', 'LIST THE LAST 20 LINES.']], ['ALIAS', 'KEYBOARD']),
  t('LOAD', 'LOAD A DRIVER FROM A:\\SYSTEM.', ['LOAD DRIVER.DRV'], [['DRIVER.DRV', 'DRIVER TO LOAD, FOR EXAMPLE MODEM.DRV.']], [['LOAD MODEM.DRV', 'LOAD THE MODEM DRIVER.']], ['DIAL', 'PRINT', 'MEM']),
  t('IF', 'RUN A COMMAND ONLY WHEN A TEST IS TRUE.', ['IF [NOT] EXIST FILE COMMAND', 'IF [NOT] A==B COMMAND'], [['NOT', 'REVERSE THE TEST.'], ['EXIST FILE', 'TRUE WHEN THE FILE EXISTS.'], ['A==B', 'TRUE WHEN BOTH WORDS ARE EQUAL.'], ['COMMAND', 'WHAT TO RUN WHEN THE TEST PASSES.']], [['IF NOT EXIST B:\\BACKUP MKDIR B:\\BACKUP', 'MAKE THE FOLDER ONLY IF MISSING.'], ['IF EXIST TODO.TXT TYPE TODO.TXT', 'PRINT IT ONLY IF PRESENT.']], ['FOR', 'ECHO', 'SET']),
  t('FOR', 'RUN A COMMAND FOR EACH FILE OR WORD.', ['FOR %%F IN (LIST) DO COMMAND'], [['%%F', 'LOOP VARIABLE, ONE LETTER.'], ['LIST', 'NAMES, WORDS OR MASKS LIKE *.TXT.'], ['COMMAND', 'WHAT TO RUN.  USE %%F FOR EACH ITEM.']], [['FOR %%F IN (*.TXT) DO COPY %%F B:\\BACKUP', 'BACK UP EVERY TEXT FILE.']], ['IF', 'ECHO', 'COPY']),

  // ------------------------------------------------------------ processes
  t('PS', 'LIST PROCESSES WITH PID, OWNER AND MEMORY.', ['PS'], [], [['PS', 'LIST EVERY PROCESS.']], ['TOP', 'KILL', 'JOBS', 'MEM']),
  t('JOBS', 'LIST THE BACKGROUND JOBS OF THIS CONSOLE.', ['JOBS'], [], [['PACK A:\\DOCS B:\\D.ARC &', 'START A JOB.'], ['JOBS', 'LIST THE JOBS.']], ['FG', 'KILL', 'PS']),
  t('FG', 'BRING A JOB TO THE FOREGROUND.', ['FG [N]'], [['N', 'JOB NUMBER.  DEFAULT: THE LAST JOB.']], [['FG 1', 'BRING JOB 1 BACK.  CTRL+Z SENDS IT AWAY.']], ['JOBS', 'KILL']),
  t('KILL', 'STOP A PROCESS.', ['KILL PID'], [['PID', 'PROCESS NUMBER, FROM PS OR JOBS.']], [['KILL 6', 'STOP PROCESS 6.']], ['PS', 'JOBS', 'TOP']),
  t('AT', 'RUN A COMMAND LATER.', ['AT HH:MM COMMAND', 'AT', 'AT /D N'], [['HH:MM', 'TIME OF DAY TO RUN.'], ['COMMAND', 'COMMAND LINE TO RUN.'], ['/D N', 'CANCEL TASK NUMBER N.']], [['AT 18:00 BACKUP.BAT', 'RUN THE BACKUP AT SIX.'], ['AT', 'LIST SCHEDULED TASKS.'], ['AT /D 1', 'CANCEL TASK 1.']], ['TIME', 'JOBS', 'LOG']),
  t('PRINT', 'PRINT A TEXT FILE ON PRN.', ['PRINT FILE [&]'], [['FILE', 'FILE TO PRINT.  NEEDS PRN.DRV.'], ['&', 'PRINT IN THE BACKGROUND.  USES 12K.']], [['PRINT README.TXT', 'PRINT THE README.'], ['PRINT NOTES.TXT &', 'PRINT IN THE BACKGROUND.']], ['LOAD', 'JOBS', 'TYPE']),
  t('MEM', 'SHOW HOW THE 640K OF MEMORY IS SHARED.', ['MEM'], [], [['MEM', 'OPEN THE MEMORY MAP.']], ['SYSINFO', 'TOP', 'PS']),

  // ------------------------------------------------------------ launchers and session
  t('HELP', 'LIST COMMANDS, OR EXPLAIN ONE AND ITS ARGUMENTS.', ['HELP [SECTION | COMMAND] [/M]'], [['SECTION', 'PROGRAMS, DISKS, SHELL, PROCESSES OR SESSION.'], ['COMMAND', 'COMMAND OR PROGRAM.  NONE: THE SUMMARY.'], ['/M', 'OPEN THE PAGE IN THE FULL-SCREEN MANUAL.']], [['HELP', 'SUMMARY OF THE SECTIONS AND COMMANDS.'], ['HELP DISKS', 'FILE COMMANDS, ONE LINE EACH.'], ['HELP COPY', 'SHOW COPY, ITS ARGUMENTS AND EXAMPLES.'], ['HELP COPY /M', 'OPEN THE MANUAL ON COPY.']], ['GETTING STARTED', 'KEYBOARD'], [
    'UP/DN  TOPIC       ENTER  OPEN      TAB  LINKS',
    '/      SEARCH      PGUP/DN  SCROLL  ESC  QUIT',
    'F1 AT THE PROMPT OPENS THIS MANUAL.',
  ]),
  t('HANGUP', 'HANG UP THE MODEM.', ['HANGUP'], [], [['HANGUP', 'END A CALL OPEN ON ANOTHER CONSOLE.']], ['DIAL', 'LOAD']),
  t('UNINSTALL', 'REMOVE AN INSTALLED PACKAGE.', ['UNINSTALL NAME'], [['NAME', 'PACKAGE OR COMMAND NAME.  NOT FOR GUEST.']], [['UNINSTALL SNAKE', 'DELETE SNAKE AND ITS COMMAND.']], ['INSTALL', 'DIR']),
  t('LOGIN', 'LOG IN AS ANOTHER USER ON THIS CONSOLE.', ['LOGIN [USER]'], [['USER', 'ACCOUNT NAME.  NONE: ASK AT THE SCREEN.']], [['LOGIN USER', 'SWITCH TO THE USER ACCOUNT.']], ['LOGOUT', 'WHOAMI', 'USERS']),
  t('LOGOUT', 'CLOSE THE SESSION OF THIS CONSOLE.  ALSO EXIT.', ['LOGOUT'], [], [['LOGOUT', 'LEAVE THIS CONSOLE.']], ['LOGIN', 'SHUTDOWN']),
  t('WHOAMI', 'SHOW THE CURRENT USER.', ['WHOAMI'], [], [['WHOAMI', 'PRINT NAME, ROLE AND CONSOLE.']], ['USERS', 'LOGIN']),
  t('USERS', 'LIST ACCOUNTS AND WHO IS ON WHERE.', ['USERS'], [], [['USERS', 'LIST ACCOUNTS.']], ['WHOAMI', 'PASSWD']),
  t('PASSWD', 'CHANGE A PASSWORD.', ['PASSWD [USER]'], [['USER', 'ACCOUNT.  DEFAULT: YOU.  OTHERS: ADMIN ONLY.']], [['PASSWD', 'CHANGE YOUR OWN PASSWORD.'], ['PASSWD USER', 'ADMIN: CHANGE THE USER PASSWORD.']], ['USERS', 'LOGIN']),
  t('SHUTDOWN', 'STOP EVERYTHING SAFELY.', ['SHUTDOWN'], [], [['SHUTDOWN', 'CLOSE EVERYTHING, THEN TURN OFF.']], ['REBOOT', 'LOGOUT']),
  t('REBOOT', 'RESTART THE COMPUTER.', ['REBOOT'], [], [['REBOOT', 'RESTART AND RUN AUTOEXEC.BAT AGAIN.']], ['SHUTDOWN', 'LOAD']),
];

const GETTING_STARTED: HelpTopic = {
  id: 'GETTING STARTED',
  title: 'GETTING STARTED',
  summary: 'FIRST STEPS WITH PHOSPHOR OS.',
  syntax: [],
  args: [],
  examples: [
    { cmd: 'DIR', desc: 'LIST THE FILES OF THIS FOLDER.' },
    { cmd: 'FILES', desc: 'OPEN THE FILE MANAGER.' },
    { cmd: 'HELP COPY', desc: 'OPEN THE MANUAL ON COPY.' },
  ],
  seeAlso: ['KEYBOARD', 'FILES', 'DIR', 'HELP'],
  body: [
    'LOGGING IN',
    '  TYPE YOUR USER NAME, TAB, YOUR PASSWORD, ENTER.',
    '  GUEST HAS NO PASSWORD BUT CANNOT CHANGE SYSTEM',
    '  FILES OR INSTALL PROGRAMS.',
    '',
    'THE PROMPT',
    '  ADMIN@A:\\> SHOWS WHO YOU ARE AND WHERE YOU ARE.',
    '  TYPE A COMMAND AND PRESS ENTER.',
    '  UP AND DOWN RECALL OLD LINES, TAB COMPLETES NAMES.',
    '',
    'DRIVES',
    '  A: SYSTEM DISK   B: DATA DISK   C: HARD DISK',
    '  TYPE B: THEN DIR TO LOOK AT THE DATA DISK.',
    '',
    'LOST?',
    '  ESC GOES BACK ONE STEP IN EVERY PROGRAM.',
    '  F1 OPENS THIS MANUAL FROM THE PROMPT.',
  ],
};

const KEYBOARD: HelpTopic = {
  id: 'KEYBOARD',
  title: 'KEYBOARD',
  summary: 'KEYS THAT WORK EVERYWHERE.  NO MOUSE NEEDED.',
  syntax: [],
  args: [],
  examples: [],
  seeAlso: ['FILES', 'EDIT', 'VIEW', 'GETTING STARTED'],
  body: [
    'GLOBAL KEYS',
    '  ALT+F1 TO F4   SWITCH VIRTUAL CONSOLE',
    '  CTRL+C X V     CLIPBOARD: COPY, CUT, PASTE',
    '  F1             HELP',
    '  CTRL+1 TO CTRL+0   SAME AS F1 TO F10 (MAC KEYBOARDS)',
    '  ESC            BACK ONE LEVEL',
    '  UP / DOWN      HISTORY AT THE PROMPT',
    '  TAB            AUTOCOMPLETE',
    '  PGUP / PGDN    SCROLL THE CONSOLE BY 10 LINES',
    '  SHIFT+UP/DOWN  SCROLL THE CONSOLE BY ONE LINE',
    '  ALT+1 TO ALT+4 SAME AS ALT+F1 TO ALT+F4',
    '',
    'AT POWER ON',
    '  ESC DURING BOOT   SETUP',
    '  F8 DURING BOOT    SAFE MODE',
    '',
    'AT THE LOGIN SCREEN',
    '  TAB NEXT FIELD   ENTER LOGIN',
    '  F8 SAFE MODE     F10 SHUTDOWN',
    '',
    'IN PROGRAMS',
    '  THE BOTTOM ROW LISTS THE KEYS OF THE PROGRAM.',
  ],
};

export const HELP_TOPICS: HelpTopic[] = [GETTING_STARTED, KEYBOARD, ...TOPICS.sort((a, b) => a.id.localeCompare(b.id))];

const ALIASES: Record<string, string> = { MD: 'MKDIR', RD: 'RMDIR', CHDIR: 'CD', RENAME: 'REN', ERASE: 'DEL', EXIT: 'LOGOUT' };

/** Topic by id, case-insensitive, aliases resolved. */
export function findTopic(id: string): HelpTopic | undefined {
  const n = id.trim().toUpperCase();
  const k = ALIASES[n] ?? n;
  return HELP_TOPICS.find((x) => x.id === k);
}

/** All the text of a topic, uppercase, for the / search. */
export function topicText(t: HelpTopic): string {
  return [
    t.title,
    t.summary,
    ...t.syntax,
    ...t.args.flatMap((a) => [a.name, a.desc]),
    ...t.examples.flatMap((e) => [e.cmd, e.desc]),
    ...(t.body ?? []),
  ]
    .join('\n')
    .toUpperCase();
}
