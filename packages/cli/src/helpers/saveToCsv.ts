import fs from 'node:fs';
import path from 'node:path';

export function saveToCsv(data: string[], outDir: string, filePrefix: string): string {
  const csv = [...data, '\n'];

  const filePath = getFileName(outDir, filePrefix);

  fs.writeFileSync(filePath, csv.join('\n'));

  return filePath;
}

function getFileName(dir: string, filePrefix: string): string {
  const ts = Date.now();

  const [date] = new Date(ts).toISOString().split('T');
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  return path.resolve(dir.replace(/^~/, process.env.HOME!), `${filePrefix}-${date}-${ts}.csv`);
}
