// Tokens: words (optionally quoted), |, >, >>, &.

export type Token =
  | { t: 'word'; v: string; quoted: boolean; start: number; end: number }
  | { t: 'pipe' }
  | { t: 'gt' }
  | { t: 'gtgt' }
  | { t: 'amp' };

export function lex(input: string): Token[] {
  const out: Token[] = [];
  let i = 0;
  while (i < input.length) {
    const c = input[i];
    if (c === ' ' || c === '\t') {
      i++;
      continue;
    }
    if (c === '|') {
      out.push({ t: 'pipe' });
      i++;
      continue;
    }
    if (c === '&') {
      out.push({ t: 'amp' });
      i++;
      continue;
    }
    if (c === '>') {
      if (input[i + 1] === '>') {
        out.push({ t: 'gtgt' });
        i += 2;
      } else {
        out.push({ t: 'gt' });
        i++;
      }
      continue;
    }
    if (c === '"') {
      const end = input.indexOf('"', i + 1);
      const v = end < 0 ? input.slice(i + 1) : input.slice(i + 1, end);
      const stop = end < 0 ? input.length : end + 1;
      out.push({ t: 'word', v, quoted: true, start: i, end: stop });
      i = stop;
      continue;
    }
    let j = i;
    while (j < input.length && !' \t|&>"'.includes(input[j])) j++;
    out.push({ t: 'word', v: input.slice(i, j), quoted: false, start: i, end: j });
    i = j;
  }
  return out;
}

/** Splits a line on unquoted pipes (used for alias expansion before parsing). */
export function splitUnquoted(line: string, sep: string): string[] {
  const parts: string[] = [];
  let cur = '';
  let q = false;
  for (const c of line) {
    if (c === '"') q = !q;
    if (c === sep && !q) {
      parts.push(cur);
      cur = '';
    } else cur += c;
  }
  parts.push(cur);
  return parts;
}
