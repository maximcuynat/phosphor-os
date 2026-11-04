// The Green Room BBS: the only number that answers (see A:\SECRET.TXT).

export interface BbsItem {
  from: string;
  subject: string;
  date: string;
  body: string[];
}

export const BBS = {
  number: '555-0184',
  name: 'THE GREEN ROOM BBS',
  info: 'NODE 1 OF 2   SYSOP: NIGHTOWL   EST. 1983',
  lastCall: '11-02-84',
  dialMs: 3000,
};

/** True when the typed number reaches the board (dashes and spaces ignored). */
export function answers(number: string): boolean {
  return number.replace(/[^0-9]/g, '') === BBS.number.replace(/[^0-9]/g, '');
}

export const MESSAGES: BbsItem[] = [
  {
    from: 'NIGHTOWL',
    subject: 'WELCOME BACK',
    date: '11-03-84',
    body: ['HELLO AND WELCOME BACK TO THE GREEN ROOM.', 'THE FILE LIBRARY NOW HOLDS 128 FILES.', 'SNAKE 1.2 IS IN THE GAMES AREA.', '', 'NIGHTOWL'],
  },
  {
    from: 'TAPEWORM',
    subject: 'RE: MODEM SPEED',
    date: '11-03-84',
    body: ['2400 BAUD WORKS FINE ON MY LINE.', 'TRY 8N1 IF YOU SEE STRANGE CHARACTERS.', 'THE NOISE IS WORSE WHEN IT RAINS.', '', 'TAPEWORM'],
  },
  {
    from: 'GLITCH',
    subject: 'GREEN OR AMBER?',
    date: '11-04-84',
    body: ['I SWITCHED MY SCREEN TO AMBER LAST WEEK.', 'MY EYES THANK ME.  WHAT DO YOU USE?', '', 'GLITCH'],
  },
];

export const BULLETINS: BbsItem[] = [
  {
    from: 'SYSOP',
    subject: 'NODE 2 OPENS SOON',
    date: '11-02-84',
    body: ['A SECOND LINE IS COMING TO THE GREEN ROOM.', 'TWO CALLERS AT ONCE, NO MORE BUSY SIGNAL.', 'WATCH THIS SPACE FOR THE NUMBER.'],
  },
  {
    from: 'SYSOP',
    subject: 'RULES OF THE ROOM',
    date: '11-01-84',
    body: ['BE KIND.  KEEP MESSAGES SHORT.', 'NO CALLS AFTER MIDNIGHT ON SUNDAYS.', 'UPLOADS ARE CHECKED BEFORE THEY GO LIVE.'],
  },
];

export const FILES: Array<{ name: string; size: string; desc: string }> = [
  { name: 'SNAKE12.PKG', size: '24K', desc: 'SNAKE 1.2 GAME PACKAGE' },
  { name: 'BBSNEWS.TXT', size: '1K', desc: 'NEWS OF THE ROOM' },
  { name: 'FONTS.ARC', size: '12K', desc: 'SCREEN FONT SET' },
  { name: 'MODEM.TXT', size: '3K', desc: 'MODEM TIPS AND TRICKS' },
  { name: 'CHESS.PKG', size: '31K', desc: 'CHESS AGAINST THE MACHINE' },
  { name: 'TUNES.ARC', size: '18K', desc: 'BEEPER MUSIC' },
  { name: 'LOGOS.ARC', size: '9K', desc: 'LOGO COLLECTION' },
];
export const FILE_COUNT = 128;

export const CHAT_GREETING = 'NIGHTOWL IS AT THE KEYBOARD.  TYPE A LINE, THEN ENTER.';

export const CHAT_REPLIES = [
  'HELLO!  GOOD TO SEE YOU ON THE LINE.',
  'THE ROOM IS QUIET TONIGHT.  TELL ME MORE.',
  'I HEAR YOU.  THE LINE IS CLEAR HERE.',
  'INTERESTING.  HAVE YOU TRIED THE FILE LIBRARY?',
  'NOTED.  I WILL POST IT IN THE BULLETINS.',
  'THE TAPES NEVER LIE.  KEEP TYPING.',
];

export const DOWNLOAD = {
  name: 'BBSNEWS.TXT',
  dest: 'C:\\TEMP\\BBSNEWS.TXT',
  content: [
    'THE GREEN ROOM BBS  NEWS',
    '========================',
    '',
    'NOV 04 1984',
    '- NODE 2 IS BEING WIRED.  TWO CALLERS AT ONCE SOON.',
    '- THE FILE LIBRARY PASSED 128 FILES.',
    '- SNAKE 1.2 IS OUT.  INSTALL IT WITH INSTALL SNAKE12.PKG.',
    '- XMODEM IS THE ONLY DOWNLOAD PROTOCOL FOR NOW.',
    '',
    'RULES OF THE ROOM',
    '- BE KIND.  KEEP MESSAGES SHORT.',
    '- UPLOADS ARE CHECKED BEFORE THEY GO LIVE.',
    '- NO CALLS AFTER MIDNIGHT ON SUNDAYS.',
    '',
    'SEE YOU ON THE LINE.  NIGHTOWL',
    '',
    '(THIS FILE WAS TRANSFERRED WITH XMODEM, 128 BYTE BLOCKS.)',
  ].join('\n'),
};
