const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ['year', 31536000000],
  ['month', 2592000000],
  ['day', 86400000],
  ['hour', 3600000],
  ['minute', 60000],
  ['second', 1000],
];

const rtf = new Intl.RelativeTimeFormat('en', { style: 'long' });

/**
 *
 * @param ts timestamp in unix format in seconds
 */
export function getRelativeTime(ts: number): string | undefined {
  const elapsed = ts * 1000 - Date.now();

  for (const [unit, amount] of units) {
    if (Math.abs(elapsed) > amount || unit === 'second') {
      return rtf.format(Math.round(elapsed / amount), unit);
    }
  }

  return undefined;
}
