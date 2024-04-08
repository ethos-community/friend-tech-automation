interface Response<T = unknown> {
  ok: boolean;
  status: number;
  statusText: string;
  json: () => Promise<T>;
}

export class NetError extends Error {
  res?: Response;

  constructor(message: string, res?: Response) {
    super(message);

    if (res) {
      this.res = res;
    }
  }
}

interface TxResponse<T> {
  status: '1';
  message: 'OK';
  result: T[];
}

interface Transaction {
  blockNumber: string;
  blockHash: string;
  timeStamp: string;
  hash: string;
  nonce: string;
  transactionIndex: string;
  from: string;
  to: string;
  value: string;
  gas: string;
  gasPrice: string;
  input: string;
  methodId: string;
  functionName: string;
  contractAddress: string;
  cumulativeGasUsed: string;
  txreceipt_status: string;
  gasUsed: string;
  confirmations: string;
  isError: string;
}

interface InternalTransaction {
  blockNumber: string;
  timeStamp: string;
  hash: string;
  from: string;
  to: string;
  value: string;
  contractAddress: string;
  input: string;
  type: string;
  gas: string;
  gasUsed: string;
  traceId: string;
  isError: string;
  errCode: string;
}

export class Basescan {
  readonly apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async getTransactions(address: string): Promise<TxResponse<Transaction>> {
    return await this.fetch<TxResponse<Transaction>>({
      query: {
        module: 'account',
        action: 'txlist',
        address,
        startblock: '0',
        endblock: 'latest',
        sort: 'asc',
      },
    });
  }

  async getInternalTransactions(address: string): Promise<TxResponse<InternalTransaction>> {
    return await this.fetch<TxResponse<InternalTransaction>>({
      query: {
        module: 'account',
        action: 'txlistinternal',
        address,
        startblock: '0',
        endblock: 'latest',
        sort: 'asc',
      },
    });
  }

  private async fetch<R>({
    method = 'GET',
    query,
  }: {
    method?: 'GET';
    query?: Record<string, string>;
  }): Promise<R> {
    const url = new URL('https://api.basescan.org/api');

    url.searchParams.append('apiKey', this.apiKey);

    if (query) {
      for (const [key, value] of Object.entries(query)) {
        url.searchParams.append(key, value);
      }
    }

    // eslint-disable-next-line @typescript-eslint/ban-ts-comment, @typescript-eslint/prefer-ts-expect-error
    // @ts-ignore
    const res = (await global.fetch(url, {
      method,
    })) as Response<R>;

    if (!res.ok) {
      // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
      throw new NetError(`Error: ${res.status} ${res.statusText}`, res);
    }

    return await res.json();
  }
}
