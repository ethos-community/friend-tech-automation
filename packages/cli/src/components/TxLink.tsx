import { shortenHash } from '@fta/helpers';
import { Text } from 'ink';
import Link from 'ink-link';
import type { ReactElement } from 'react';

export function TxLink({ txHash }: { txHash: string }): ReactElement {
  return (
    <Text color="yellow">
      <Link url={`https://basescan.org/tx/${txHash}`}>{shortenHash(txHash)}</Link>
    </Text>
  );
}
