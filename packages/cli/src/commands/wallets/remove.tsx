import { Select, Spinner, StatusMessage } from '@inkjs/ui';
import { Text } from 'ink';
import { useState, type ReactElement, useEffect } from 'react';
import { getWallets, removeWallet, type Wallet } from '../../clients/keychain.js';

export default function Remove(): ReactElement {
  const [wallets, setWallets] = useState<Wallet[] | null>(null);
  const [error, setError] = useState<Error>();
  const [address, setAddress] = useState<string>();

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

  if (address) {
    const wallet = wallets.find((w) => w.address === address);

    return (
      <StatusMessage variant="success">
        Wallet <Text bold>{wallet?.name}</Text> removed
      </StatusMessage>
    );
  }

  return wallets.length ? (
    <>
      <Text>Select wallet:</Text>
      <Select
        options={wallets.map((w) => ({
          label: `${w.name} (${w.address})`,
          value: w.address,
        }))}
        onChange={(value) => {
          removeWallet(value)
            .then(() => {
              setAddress(value);
            })
            .catch((err) => {
              setError(err);
            });
        }}
      />
    </>
  ) : (
    <Text>No wallets found</Text>
  );
}
