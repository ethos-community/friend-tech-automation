import { appendFileSync, writeFileSync } from 'node:fs';
import {
  friendTechContractAbi,
  FRIEND_TECH_BASE_CONTRACT_ADDRESS,
  compareHashes,
} from '@fta/helpers';
import { Spinner, StatusMessage } from '@inkjs/ui';
import { Interface, formatEther } from 'ethers';
import { Newline, Text } from 'ink';
import { argument, option } from 'pastel';
import { useState, type ReactElement, useEffect } from 'react';
import { z } from 'zod';
import { Basescan } from '../clients/basescan.js';
import { getBasescanApiKey } from '../clients/keychain.js';
import { saveToCsv } from '../helpers/saveToCsv.js';

const ftContractInterface = new Interface(friendTechContractAbi);

export const args = z.tuple([
  z.string().describe(
    argument({
      name: 'address',
      description: 'Address to generate a report for',
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

export default function Report({ args: [address], options: { outDir } }: Props): ReactElement {
  const [step, setStep] = useState<'initial' | 'fetchingData' | 'success'>('initial');
  const [successData, setSuccessData] = useState<{
    filePath: string;
    startDate: string;
    endDate: string;
  }>();
  const [error, setError] = useState<Error>();

  useEffect(() => {
    if (step !== 'initial') return;

    (async () => {
      const baseScanApiKey = await getBasescanApiKey();

      if (!baseScanApiKey) {
        throw new Error(
          'No Basescan API key found. Please provide one by running "fta basescan set"',
        );
      }

      setStep('fetchingData');

      const basescan = new Basescan(baseScanApiKey);

      const transactions = await basescan.getTransactions(address);
      const internalTransactions = await basescan.getInternalTransactions(address);

      if (transactions.message !== 'OK') {
        throw new Error(
          `Failed to fetch transactions for ${address}. Response: "${JSON.stringify(
            transactions,
          )}"`,
        );
      }

      if (internalTransactions.message !== 'OK') {
        throw new Error(
          `Failed to fetch transactions for ${address}. Response: "${JSON.stringify(
            internalTransactions,
          )}"`,
        );
      }

      if (process.env.LOG_LEVEL === 'debug') {
        console.debug('\nDEBUG: Normal transactions:', transactions);
        console.debug('DEBUG: Internal transactions:', internalTransactions);

        writeFileSync(
          `${outDir}/fta.log`,
          JSON.stringify({ transactions, internalTransactions }, null, 2),
        );
      }

      const normalizedInternalTxs = new Map<string, number>();
      const usedInternalTransactions = new Set<string>();

      // Process internal transactions first
      const processedInternalTransactions = internalTransactions.result
        .filter((tx) => compareHashes(tx.from, FRIEND_TECH_BASE_CONTRACT_ADDRESS))
        .map((tx) => {
          return {
            hash: tx.hash,
            timestamp: Number(tx.timeStamp),
            function: 'receiveFees',
            sharesNum: null,
            value: formatEther(tx.value),
            txFee: '',
          };
        });

      // Normalize internal transactions for further usage. If there's a
      // sellShares tx, we will use internal tx value instead, this will show
      // how much did the user get for selling shares.
      processedInternalTransactions.forEach((tx, index) => {
        normalizedInternalTxs.set(tx.hash, index);
      });

      const filteredTransactions = transactions.result
        .filter(
          (tx) =>
            compareHashes(tx.from, address) &&
            (tx.functionName?.startsWith('buyShares') || tx.functionName?.startsWith('sellShares')),
        )
        .map((tx) => {
          const decoded = ftContractInterface.parseTransaction({ data: tx.input });
          const functionName = tx.functionName.split('(')[0];

          // By default use the value from the transaction. It's for buyShares function
          let value = formatEther(tx.value);

          // For sellShares check if there's a corresponding internal tx and use
          // its value instead
          if (functionName === 'sellShares') {
            const index = normalizedInternalTxs.get(tx.hash);

            if (typeof index === 'number') {
              value = processedInternalTransactions[index].value;
              usedInternalTransactions.add(tx.hash);
            }
          }

          return {
            hash: tx.hash,
            timestamp: Number(tx.timeStamp),
            function: functionName,
            sharesNum: decoded?.args ? Number(decoded.args[1]) : null,
            value,
            txFee: formatEther(Number(tx.gasUsed) * Number(tx.gasPrice)),
          };
        });

      const data = [
        ...filteredTransactions,
        // Filter out internal transactions which are for sellShares as we
        // already have an entry for them in filteredTransactions. Keep only
        // transactions about somebody else's sells where we get a fee paid.
        ...processedInternalTransactions.filter((tx) => !usedInternalTransactions.has(tx.hash)),
      ]
        .sort((a, b) => a.timestamp - b.timestamp)
        .map((tx) => {
          return [
            tx.hash,
            new Date(tx.timestamp * 1000).toISOString(),
            tx.function,
            tx.sharesNum,
            tx.value,
            tx.txFee || '',
          ].join(',');
        });

      const csvData = ['txHash,datetime,function,sharesNum,value,l2TxFee', ...data];
      const filePath = saveToCsv(csvData, outDir, `report-${address}`);

      if (process.env.LOG_LEVEL === 'debug') {
        console.debug('\nDEBUG: First tx:', data[0]);
        console.debug('DEBUG: Last tx:', data[data.length - 1]);
      }

      setSuccessData({
        filePath,
        startDate: data[0].split(',')[1],
        endDate: data[data.length - 1].split(',')[1],
      });

      setStep('success');
    })().catch((err) => {
      setError(err);

      appendFileSync(`${outDir}/fta.log`, JSON.stringify({ err }, null, 2));
    });
  }, [address, outDir, step]);

  return (
    <>
      {error ? (
        <Text color="red">{error.message}</Text>
      ) : (
        <>
          <Newline />
          {step === 'fetchingData' ? (
            <Spinner label={`Fetching transactions for ${address}`} />
          ) : null}
          {step === 'success' ? (
            <StatusMessage variant="success">
              Successfully generated report for <Text color="yellow">{address}</Text> at{' '}
              <Text color="magenta">{successData?.filePath}</Text>
              {'\n\n'}
              📅 Report dates between <Text color="blue">{successData?.startDate}</Text> and{' '}
              <Text color="blue">{successData?.endDate}</Text>
            </StatusMessage>
          ) : null}
        </>
      )}
    </>
  );
}
