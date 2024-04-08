import { Select, Spinner, StatusMessage } from '@inkjs/ui';
import { Static, Text } from 'ink';
import { option } from 'pastel';
import { useState, type ReactElement, useEffect, Fragment } from 'react';
import { z } from 'zod';
import { FriendTechContract } from '../clients/friendTechContract.js';
import { getNodeProviderUrl, getWallets, type Wallet } from '../clients/keychain.js';
import { WalletText } from '../components/WalletText.js';
import type { FormattedUser } from '../helpers/buy.js';
import { getUser, getUserTokenHoldings } from '../helpers/buy.js';
import { chunk } from '../helpers/chunk.js';
import { removeDoubleQuotes } from '../helpers/removeQuotes.js';
import { saveToCsv } from '../helpers/saveToCsv.js';

export const options = z.object({
  outDir: z.string().describe(option({ description: 'Output directory for CSV file', alias: 'o' })),
  inactiveDays: z
    .number()
    .describe(option({ description: 'Days the user has been inactive', alias: 'd' })),
});

interface Props {
  options: z.infer<typeof options>;
}

type Log = 'init' | 'printUsedWallet';

export default function ListKeys({ options }: Props): ReactElement {
  const [step, setStep] = useState<'initial' | 'choseWallet' | 'getInactiveUsers' | 'done'>(
    'initial',
  );
  const [logs, setLogs] = useState<Log[]>(['init']);
  const [nodeProviderUrl, setNodeProviderUrl] = useState<string>();
  const [wallet, setWallet] = useState<Wallet>();
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [filteredUsersNum, setFilteredUsersNum] = useState<number>();
  const [filePath, setFilePath] = useState<string>();
  const [error, setError] = useState<Error | null>(null);

  function addLog(log: Log): void {
    setLogs((prevLog) => [...prevLog, log]);
  }

  /**
   * Step: initial
   * Verify that there is at least one wallet
   */
  useEffect(() => {
    if (step !== 'initial') return;

    async function init(): Promise<void> {
      try {
        const url = await getNodeProviderUrl();

        if (!url) {
          throw new Error(
            'Node provider URL is not set. Please provide one by running "fta provider set".',
          );
        }

        setNodeProviderUrl(url);

        const wallets = await getWallets();

        if (!wallets.length) {
          throw new Error('No wallets found. To add one run "fta wallets add --name <name>"');
        }

        if (wallets.length === 1) {
          setWallet(wallets[0]);
          addLog('printUsedWallet');
          setStep('getInactiveUsers');

          return;
        }

        setWallets(wallets);
        setStep('choseWallet');
      } catch (error) {
        setError(error as Error);
      }
    }

    init().catch((err) => {
      setError(err);
    });
  }, [step]);

  /**
   * Step: getInactiveUsers
   * Get inactive users
   */
  useEffect(() => {
    if (step !== 'getInactiveUsers' || !wallet || !nodeProviderUrl) return;

    (async () => {
      try {
        const contract = new FriendTechContract(nodeProviderUrl, wallet.privateKey);
        const inactiveTs = Date.now() - options.inactiveDays * 24 * 60 * 60 * 1000;

        const users = await getUserTokenHoldings(wallet.address);

        const inactiveUsers: Array<FormattedUser & { address: string }> = [];

        const detailedUsers = (
          await Promise.all(
            chunk(Array.from(users.keys()), 25).map(
              async (c) => await Promise.all(c.map(async (address) => await getUser(address))),
            ),
          )
        ).flat();

        for (const { user } of detailedUsers) {
          if (user && user.lastOnline > 0 && user.lastOnline < inactiveTs) {
            inactiveUsers.push({ ...user, address: user.address });
          }
        }

        const sortedInactiveUsers = inactiveUsers
          .map((u) => ({ ...u, ts: relativeTime(u.lastOnline - Date.now()) }))
          .sort((a, b) => a.lastOnline - b.lastOnline);

        const csvData = ['address,quantity,price,twitterUsername,twitterName,ts,lastOnline'];

        for (const user of sortedInactiveUsers) {
          const ownKeys = await contract.sharesBalance(user.address, wallet.address);

          csvData.push(
            `${user.address},${ownKeys},${user.keyPriceInEth},${
              user.twitterUsername
            },"${removeDoubleQuotes(user.twitterName)}",${user.lastOnline},${relativeTime(
              user.lastOnline - Date.now(),
            )}`,
          );
        }

        // Remove header
        setFilteredUsersNum(csvData.length - 1);

        const fPath = saveToCsv(csvData, options.outDir, `inactive-users`);

        setFilePath(fPath);
        setStep('done');
      } catch (err) {
        setError(err as Error);
      }
    })().catch((err) => {
      setError(err);
    });
  }, [nodeProviderUrl, options.inactiveDays, options.outDir, step, wallet]);

  return (
    <>
      {logs.length > 0 ? (
        <Static items={logs}>
          {(log, index) => (
            <Fragment key={index}>
              <LogItem log={log} options={options} wallet={wallet} />
              <Text>&nbsp;</Text>
            </Fragment>
          )}
        </Static>
      ) : null}
      {error ? (
        <Text color="red">{error.message}</Text>
      ) : (
        <>
          {step === 'initial' ? <Spinner label="🔍 Retrieving inactive users..." /> : null}
          {step === 'choseWallet' && wallets.length > 1 ? (
            <>
              <Text>Select wallet:</Text>
              <Select
                options={wallets.map((w) => ({
                  label: `${w.name} (${w.address})`,
                  value: w.address,
                }))}
                onChange={(value) => {
                  const w = wallets.find((w) => w.address === value);

                  if (!w) return;

                  setWallet(w);
                  addLog('printUsedWallet');
                  setStep('getInactiveUsers');
                }}
              />
            </>
          ) : null}
          {step === 'getInactiveUsers' ? <Spinner label="🔍 Retrieving inactive users..." /> : null}
          {step === 'done' ? (
            <>
              <Text>
                👥 Found {filteredUsersNum} inactive users that have not logged in for at least{' '}
                {options.inactiveDays} days
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

function LogItem({
  log,
  options,
  wallet,
}: {
  log: Log;
  options: Props['options'];
  wallet: Wallet | undefined;
}): ReactElement {
  switch (log) {
    case 'init':
      return (
        <Text>
          This command retrieves the list of friend.tech users the keys I own who were not active
          for the last {options.inactiveDays} days
        </Text>
      );
    case 'printUsedWallet':
      return wallet ? (
        <Text>
          Using wallet <WalletText {...wallet} />
        </Text>
      ) : (
        <Text color="redBright">No wallet selected</Text>
      );
    default:
      return <Text>Unknown log {log}</Text>;
  }
}

const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ['day', 86400000],
  ['hour', 3600000],
  ['minute', 60000],
  ['second', 1000],
];

const rtf = new Intl.RelativeTimeFormat('en', { style: 'long' });

function relativeTime(elapsed: number): string | undefined {
  for (const [unit, amount] of units) {
    if (Math.abs(elapsed) > amount || unit === 'second') {
      return rtf.format(Math.round(elapsed / amount), unit);
    }
  }

  return undefined;
}
