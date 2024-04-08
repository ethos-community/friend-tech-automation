#!/usr/bin/env node

import Pastel from 'pastel';

const cli = new Pastel({
  importMeta: import.meta,
  name: 'fta',
});

async function run(): Promise<void> {
  await cli.run();
}

run().catch((err) => {
  console.error('❌ Failed to run CLI', err);
  process.exit(1);
});
