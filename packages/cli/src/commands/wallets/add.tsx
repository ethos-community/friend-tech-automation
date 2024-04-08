import { PasswordInput, Spinner, StatusMessage } from '@inkjs/ui';
import { Wallet } from 'ethers';
import { Newline, Text } from 'ink';
import { option } from 'pastel';
import { useState, type ReactElement, useEffect } from 'react';
import { z } from 'zod';
import { setWallet } from '../../clients/keychain.js';

export const options = z.object({
  name: z
    .string()
    .min(1)
    .describe(option({ description: 'Wallet name', alias: 'n' })),
});

interface Props {
  options: z.infer<typeof options>;
}

export default function Add({ options }: Props): ReactElement {
  const [privateKey, setPrivateKey] = useState<string>('');
  const [error, setError] = useState<Error>();
  const [success, setSuccess] = useState<boolean>(false);

  useEffect(() => {
    if (!privateKey) return;

    try {
      const { address } = new Wallet(privateKey);

      setWallet(address, options.name, privateKey)
        .then(() => {
          setSuccess(true);
        })
        .catch((err) => {
          setError(err);
        });
    } catch (err) {
      setError(err as Error);
    }
  }, [options.name, privateKey]);

  if (error) {
    return <StatusMessage variant="error">{error.message}</StatusMessage>;
  }

  if (!privateKey) {
    return (
      <>
        <Text>Copy the private key value from your account.</Text>
        <StatusMessage variant="info">
          You can find it in <Text bold>Account details</Text> in MetaMask.
        </StatusMessage>
        <Newline />
        <PasswordInput
          placeholder="  🔑 Enter private key"
          onSubmit={(value) => {
            setPrivateKey(value);
          }}
        />
      </>
    );
  }

  return success ? (
    <StatusMessage variant="success">Successfully added the wallet</StatusMessage>
  ) : (
    <Spinner label="Saving into Keychain Access..." />
  );
}
