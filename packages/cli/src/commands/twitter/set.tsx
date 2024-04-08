import { PasswordInput, StatusMessage, TextInput } from '@inkjs/ui';
import { Text } from 'ink';
import type { ReactElement } from 'react';
import { useState } from 'react';
import { setTwitterCredentials } from '../../clients/keychain.js';

export default function Set(): ReactElement {
  const [username, setUsername] = useState<string>();
  const [password, setPassword] = useState<string>();
  const [email, setEmail] = useState<string>();
  const [error, setError] = useState<Error>();

  if (error) {
    return <Text color="red">{error.message}</Text>;
  }

  if (!username) {
    return <TextInput placeholder="Enter Twitter username" onSubmit={setUsername} />;
  }

  if (!password) {
    return <PasswordInput placeholder="Enter Twitter password" onSubmit={setPassword} />;
  }

  if (!email) {
    return (
      <TextInput
        placeholder="Enter Twitter email"
        onSubmit={(v) => {
          setTwitterCredentials(username, password, v)
            .then(() => {
              setEmail(v);
            })
            .catch((err) => {
              setError(err);
            });
        }}
      />
    );
  }

  return <StatusMessage variant="success">Twitter credentials saved!</StatusMessage>;
}
