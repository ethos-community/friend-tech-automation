import { ConfirmInput, ProgressBar, Select, Spinner, StatusMessage, TextInput } from '@inkjs/ui';
import { Newline, Static, Text } from 'ink';
import Link from 'ink-link';
import { option } from 'pastel';
import { useState, type ReactElement, useEffect, Fragment } from 'react';
import { z } from 'zod';
import { FriendTechContract } from '../clients/friendTechContract.js';
import type { Wallet } from '../clients/keychain.js';
import { getNodeProviderUrl, getWallets } from '../clients/keychain.js';
import { TxLink } from '../components/TxLink.js';
import { WalletText } from '../components/WalletText.js';
import type { UserTokenHoldings } from '../helpers/buy.js';
import { getUserTokenHoldings, waitForTransaction } from '../helpers/buy.js';
import { wait } from '../helpers/delay.js';
import { pluralize } from '../helpers/pluralize.js';

export const options = z.object({
  delay: z
    .number()
    .optional()
    .default(1)
    .describe(option({ description: 'Delay between orders in seconds' })),
});

interface Props {
  options: z.infer<typeof options>;
}

type Log = 'printUsedWallet' | 'orderInit' | 'orderPrintTx' | 'orderSuccess' | 'orderError';

interface SellOrder {
  address: string;
  quantity: number;
  index: number;
  twitterName: string;
  txHash?: string;
  txStatus?: number | null;
  error?: Error;
}

export default function Nuke({ options }: Props): ReactElement {
  const [step, setStep] = useState<
    | 'initial'
    | 'choseWallet'
    | 'askForConfirmation'
    | 'preparingKeys'
    | 'finalConfirmation'
    | 'sellingKeys'
    | 'finish'
  >('initial');
  const [logs, setLogs] = useState<Log[]>([]);
  const [nodeProviderUrl, setNodeProviderUrl] = useState<string>();
  const [wallet, setWallet] = useState<Wallet>();
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [confirmation, setConfirmation] = useState<number>(0);
  const [users, setUsers] = useState<Map<string, UserTokenHoldings>>(new Map());
  const [progress, setProgress] = useState<number>(0);
  const [currentOrder, setCurrentOrder] = useState<SellOrder>();
  const [error, setError] = useState<Error | null>(null);

  function addLog(log: Log): void {
    setLogs((prevLog) => [...prevLog, log]);
  }

  /**
   * Step: initial
   * Verify that node provider URL is set and there is at least one wallet
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
          setStep('askForConfirmation');

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
   * Step: preparingKeys
   * Get the list of the keys the current wallet owns
   */
  useEffect(() => {
    if (step !== 'preparingKeys' || !wallet) return;

    (async () => {
      try {
        const result = await getUserTokenHoldings(wallet.address);

        setUsers(result);
        setStep('finalConfirmation');
      } catch (err) {
        setError(err as Error);
      }
    })().catch((err) => {
      setError(err);
    });
  }, [step, wallet]);

  /**
   * Step: sellingKeys
   * Sell the keys
   */
  useEffect(() => {
    if (step !== 'sellingKeys' || !nodeProviderUrl || !wallet) return;

    (async () => {
      const contract = new FriendTechContract(nodeProviderUrl, wallet.privateKey);
      const orders: SellOrder[] = Array.from(users.entries()).map(
        ([address, { balance, twitterName }], index) => ({
          address,
          quantity: balance,
          twitterName,
          index: index + 1,
        }),
      );

      for (const order of orders) {
        setProgress(order.index);

        setCurrentOrder(order);
        addLog('orderInit');

        let txHash: string | undefined;

        try {
          const { hash } = await contract.sellShares(order.address, order.quantity);
          txHash = hash;

          setCurrentOrder({ ...order, txHash });
          addLog('orderPrintTx');

          const tx = await waitForTransaction(contract, txHash);

          setCurrentOrder({ ...order, txStatus: tx?.status ?? null });
          addLog('orderSuccess');
        } catch (error) {
          const data: Partial<SellOrder> = { error: error as Error };

          if (txHash) {
            data.txHash = txHash;
          }
          setCurrentOrder({ ...order, ...data });

          addLog('orderError');

          continue;
        } finally {
          // Do not wait after the final order
          if (order.index !== orders.length - 1) {
            await wait(options.delay);
          }
        }
      }

      setStep('finish');
    })().catch((err) => {
      setError(err);
    });
  }, [nodeProviderUrl, options.delay, step, users, wallet]);

  return (
    <>
      {logs.length > 0 ? (
        <Static items={logs}>
          {(log, index) => (
            <Fragment key={index}>
              <LogItem
                log={log}
                wallet={wallet}
                currentOrder={currentOrder}
                totalOrders={users.size}
              />
              <Newline />
            </Fragment>
          )}
        </Static>
      ) : null}
      {error ? (
        <Text color="red">{error.message}</Text>
      ) : (
        <>
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
                  setStep('askForConfirmation');
                }}
              />
            </>
          ) : null}
          {step === 'askForConfirmation' && confirmation < 2 ? (
            <>
              <StatusMessage variant="warning">
                {confirmation === 0
                  ? '⚠️  Are you sure you want to proceed? This will sell all the keys you own!'
                  : '‼️  No, for real.\nThis will sell ALL THE KEYS YOU OWN!\nAre you ABSOLUTELY sure?'}
              </StatusMessage>
              <ConfirmInput
                onConfirm={() => {
                  setConfirmation(confirmation + 1);
                }}
                onCancel={() => {
                  setError(new Error('😅 Phew! That was close!'));
                }}
              />
            </>
          ) : null}
          {step === 'askForConfirmation' && confirmation === 2 ? (
            <TextInput
              placeholder="  👉 Enter the wallet address from which you are trying to sell all keys"
              onSubmit={(value) => {
                if (!wallet || value !== wallet.address) {
                  setError(new Error('Wrong wallet address'));

                  return;
                }

                setStep('preparingKeys');
              }}
            />
          ) : null}
          {step === 'preparingKeys' ? <Spinner label="Loading your keys..." /> : null}
          {step === 'finalConfirmation' ? (
            <>
              <StatusMessage variant="warning">
                Ok, this is for real now. After you confirm this, I'll start selling all of your
                keys.{'\n'}You are about to sell{' '}
                <Text bold color="magenta">
                  {countKeys(users)} keys of {users.size} users
                </Text>
                .{'\n'}
                <Text bold>Do you want to continue?</Text>
              </StatusMessage>
              <StatusMessage variant="info">
                Press Cmd+C any time to cancel operation. It won't revert already sent transactions
                though.
              </StatusMessage>
              <ConfirmInput
                onConfirm={() => {
                  setStep('sellingKeys');
                }}
                onCancel={() => {
                  setError(new Error('😅 Phew! That was close!'));
                }}
              />
            </>
          ) : null}
          {step === 'sellingKeys' ? (
            <>
              <Text bold color="yellow">
                Processed {Math.round((progress / users.size) * 100)}% of users
              </Text>
              <ProgressBar value={Math.round((progress / users.size) * 100)} />
            </>
          ) : null}
          {step === 'finish' ? (
            <StatusMessage variant="success">
              🎉 Processed {users.size || 0} addresses
            </StatusMessage>
          ) : null}
        </>
      )}
    </>
  );
}

