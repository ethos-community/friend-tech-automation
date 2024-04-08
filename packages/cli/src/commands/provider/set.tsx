import { PasswordInput, Spinner, StatusMessage } from '@inkjs/ui';
import { Newline, Text } from 'ink';
import { useState, type ReactElement } from 'react';
import { setNodeProviderUrl } from '../../clients/keychain.js';

export default function Set(): ReactElement {
  const [error, setError] = useState<Error>();
  const [success, setSuccess] = useState<boolean>(false);

  if (error) {
    return <StatusMessage variant="error">{error.message}</StatusMessage>;
  }

  if (!success) {
    return (
      <>
        <Text>
          Paste node provider URL for <Text bold>Base Mainnet</Text> network
        </Text>
        <StatusMessage variant="info">
          You can get it from registering the app on Alchemy or Infura.
        </StatusMessage>
        <Newline />
        <PasswordInput
          placeholder="  🌍 Enter URL"
          onSubmit={(value) => {
            try {
              const url = new URL(value);

              if (!url) {
                throw new Error('Invalid URL');
              }

              setNodeProviderUrl(value)
                .then(() => {
                  setSuccess(true);
                })
                .catch((err) => {
                  setError(err);
                });
            } catch (err) {
              setError(err as Error);
            }
          }}
        />
      </>
    );
  }

  return success ? (
    <StatusMessage variant="success">Successfully set node provider URL</StatusMessage>
  ) : (
    <Spinner label="Saving into Keychain Access..." />
  );
}
