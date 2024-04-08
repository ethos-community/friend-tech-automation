import UserAgent from 'user-agents';

interface Response<T = unknown> {
  ok: boolean;
  status: number;
  statusText: string;
  json: () => Promise<T>;
}

export interface User {
  id: number;
  address: string;
  twitterUsername: string;
  twitterName: string;
  twitterPfpUrl: string;
  twitterUserId: string;
  lastOnline: string;
  lastMessageTime: string;
  holderCount: number;
  holdingCount: number;
  watchlistCount: number;
  shareSupply: number;
  displayPrice: string;
  lifetimeFeesCollectedInWei: number;
}

export interface UserTokenHolding {
  id: number;
  address: string;
  twitterUsername: string;
  twitterName: string;
  twitterPfpUrl: string;
  twitterUserId: string;
  lastOnline: number;
  balance: string;
}

export interface UserTokenHoldingResponse {
  nextPageStart: number | null;
  users: UserTokenHolding[];
}

export interface SearchUser {
  address: string;
  twitterUsername: string;
  twitterName: string;
  twitterPfpUrl: string;
  twitterUserId: string;
}

export interface RecentMessager {
  address: string;
  twitterUsername: string;
  twitterName: string;
  twitterPfpUrl: string;
  twitterUserId: string;
  lastMessageTimestamp: string;
  ethDisplayPrice: number;
}

export interface OnlineUser {
  address: string;
  twitterUsername: string;
  twitterName: string;
  twitterPfpUrl: string;
  twitterUserId: string;
  ethDisplayPrice: number;
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

const userAgent = new UserAgent({ deviceCategory: 'desktop' });

export class FriendTech {
  private readonly token?: string;

  constructor(token?: string) {
    if (token) {
      this.token = token;
    }
  }

  async getUser(address: string): Promise<User> {
    return await this.fetch<User>({ pathname: `/users/${address}` });
  }

  async getUserTokenHoldings(address: string, pageStart = '0'): Promise<UserTokenHolding[]> {
    const { nextPageStart, users } = await this.fetch<UserTokenHoldingResponse>({
      pathname: `/users/${address}/token-holdings`,
      query: { pageStart },
    });

    if (!nextPageStart) {
      return users;
    }

    return [...users, ...(await this.getUserTokenHoldings(address, String(nextPageStart)))];
  }

  async searchUser(twUsername: string, twUserId: string): Promise<SearchUser | undefined> {
    if (!this.token) {
      throw new Error('Missing FT token');
    }

    const { users } = await this.fetch<{
      users: SearchUser[];
    }>({
      pathname: '/search/users',
      query: { username: twUsername },
      headers: {
        Authorization: this.token,
      },
    });

    return users.find((user) => user.twitterUserId === twUserId);
  }

  async recentMessagers(): Promise<RecentMessager[]> {
    const { users } = await this.fetch<{ users: RecentMessager[] }>({
      pathname: '/lists/recent-messagers',
    });

    return users;
  }

  async onlineUsers(): Promise<OnlineUser[]> {
    const { users } = await this.fetch<{ users: OnlineUser[] }>({
      pathname: '/lists/online',
    });

    return users;
  }

  private async fetch<R>({
    method = 'GET',
    pathname,
    query,
    headers = {},
  }: {
    method?: 'GET';
    pathname: string;
    query?: Record<string, string>;
    headers?: Record<string, string>;
  }): Promise<R> {
    const url = new URL(pathname, 'https://prod-api.kosetto.com');

    if (query) {
      for (const [key, value] of Object.entries(query)) {
        url.searchParams.append(key, value);
      }
    }

    headers['User-Agent'] = userAgent.random().toString();

    // eslint-disable-next-line @typescript-eslint/ban-ts-comment, @typescript-eslint/prefer-ts-expect-error
    // @ts-ignore
    const res = (await global.fetch(url, {
      method,
      headers,
    })) as Response<R>;

    if (!res.ok) {
      // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
      throw new NetError(`Error: ${res.status} ${res.statusText}`, res);
    }

    return await res.json();
  }
}
