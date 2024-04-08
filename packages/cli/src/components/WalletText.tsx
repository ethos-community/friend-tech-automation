import { Text } from 'ink';
import type { ReactElement } from 'react';
import type { Wallet as WalletType } from '../clients/keychain.js';

export function WalletText({ name, address }: WalletType): ReactElement {
  return (
    <Text>
      <Text color="cyan" bold>
        {name}
      </Text>{' '}
      ({address})
    </Text>
  );
}
