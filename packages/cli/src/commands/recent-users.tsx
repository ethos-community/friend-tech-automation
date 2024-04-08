import { Spinner, StatusMessage } from '@inkjs/ui';
import { formatEther } from 'ethers';
import { Static, Text } from 'ink';
import { option } from 'pastel';
import type { ReactElement } from 'react';
import { Fragment, useEffect, useState } from 'react';
import { z } from 'zod';
import { FriendTech } from '../clients/friendTech.js';
import { removeDoubleQuotes } from '../helpers/removeQuotes.js';
import { saveToCsv } from '../helpers/saveToCsv.js';

export const options = z.object({
  outDir: z.string().describe(option({ description: 'Output directory for CSV file', alias: 'o' })),
  maxPrice: z.number().describe(option({ description: 'Max key price in ETH', alias: 'p' })),
});

interface Props {
  options: z.infer<typeof options>;
}

const ftApi = new FriendTech();

type Log = 'init' | 'showFetchedUsers';

export default function RecentUsers({ options }: Props): ReactElement {
  const [logs, setLogs] = useState<Log[]>(['init']);
  const [step, setStep] = useState<'init' | 'done'>('init');
  const [usersNum, setUsersNum] = useState<number>();
  const [filteredUsersNum, setFilteredUsersNum] = useState<number>();
  const [filePath, setFilePath] = useState<string>();
  const [error, setError] = useState<Error | null>(null);

  function addLog(log: Log): void {
    setLogs((prevLog) => [...prevLog, log]);
  }

  useEffect(() => {
    if (step !== 'init') return;

    (async () => {
      const [recentUsers, onlineUsers] = await Promise.all([
        ftApi.recentMessagers(),
        ftApi.onlineUsers(),
      ]);

      const users = new Map<
        string,
        {
          twitterUsername: string;
          twitterName: string;
          keyPriceInEth: number;
        }
      >();

      for (const user of [...recentUsers, ...onlineUsers]) {
        users.set(user.address, {
          twitterUsername: user.twitterUsername,
          twitterName: user.twitterName,
          keyPriceInEth: Number(formatEther(String(user.ethDisplayPrice))),
        });
      }

      setUsersNum(users.size);
      addLog('showFetchedUsers');

      const csvData = ['address,quantity,price,twitterUsername,twitterName'];

      for (const [address, user] of users) {
        if (user.keyPriceInEth <= options.maxPrice) {
          csvData.push(
            `${address},1,${user.keyPriceInEth},${user.twitterUsername},"${removeDoubleQuotes(
              user.twitterName,
            )}"`,
          );
        }
      }

      // Remove header
      setFilteredUsersNum(csvData.length - 1);

      const fPath = saveToCsv(csvData, options.outDir, `recent-users`);

      setFilePath(fPath);
      setStep('done');
    })().catch((err) => {
      setError(err);
    });
  }, [options.maxPrice, options.outDir, step]);

  return (
    <>
      {logs.length > 0 ? (
        <Static items={logs}>
          {(log, index) => (
            <Fragment key={index}>
              <LogItem log={log} usersNum={usersNum} />
              <Text>&nbsp;</Text>
            </Fragment>
          )}
        </Static>
      ) : null}
      {error ? (
        <Text color="red">{error.message}</Text>
      ) : (
        <>
          {step === 'init' ? <Spinner label="🔍 Retrieving recent users..." /> : null}
          {step === 'done' ? (
            <>
              <Text>
                👥 {filteredUsersNum} recent users have a key price below {options.maxPrice} ETH
                {'\n'}
              </Text>
              <StatusMessage variant="success">
                Successfully saved CSV at <Text color="magenta">{filePath}</Text>
              </StatusMessage>
            </>
          ) : null}
        </>
      )}
    </>
  );
}

function LogItem({ log, usersNum }: { log: Log; usersNum: number | undefined }): ReactElement {
  switch (log) {
    case 'init':
      return <Text>This command retrieves the recent friend.tech users</Text>;
    case 'showFetchedUsers':
      return <Text>🔍 Found {usersNum} unique recent user on friend.tech</Text>;
    default:
      return <Text>Unknown log {log}</Text>;
  }
}
