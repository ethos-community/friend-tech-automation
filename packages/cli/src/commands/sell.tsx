import { readFileSync } from 'node:fs';
import { roundEth } from '@fta/helpers';
import { ConfirmInput, Select, Spinner, StatusMessage, UnorderedList } from '@inkjs/ui';
import { parse } from 'csv-parse/sync';
import { Newline, Static, Text, useStderr } from 'ink';
import Link from 'ink-link';
import { argument, option } from 'pastel';
import { useState, type ReactElement, useEffect, Fragment } from 'react';
import { z } from 'zod';
import { FriendTechContract } from '../clients/friendTechContract.js';
import type { Wallet } from '../clients/keychain.js';
import { getNodeProviderUrl, getWallets } from '../clients/keychain.js';
import { TxLink } from '../components/TxLink.js';
import { WalletText } from '../components/WalletText.js';
import type { FormattedUser } from '../helpers/buy.js';
import { getSharesBalance, getUser, waitForTransaction } from '../helpers/buy.js';
import { wait } from '../helpers/delay.js';
import { pluralize } from '../helpers/pluralize.js';
import { shuffle } from '../helpers/shuffle.js';

export const args = z.tuple([
  z.string().describe(
    argument({
      name: 'csvFilePath',
      description: 'Path to the CSV file containing the sell orders',
    }),
  ),
]);

export const options = z.object({
  delay: z
    .number()
    .optional()
    .default(15)
    .describe(option({ description: 'Delay between orders in seconds' })),
  shuffle: z
    .boolean()
    .optional()
    .default(true)
    .describe(option({ description: 'Shuffle sell orders' })),
});

interface Props {
  args: z.infer<typeof args>;
  options: z.infer<typeof options>;
}

type Log =
  | 'printUsedWallet'
  | 'parsedCsv'
  | 'printOrders'
  | 'startSelling'
  | 'orderInit'
  | 'orderSkip'
  | 'orderPrintUser'
  | 'orderPrintTx'
  | 'orderSuccess'
  | 'orderError';

interface SellOrder {
  address: string;
  quantity: number;
  index: number;
  currentlyOwns?: number;
  user?: FormattedUser;
  txHash?: string;
  error?: Error;
  txStatus?: number | null;
}

export default function Sell({ args: [csvPath], options }: Props): ReactElement {
  const { write } = useStderr();

  const [step, setStep] = useState<
    | 'initial'
    | 'choseWallet'
    | 'parseCsv'
    | 'prepareOrders'
    | 'askForConfirmation'
    | 'selling'
    | 'finish'
  >('initial');
  const [logs, setLogs] = useState<Log[]>([]);
  const [nodeProviderUrl, setNodeProviderUrl] = useState<string>();
  const [wallet, setWallet] = useState<Wallet>();
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [contract, setContract] = useState<FriendTechContract>();
  const [orders, setOrders] = useState<SellOrder[]>([]);
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
          setStep('parseCsv');

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
   * Step: parseCsv
   * Parse and validate CSV file
   */
  useEffect(() => {
    if (step !== 'parseCsv' || !nodeProviderUrl || !wallet) return;

    try {
      setContract(new FriendTechContract(nodeProviderUrl, wallet.privateKey));

      const content = readFileSync(csvPath, 'utf-8');
      const data = parse(content, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
      });

      if (!data.length) {
        throw new Error(`CSV file ${csvPath} is empty`);
      }

      const columns = Object.keys(data[0]);

      if (!columns.includes('address')) {
        throw new Error(`CSV file ${csvPath} does not contain an "address" column`);
      }

      const { duplicatedOrders, orders } = formatData(
        (options.shuffle ? shuffle(data) : data) as SellOrder[],
      );

      if (duplicatedOrders.length) {
        throw new Error(
          `CSV file ${csvPath} contains duplicated addresses:\n${duplicatedOrders.join('\n')}`,
        );
      }

      setOrders(orders);

      addLog('parsedCsv');

      setStep('prepareOrders');
    } catch (error) {
      setError(error as Error);
    }
  }, [csvPath, nodeProviderUrl, options.shuffle, step, wallet]);

  /**
   * Step: prepareOrders
   * Get keys of the current user, check how many keys the user owns
   */
  useEffect(() => {
    if (
      step !== 'prepareOrders' ||
      !wallet ||
      !contract ||
      // This step has already been run
      orders.some((o) => Object.hasOwn(o, 'currentlyOwns'))
    ) {
      return;
    }

    async function prepareOrders(): Promise<void> {
      if (!wallet || !contract) return;

      const updatedOrders = await Promise.all(
        orders.map(async (o) => {
          try {
            o.currentlyOwns = await getSharesBalance(contract, o.address, wallet.address);

            const { user, error } = await getUser(o.address);

            if (error || !user) {
              write(`Failed to get user for address "${o.address}": ${(error as Error)?.message}`);

              return o;
            }

            o.user = user;

            return o;
          } catch (err) {
            write(`Failed to get user for address "${o.address}": ${(err as Error).message}`);

            return o;
          }
        }),
      );

      setOrders(updatedOrders);
      addLog('printOrders');
      setStep('askForConfirmation');
    }

    prepareOrders().catch((error) => {
      setError(error);
    });
  }, [contract, orders, step, wallet, write]);

  /**
   * Step: selling
   * Iterate over orders and try to sell each
   */
  useEffect(() => {
    if (step !== 'selling') return;

    async function startSells(): Promise<void> {
      if (step !== 'selling' || !contract) return;

      await wait(2);

      for (const order of orders) {
        setCurrentOrder(order);
        addLog('orderInit');

        if (shouldSkip(order)) {
          addLog('orderSkip');

          continue;
        }

        addLog('orderPrintUser');

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
    }

    startSells().catch((error) => {
      setError(error);
    });
  }, [contract, options.delay, orders, step]);

  return (
    <>
      {logs.length > 0 ? (
        <Static items={logs}>
          {(log, index) => (
            <Fragment key={index}>
              <LogItem
                log={log}
                wallet={wallet}
                csvPath={csvPath}
                orders={orders}
                currentOrder={currentOrder}
                // options={options}
              />
              <Newline />
            </Fragment>
          )}
        </Static>
      ) : null}
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
              setStep('parseCsv');
            }}
          />
        </>
      ) : null}
      {step === 'askForConfirmation' ? (
        <>
          <Text>Are you sure you want to continue? This will start automated buys.</Text>
          <StatusMessage variant="info">Press Cmd+C any time to cancel operation</StatusMessage>
          <Newline />
          <ConfirmInput
            onConfirm={() => {
              addLog('startSelling');
              setStep('selling');
            }}
            onCancel={() => {
              setError(new Error('Ok, bye 👋'));
            }}
          />
        </>
      ) : null}
      {step === 'selling' ? <Spinner label="Selling..." /> : null}
      {step === 'finish' ? (
        <StatusMessage variant="success">🎉 Processed {orders.length} addresses</StatusMessage>
      ) : null}
      {error ? <Text color="red">{error.message}</Text> : null}
    </>
  );
}

