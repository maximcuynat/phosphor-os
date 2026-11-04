// Errors carrying a ready-to-print, one-line, uppercase message.

export class OsError extends Error {
  /** WARN errors print bright instead of inverse. */
  constructor(
    message: string,
    public level: 'ERROR' | 'WARN' = 'ERROR',
  ) {
    super(message);
    this.name = 'OsError';
  }
}

export class MemoryError extends OsError {
  constructor(
    public freeK: number,
    public neededK: number,
  ) {
    super(`NOT ENOUGH MEMORY: ${freeK}K FREE, ${neededK}K NEEDED.`);
    this.name = 'MemoryError';
  }
}
