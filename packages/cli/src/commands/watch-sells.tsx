import { compareHashes, roundEth } from '@fta/helpers';
import { Select, Spinner } from '@inkjs/ui';
import express from 'express';
import type { Response } from 'express';
import { Newline, Static, Text } from 'ink';
import { option } from 'pastel';
import { useState, type ReactElement, useEffect, Fragment } from 'react';
import { Telegraf } from 'telegraf';
import { z } from 'zod';
import type { NetError } from '../clients/friendTech.js';
import type { TradeEventParams } from '../clients/friendTechContract.js';
import { FriendTechContract } from '../clients/friendTechContract.js';
import type { Wallet } from '../clients/keychain.js';
import { getNodeProviderUrl, getTelegramApiKey, getWallets } from '../clients/keychain.js';
import { TxLink } from '../components/TxLink.js';
import { getUser } from '../helpers/buy.js';
import { checkHowManyToSell } from '../helpers/checkHowManyToSell.js';
import { escapeMarkdown } from '../helpers/escapeMarkdown.js';
import { pluralize } from '../helpers/pluralize.js';

const PORT = 6969;
const isDev = Boolean(process.env.DEBUG);

type Log =
  | {
      type: 'printUsedWallet';
      data: { address: string };
    }
  | {
      type: 'sentSellNotification';
      data: { address: string };
    }
  | {
      type: 'sellStart';
      data: { address: string };
    }
  | {
      type: 'sellKeysNum';
      data: { keysNum: number };
    }
  | {
      type: 'soldKeys';
      data: { txHash: string };
    }
  | {
      type: 'sentSoldNotification';
      data: Record<string, unknown>;
    }
  | {
      type: 'error';
      data: { message: string };
    };

async function startServer(): Promise<void> {
  await new Promise((resolve) => {
    const app = express();

    app.get('/', (_, res: Response) => {
      res.json({ ok: true });
    });

    app.listen(PORT, () => {
      resolve(true);
    });
  });
}

async function listenToSellEvents(
  walletToWatch: string,
  telegramUserId: number | undefined,
  contract: FriendTechContract,
  bot: Telegraf,
  addLog: (log: Log) => void,
): Promise<void> {
  let allow = true;

  contract.onTrade(async (params: TradeEventParams) => {
    try {
      // Skip buys. We are only interested in sells
      if (params.isBuy) return;

      // Watch only for a specific wallet and only on production. Watch for any
      // event locally to simplify testing
      if (!isDev && !compareHashes(params.subject.toLowerCase(), walletToWatch)) return;

      const [traderHold, iOwn] = await Promise.all([
        contract.sharesBalance(params.subject, params.trader),
        contract.sharesBalance(params.trader, params.subject),
      ]);

      if (!allow) return;

      // Throttle events locally to avoid spamming
      if (isDev) {
        allow = false;

        setTimeout(() => {
          allow = true;
        }, 1000 * 30);
      }

      const iNeedToSell = checkHowManyToSell(iOwn, traderHold, params.shareAmount);

      await notifyAboutSellOfMyKeys(params, { iNeedToSell, traderHold, iOwn }, bot, telegramUserId);

      if (!iNeedToSell) return;

      addLog({
        type: 'sentSellNotification',
        data: { address: params.trader },
      });

      await sellKeys(
        iNeedToSell,
        iOwn - iNeedToSell,
        params.trader,
        telegramUserId,
        contract,
        bot,
        addLog,
      );
    } catch (err) {
      addLog({ type: 'error', data: { message: (err as Error).message } });
      console.error('ft_contract.on_trade_failed', err);
    }
  });
}

async function notifyAboutSellOfMyKeys(
  params: TradeEventParams,
  { iNeedToSell, iOwn, traderHold }: { iNeedToSell: number; iOwn: number; traderHold: number },
  bot: Telegraf,
  telegramUserId: number | undefined,
): Promise<void> {
  const { user, error } = await getUser(params.trader);

  if (error && (error as NetError)?.res?.status !== 404) {
    console.error('ft_contract.on_trade_failed', error);
  }

  const name = escapeMarkdown(user?.twitterName ?? '⚠️ Unknown user');
  const url = escapeMarkdown(`https://friend.tech/rooms/${params.trader}`);
  const price = escapeMarkdown(`${roundEth(params.ethAmount)} ETH`);
  const sellMsg = iNeedToSell
    ? `Trying to sell ${iNeedToSell} ${pluralize('key', iNeedToSell)}`
    : 'No need to sell';

  const message = `🚨 [${name}](${url}) sold *${params.shareAmount} ${pluralize(
    'key',
    params.shareAmount,
  )}* for *${price}*\\. I own ${iOwn}, trader holds ${traderHold} of my keys\\. ${sellMsg}`;

  if (telegramUserId) {
    await bot.telegram.sendMessage(telegramUserId, message, {
      parse_mode: 'MarkdownV2',
    });
  }
}

async function sellKeys(
  keysNum: number,
  ownAfterSell: number,
  address: string,
  telegramUserId: number | undefined,
  contract: FriendTechContract,
  bot: Telegraf,
  addLog: (log: Log) => void,
): Promise<void> {
  addLog({ type: 'sellKeysNum', data: { keysNum } });

  const { hash } = await contract.sellShares(address, keysNum);

  addLog({ type: 'soldKeys', data: { txHash: hash } });

  let message = `✅ Sold *${keysNum} ${pluralize('key', keysNum)}* of ${address}`;

  if (ownAfterSell) {
    message += `, you still own *${ownAfterSell} ${pluralize('key', ownAfterSell)}*`;
  } else {
    message += ', you don’t own any keys of this user anymore';
  }

  if (telegramUserId) {
    await bot.telegram.sendMessage(telegramUserId, message, {
      parse_mode: 'MarkdownV2',
    });
  }

  addLog({ type: 'sentSoldNotification', data: {} });
}