function LogItem({
  log,
  wallet,
  csvPath,
  orders,
  currentOrder,
}: {
  log: Log;
  wallet: Wallet | undefined;
  csvPath: string;
  orders: SellOrder[];
  currentOrder: SellOrder | undefined;
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
    case 'parsedCsv':
      return (
        <>
          <StatusMessage variant="success">Parsed CSV file {csvPath}.</StatusMessage>
          <Text>
            Identified <Text color="blue">{orders.length}</Text> addresses
          </Text>
        </>
      );
    case 'printOrders': {
      let numKeys = 0;
      let totalPrice = 0;

      for (const order of orders) {
        if (!shouldSkip(order)) {
          numKeys += order.quantity;
          totalPrice += (order.user?.keyPriceInEth ?? 0) * order.quantity;
        }
      }

      return (
        <>
          <Text bold>🛍️ &nbsp;Orders:</Text>
          <UnorderedList>
            {orders.map((o) => (
              <UnorderedList.Item key={o.address}>
                <Text dimColor={shouldSkip(o)}>
                  Sell{' '}
                  <Text color="yellow">
                    {o.quantity} out of {o.currentlyOwns} {pluralize('key', o.quantity)}
                  </Text>{' '}
                  ({o.user?.keyPriceInEth ? roundEth(o.user.keyPriceInEth) : '???'} ETH/key) of{' '}
                  <Text color="magenta">
                    <Link url={`https://friend.tech/rooms/${o.address}`}>
                      {o.user?.twitterName ?? o.address}
                    </Link>
                  </Text>
                  {shouldSkip(o) ? ` (not enough keys owned)` : ''}
                </Text>
              </UnorderedList.Item>
            ))}
          </UnorderedList>
          <Newline />
          <Text bold color="cyanBright">
            Total: {numKeys} keys for {roundEth(totalPrice)} ETH
          </Text>
        </>
      );
    }
    case 'startSelling':
      return <Text>🤙 Let's dump those keys</Text>;
    case 'orderInit':
      return currentOrder ? (
        <Text>
          {currentOrder.index + 1}/{orders.length}. Selling{' '}
          <Text color="yellow">
            {currentOrder.quantity} {pluralize('key', currentOrder.quantity)}
          </Text>{' '}
          from address{' '}
          <Text color="magenta">
            <Link url={`https://friend.tech/rooms/${currentOrder.address}`}>
              {currentOrder.address}
            </Link>
          </Text>
        </Text>
      ) : (
        <Text color="redBright">No current order</Text>
      );
    case 'orderSkip':
      return currentOrder && shouldSkip(currentOrder) ? (
        <Text>⏩ Skip (not enough keys owned)</Text>
      ) : (
        <Text color="redBright">No current order</Text>
      );
    case 'orderPrintUser':
      return currentOrder?.user ? (
        <Text>
          User: <Text color="cyan">{currentOrder.user.twitterName}</Text>, Key price:{' '}
          <Text color="yellow">{roundEth(currentOrder.user.keyPriceInEth)} ETH</Text>, Total:{' '}
          <Text color="green">
            {roundEth(currentOrder.user.keyPriceInEth * currentOrder.quantity)} ETH
          </Text>
        </Text>
      ) : (
        <Text color="redBright">No current user on order</Text>
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

function formatData(data: SellOrder[]): {
  duplicatedOrders: string[];
  orders: SellOrder[];
} {
  const ordersMap = new Map<string, number>();

  const formattedOrders = data.map((order, index) => {
    const saved = ordersMap.get(order.address);

    if (!saved) {
      ordersMap.set(order.address, 1);
    } else {
      ordersMap.set(order.address, saved + 1);
    }

    return {
      address: order.address,
      quantity: Number(order.quantity) || 1,
      index,
    };
  });

  const duplicatedOrders = [];

  for (const [address, n] of ordersMap.entries()) {
    if (n > 1) {
      duplicatedOrders.push(address);
    }
  }

  return {
    duplicatedOrders,
    orders: formattedOrders,
  };
}

function shouldSkip(order: SellOrder): boolean {
  return order.currentlyOwns === undefined || order.quantity > order.currentlyOwns;
}
