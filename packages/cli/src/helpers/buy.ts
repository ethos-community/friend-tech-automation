import fs from 'node:fs';
import { compareHashes } from '@fta/helpers';
import type { TransactionReceipt } from 'ethers';
import { formatEther } from 'ethers';
import type { User } from '../clients/friendTech.js';
import { FriendTech } from '../clients/friendTech.js';
import type { FriendTechContract } from '../clients/friendTechContract.js';

const CACHED_USERS_PATH = './cached-users.json';
const friendTechApi = new FriendTech();

export interface FormattedUser {
  twitterUsername: User['twitterUsername'];
  twitterName: User['twitterName'];
  keyPriceInEth: number;
  lastOnline: number;
  address: User['address'];
}

export interface UserTokenHoldings {
  balance: number;
  twitterName: string;
}

export async function getUserTokenHoldings(
  address: string,
): Promise<Map<string, UserTokenHoldings>> {
  const users = await friendTechApi.getUserTokenHoldings(address);

  const usersMap = new Map<string, UserTokenHoldings>();

  for (const user of users) {
    const balance = Number(user.balance);

    if (balance > 0 && !compareHashes(user.address, address)) {
      usersMap.set(user.address, {
        balance,
        twitterName: user.twitterName,
      });
    }
  }

  return usersMap;
}

export async function getUser(address: string): Promise<{ user?: FormattedUser; error?: unknown }> {
  try {
    const user = await friendTechApi.getUser(address);

    return {
      user: {
        twitterUsername: user.twitterUsername,
        twitterName: user.twitterName,
        // For some reasons formatEth fails if the number is float. We don't
        // need that precision anyway.
        keyPriceInEth: Number(formatEther(user.displayPrice.split('.')[0])),
        lastOnline: Number(user.lastOnline),
        address: user.address,
      },
    };
  } catch (error) {
    return { error };
  }
}

export async function buy(
  friendTechContract: FriendTechContract,
  address: string,
  amount: number,
): Promise<string> {
  const payableAmount = await friendTechContract.getBuyPriceAfterFee(address, amount);
  const { hash } = await friendTechContract.buyShares(payableAmount, address, amount);

  return hash;
}

export async function waitForTransaction(
  friendTechContract: FriendTechContract,
  hash: string,
): Promise<TransactionReceipt | null> {
  return await friendTechContract.waitForTransaction(hash);
}

export async function getSharesBalance(
  friendTechContract: FriendTechContract,
  subject: string,
  holder: string,
): Promise<number> {
  return await friendTechContract.sharesBalance(subject, holder);
}

export function getCachedUsers(): Map<string, number> {
  if (!fs.existsSync(CACHED_USERS_PATH)) {
    return new Map<string, number>();
  }

  return new Map(Object.entries(JSON.parse(fs.readFileSync(CACHED_USERS_PATH, 'utf8'))));
}

export function setCachedUsers(users: Map<string, number>): void {
  const json = JSON.stringify(Object.fromEntries(users.entries()), null, 2);

  fs.writeFileSync(CACHED_USERS_PATH, json);
}