export const options = z.object({
  telegramUserId: z
    .number()
    .optional()
    .describe(
      option({
        description:
          'Telegram user id. Here’s how to get one: https://bigone.zendesk.com/hc/en-us/articles/360008014894-How-to-get-the-Telegram-user-ID',
      }),
    ),
});

interface Props {
  options: z.infer<typeof options>;
}

export default function WatchSells({ options }: Props): ReactElement {
  const [listening, setListening] = useState(false);
  const [step, setStep] = useState<'initial' | 'choseWallet' | 'ready'>('initial');
  const [logs, setLogs] = useState<Log[]>([]);
  const [nodeProviderUrl, setNodeProviderUrl] = useState<string>();
  const [wallet, setWallet] = useState<Wallet>();
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [bot, setBot] = useState<Telegraf>();
  const [error, setError] = useState<Error | null>(null);

  function addLog(log: Log): void {
    setLogs((prevLog) => [...prevLog, log]);
  }

  /**
   * Step: initial
   * Check the wallet
   */
  useEffect(() => {
    if (step !== 'initial') return;

    (async () => {
      try {
        const telegramAPiKey = await getTelegramApiKey();

        if (!telegramAPiKey) {
          throw new Error(
            'Telegram API key is not set. Please provide one by running "fta telegram set".',
          );
        }

        setBot(new Telegraf(telegramAPiKey));

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
          addLog({ type: 'printUsedWallet', data: { address: wallets[0].address } });
          setStep('ready');

          return;
        }

        setWallets(wallets);
        setStep('choseWallet');
      } catch (error) {
        setError(error as Error);
      }
    })().catch((err) => {
      console.error(err);

      process.exit(1);
    });
  }, [step]);

  /**
   * Step: ready
   * Starting the server
   */
  useEffect(() => {
    if (step !== 'ready' || !nodeProviderUrl || !wallet || !bot) return;

    (async () => {
      const contract = new FriendTechContract(nodeProviderUrl, wallet.privateKey);

      bot.start(async (ctx) => {
        if (options.telegramUserId && ctx.update.message.from.id === options.telegramUserId) {
          await ctx.reply(
            '✅ Welcome! Here you will receive notifications when your keys are sold',
          );
        } else {
          await ctx.reply('⚠️ You can’t use this bot');
        }
      });

      bot.launch().catch((err) => {
        setError(err);
      });

      // Enable graceful stop
      process.once('SIGINT', () => {
        bot.stop('SIGINT');
        process.exit(0);
      });
      process.once('SIGTERM', () => {
        bot.stop('SIGTERM');
        process.exit(0);
      });

      await listenToSellEvents(
        wallet.address.toLowerCase(),
        options.telegramUserId,
        contract,
        bot,
        addLog,
      );
      await startServer();

      setListening(true);
    })().catch((err) => {
      console.error(err);

      process.exit(1);
    });
  }, [bot, nodeProviderUrl, options.telegramUserId, step, wallet]);

  return (
    <>
      <Static items={logs}>
        {(log, index) => (
          <Fragment key={index}>
            <Text>
              <Text dimColor>{new Date().toLocaleString()}</Text> <LogItem log={log} />
            </Text>
          </Fragment>
        )}
      </Static>
      <Text>&nbsp;</Text>
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
              addLog({ type: 'printUsedWallet', data: { address: w.address } });
              setStep('ready');
            }}
          />
        </>
      ) : null}
      {error ? (
        <Text color="red">{error.message}</Text>
      ) : (
        <Spinner label={listening ? 'Watching for sell events...' : 'Starting server...'} />
      )}
    </>
  );
}

function LogItem({ log: { type, data } }: { log: Log }): ReactElement {
  switch (type) {
    case 'printUsedWallet':
      return (
        <Text>
          👛 Using wallet{' '}
          <Text bold color="yellow">
            {/* eslint-disable-next-line @typescript-eslint/ban-ts-comment */}
            {/* @ts-expect-error */}
            {data.address}
          </Text>
          <Newline />
        </Text>
      );
    case 'sentSellNotification':
      return (
        <Text>
          🔔 Sent notification about sell of{' '}
          <Text bold color="blueBright">
            {/* eslint-disable-next-line @typescript-eslint/ban-ts-comment */}
            {/* @ts-expect-error */}
            {data.address}
          </Text>
        </Text>
      );
    case 'sellStart':
      return (
        <Text>
          <Newline />
          👉 Start selling keys of{' '}
          <Text bold color="magenta">
            {/* eslint-disable-next-line @typescript-eslint/ban-ts-comment */}
            {/* @ts-expect-error */}
            {data.address}
          </Text>
        </Text>
      );
    case 'sellKeysNum':
      return (
        <Text>
          You own{' '}
          <Text bold color="yellow">
            {/* eslint-disable-next-line @typescript-eslint/ban-ts-comment */}
            {/* @ts-expect-error */}
            {data.keysNum} {pluralize('key', data.keysNum)}
          </Text>
          . Selling...
        </Text>
      );
    case 'soldKeys':
      return (
        <Text>
          {/* eslint-disable-next-line @typescript-eslint/ban-ts-comment */}
          {/* @ts-expect-error */}
          ✅ Sold. Transaction: <TxLink txHash={data.txHash} />
        </Text>
      );
    case 'sentSoldNotification':
      return <Text>🔔 Sent notification about sold keys</Text>;
    case 'error':
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-expect-error
      return <Text color={'red'}>{data.message}</Text>;
    default:
      return <Text>Unknown log type {type}</Text>;
  }
}
