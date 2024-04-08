import { Spinner, StatusMessage } from '@inkjs/ui';
import type { Tweet } from '@the-convocation/twitter-scraper';
import { Scraper } from '@the-convocation/twitter-scraper';
import { Newline, Static, Text } from 'ink';
import { argument, option } from 'pastel';
import type { ReactElement } from 'react';
import { Fragment, useEffect, useState } from 'react';
import { z } from 'zod';
import type { NetError } from '../../clients/friendTech.js';
import { FriendTech } from '../../clients/friendTech.js';
import { getFtToken, getTwitterCredentials } from '../../clients/keychain.js';
import { chunk } from '../../helpers/chunk.js';
import { wait } from '../../helpers/delay.js';
import { removeDoubleQuotes } from '../../helpers/removeQuotes.js';
import { saveToCsv } from '../../helpers/saveToCsv.js';

const scrapper = new Scraper();

export const args = z.tuple([
  z.string().describe(
    argument({
      name: 'url',
      description: 'Tweet URL',
    }),
  ),
]);

export const options = z.object({
  outDir: z.string().describe(option({ description: 'Output directory for CSV file', alias: 'o' })),
});

interface Props {
  args: z.infer<typeof args>;
  options: z.infer<typeof options>;
}

type Log = 'showTweet' | 'showReplies' | 'showMatchedUsers';

export default function Get({ args: [url], options }: Props): ReactElement {
  const [logs, setLogs] = useState<Log[]>([]);
  const [step, setStep] = useState<
    'initial' | 'fetchingTweet' | 'fetchingReplies' | 'matchingFTAccounts' | 'savingData' | 'done'
  >('initial');
  const [tweet, setTweet] = useState<Tweet>();
  const [twUserIdsNum, setTwUserIdsNum] = useState<number>();
  const [matchedUsersNum, setMatchedUsersNum] = useState<number>();
  const [filePath, setFilePath] = useState<string>();
  const [error, setError] = useState<Error>();

  function addLog(log: Log): void {
    setLogs((prevLog) => [...prevLog, log]);
  }

  useEffect(() => {
    if (step !== 'initial') return;

    async function checkCredentials(): Promise<void> {
      try {
        const creds = await getTwitterCredentials();
        const ftToken = await getFtToken();

        if (!creds?.email || !creds.username || !creds.password) {
          throw new Error('Missing Twitter credentials. Run "fta twitter set" to set credentials');
        }

        if (!ftToken) {
          throw new Error('Missing friend.tech token. Run "fta token set" to set the token');
        }

        setStep('fetchingTweet');

        const { pathname } = new URL(url);
        const tweetId = pathname.split('/').at(-1);

        if (!tweetId) {
          throw new Error('Invalid tweet URL');
        }

        const t = await scrapper.getTweet(tweetId);

        if (!t?.conversationId) {
          throw new Error('Tweet not found');
        }

        setTweet(t);
        addLog('showTweet');
        setStep('fetchingReplies');

        await scrapper.login(creds.username, creds.password, creds.email);
        const iterator = scrapper.searchTweets(`conversation_id:${t.conversationId}`, Infinity);

        const userIds = new Map<string, string>();

        for await (const reply of iterator) {
          if (!reply.username || !reply.userId) {
            continue;
          }

          userIds.set(reply.username, reply.userId);
        }

        setTwUserIdsNum(userIds.size);
        addLog('showReplies');
        setStep('matchingFTAccounts');

        const matchedUsers = new Map<string, { twitterUsername: string; twitterName: string }>();
        const ftApi = new FriendTech(ftToken);
        const chunks = chunk(Array.from(userIds.entries()), 10);

        for (const c of chunks) {
          const result = await Promise.all(
            c.map(async ([twUsername, twUserId]) => {
              try {
                return await ftApi.searchUser(twUsername, twUserId);
              } catch (err) {
                if ((err as NetError)?.res?.status !== 404) {
                  console.error((err as NetError).message);
                }

                return undefined;
              }
            }),
          );

          for (const u of result) {
            if (!u) continue;

            matchedUsers.set(u.address, {
              twitterUsername: u.twitterUsername,
              twitterName: u.twitterName,
            });
          }

          await wait(5);
        }

        setMatchedUsersNum(matchedUsers.size);
        addLog('showMatchedUsers');
        setStep('savingData');

        const csvData = ['address,quantity,twitterUsername,twitterName'];

        for (const [address, { twitterUsername, twitterName }] of matchedUsers) {
          csvData.push(`${address},1,${twitterUsername},"${removeDoubleQuotes(twitterName)}"`);
        }

        const fPath = saveToCsv(csvData, options.outDir, `tweet-${tweetId}`);

        setFilePath(fPath);
        setStep('done');
      } catch (err) {
        setError(err as Error);
      }
    }

    checkCredentials().catch((err) => {
      setError(err);
    });
  }, [options.outDir, step, url]);

  return (
    <>
      {logs.length > 0 ? (
        <Static items={logs}>
          {(log, index) => (
            <Fragment key={index}>
              <LogItem
                log={log}
                tweet={tweet}
                twUserIdsNum={twUserIdsNum}
                matchedUsersNum={matchedUsersNum}
              />
              <Newline />
            </Fragment>
          )}
        </Static>
      ) : null}
      {step === 'fetchingTweet' && !error ? <Spinner label="🐦 Retrieving tweet..." /> : null}
      {step === 'fetchingReplies' && !error ? <Spinner label="🔍 Retrieving replies..." /> : null}
      {step === 'matchingFTAccounts' && !error ? (
        <Spinner label="🕵️ &nbsp;Matching Twitter and friend.tech accounts..." />
      ) : null}
      {step === 'savingData' && !error ? <Spinner label="💾 Saving data in CSV..." /> : null}
      {step === 'done' && !error ? (
        <StatusMessage variant="success">
          Successfully saved CSV at <Text color="magenta">{filePath}</Text>
        </StatusMessage>
      ) : null}
      {error ? <Text color="red">{error.message}</Text> : null}
    </>
  );
}

function LogItem({
  log,
  tweet,
  twUserIdsNum,
  matchedUsersNum,
}: {
  log: Log;
  tweet: Tweet | undefined;
  twUserIdsNum: number | undefined;
  matchedUsersNum: number | undefined;
}): ReactElement {
  switch (log) {
    case 'showTweet':
      return tweet ? (
        <Text>
          Tweet from{' '}
          <Text bold color="magenta">
            {tweet.name}
          </Text>
          <Newline />
          <Newline />
          =========================
          <Newline />
          <Text>{tweet.text}</Text>
          <Newline />
          =========================
        </Text>
      ) : (
        <Text color="redBright">No tweet</Text>
      );
    case 'showReplies':
      return <Text>🔍 Found {twUserIdsNum} unique users in replies</Text>;
    case 'showMatchedUsers':
      return <Text>🔍 Matched {matchedUsersNum} Twitter user in friend.tech</Text>;
    default:
      return <Text>Unknown {log}</Text>;
  }
}