function LogItem({
  log,
  wallet,
  currentOrder,
  totalOrders,
}: {
  log: Log;
  wallet: Wallet | undefined;
  currentOrder: SellOrder | undefined;
  totalOrders: number;
}): ReactElement {
  switch (log) {
    case 'printUsedWallet':
      return wallet ? (
        <Text>
          Using wallet <WalletText {...wallet} />
        </Text>
      ) : (
        <Text color="redBright">No wallet selected</Text>
      );
    case 'orderInit':
      return currentOrder ? (
        <Text>
          {currentOrder.index}/{totalOrders}. Selling{' '}
          <Text color="yellow">
            {currentOrder.quantity} {pluralize('key', currentOrder.quantity)}
          </Text>{' '}
          from address{' '}
          <Text color="magenta">
            <Link url={`https://friend.tech/rooms/${currentOrder.address}`}>
              {currentOrder.address}
            </Link>
          </Text>{' '}
          ({currentOrder.twitterName})
        </Text>
      ) : (
        <Text color="redBright">No current order</Text>
      );
    case 'orderPrintTx':
      return currentOrder?.txHash ? (
        <Text>
          Created transaction <TxLink txHash={currentOrder.txHash} />
        </Text>
      ) : (
        <Text color="redBright">No transaction</Text>
      );
    case 'orderSuccess':
      return currentOrder ? (
        <>
          {currentOrder.txStatus === 1 ? (
            <StatusMessage variant="success">
              Successfully bought{' '}
              <Text color="yellow">
                {currentOrder.quantity} {pluralize('key', currentOrder.quantity)}
              </Text>
              .
            </StatusMessage>
          ) : (
            <StatusMessage variant="warning">Transaction reverted</StatusMessage>
          )}
          <Newline />
        </>
      ) : (
        <Text color="redBright">No current order</Text>
      );
    case 'orderError':
      return (
        <>
          <Text color="red">❌ {currentOrder?.error?.message ?? 'Unknown error'}</Text>
          {currentOrder?.txHash ? (
            <Text>
              Transaction: <TxLink txHash={currentOrder.txHash} />
            </Text>
          ) : null}
        </>
      );
    default:
      return <Text color="redBright">⚠️ Unknown step!</Text>;
  }
}

function countKeys(users: Map<string, UserTokenHoldings>): number {
  let keys = 0;

  for (const { balance } of users.values()) {
    keys += balance;
  }

  return keys;
}
