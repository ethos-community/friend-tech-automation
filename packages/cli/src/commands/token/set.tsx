import { PasswordInput, Spinner, StatusMessage } from '@inkjs/ui';
import { Newline, Text } from 'ink';
import { useState, type ReactElement } from 'react';
import { setFtToken } from '../../clients/keychain.js';

export default function Set(): ReactElement {
  const [error, setError] = useState<Error>();
  const [success, setSuccess] = useState<boolean>(false);

  if (error) {
    return <StatusMessage variant="error">{error.message}</StatusMessage>;
  }

  if (!success) {
    return (
      <>
        <Text>Paste friend.tech JWT token</Text>
        <Newline />
        <PasswordInput
          placeholder="  🔒 Enter token"
          onSubmit={(value) => {
            try {
              setFtToken(value)
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
    <StatusMessage variant="success">Successfully set friend.tech JWT token</StatusMessage>
  ) : (
    <Spinner label="Saving into Keychain Access..." />
  );
}
