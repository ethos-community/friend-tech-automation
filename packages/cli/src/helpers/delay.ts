import { setTimeout } from 'node:timers/promises';

export function getDelayRange(delay: number): [number, number] {
  const half = delay / 2;

  return [delay - half, delay + half];
}

export function formatDelayRange(delay: number): string {
  const [min, max] = getDelayRange(delay);

  return `${min}-${max}s`;
}

export function getNumberInRange(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1) + min);
}

/**
 * This will wait for a random amount of time between -50% and 50% of the
 * provided delay.
 * @param delay Delay in seconds
 */
export async function wait(delay: number): Promise<void> {
  const [min, max] = getDelayRange(delay);

  await setTimeout(getNumberInRange(min, max) * 1000);
}
