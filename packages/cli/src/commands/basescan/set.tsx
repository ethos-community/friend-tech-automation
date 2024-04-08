import { PasswordInput, Spinner, StatusMessage } from '@inkjs/ui';
import { Newline, Text } from 'ink';
import { useState, type ReactElement } from 'react';
import { setBasescanAPiKey } from '../../clients/keychain.js';

export default function Set(): ReactElement {
  const [error, setError] = useState<Error>();
  const [success, setSuccess] = useState<boolean>(false);

  if (error) {
    return <StatusMessage variant="error">{error.message}</StatusMessage>;
  }

  if (!success) {
    return (
      <>
        <Text>Paste Basescan API key</Text>
        <Newline />
        <PasswordInput
          placeholder="  🔒 Enter API key"
          onSubmit={(value) => {
            try {
              setBasescanAPiKey(value)
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
    <StatusMessage variant="success">Successfully set Basescan API key</StatusMessage>
  ) : (
    <Spinner label="Saving into Keychain Access..." />
  );
}
