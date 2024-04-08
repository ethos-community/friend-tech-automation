import { Spinner, StatusMessage, UnorderedList } from '@inkjs/ui';
import { Text } from 'ink';
import { useState, type ReactElement, useEffect } from 'react';
import { getWallets, type Wallet } from '../../clients/keychain.js';
import { WalletText } from '../../components/WalletText.js';

export default function List(): ReactElement {
  const [wallets, setWallets] = useState<Wallet[] | null>(null);
  const [error, setError] = useState<Error>();

  useEffect(() => {
    getWallets()
      .then((wallets) => {
        setWallets(wallets);
      })
      .catch((err) => {
        setError(err as Error);
      });
  }, []);

  if (error) {
    return <StatusMessage variant="error">{error.message}</StatusMessage>;
  }

  if (!wallets) {
    return <Spinner label="Loading wallets" />;
  }

  return wallets.length ? (
    <>
      <Text>Wallets:</Text>
      <UnorderedList>
        {wallets.map((wallet) => (
          <UnorderedList.Item key={wallet.address}>
            <WalletText {...wallet} />
          </UnorderedList.Item>
        ))}
      </UnorderedList>
    </>
  ) : (
    <Text>No wallets found</Text>
  );
}
