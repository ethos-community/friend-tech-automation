import keychain from 'keychain';
import { z } from 'zod';

const SERVICE = 'friend-tech-automations';
const ACCOUNT = 'store';

const storeSchema = z.object({
  nodeProviderUrl: z.string().url().optional(),
  wallets: z.record(
    z.string().length(42),
    z.object({
      name: z.string(),
      privateKey: z.string().length(64),
    }),
  ),
  twitter: z
    .object({
      username: z.string(),
      password: z.string(),
      email: z.string().email(),
    })
    .optional(),
  ftToken: z.string().optional(),
  telegramApiKey: z.string().optional(),
  basescanApiKey: z.string().optional(),
});

export type Store = z.infer<typeof storeSchema>;

async function getPassword({
  account,
  service,
}: {
  service: string;
  account: string;
}): Promise<string | null> {
  return await new Promise((resolve, reject) => {
    keychain.getPassword({ account, service }, (err, password) => {
      if (!err) {
        resolve(password);
        return;
      }

      if (err.code === 'PasswordNotFound') {
        resolve(null);

        return;
      }

      reject(err);
    });
  });
}

async function savePassword({
  service,
  account,
  password,
}: {
  service: string;
  account: string;
  password: string;
}): Promise<void> {
  await new Promise((resolve, reject) => {
    keychain.setPassword(
      {
        account,
        service,
        password,
      },
      (err) => {
        if (err) {
          reject(err);
          return;
        }

        resolve(true);
      },
    );
  });
}

async function getStore(): Promise<Store> {
  const store = await getPassword({
    account: ACCOUNT,
    service: SERVICE,
  });

  if (!store) {
    return { wallets: {} };
  }

  const result = storeSchema.safeParse(JSON.parse(store));

  if (!result.success) {
    throw result.error;
  }

  return result.data;
}

async function setStore(store: Store): Promise<void> {
  const result = storeSchema.safeParse(store);

  if (!result.success) {
    throw result.error;
  }

  await savePassword({
    account: ACCOUNT,
    service: SERVICE,
    password: JSON.stringify(result.data),
  });
}

export interface Wallet {
  address: string;
  name: string;
  privateKey: string;
}

export async function getWallets(): Promise<Wallet[]> {
  const store = await getStore();

  return Object.entries(store.wallets).map(([address, { name, privateKey }]) => ({
    address,
    name,
    privateKey,
  }));
}

export async function setWallet(address: string, name: string, privateKey: string): Promise<void> {
  const store = await getStore();

  store.wallets[address] = {
    name,
    privateKey,
  };

  await setStore(store);
}

export async function removeWallet(address: string): Promise<void> {
  const store = await getStore();

  const wallets = Object.entries(store.wallets).reduce<Store['wallets']>((acc, [key, value]) => {
    if (key !== address) {
      acc[key] = value;
    }

    return acc;
  }, {});

  store.wallets = wallets;

  await setStore(store);
}

export async function getNodeProviderUrl(): Promise<string | undefined> {
  const store = await getStore();

  return store.nodeProviderUrl;
}

export async function setNodeProviderUrl(url: string): Promise<void> {
  const store = await getStore();

  store.nodeProviderUrl = url;

  await setStore(store);
}

export async function getTwitterCredentials(): Promise<Store['twitter'] | undefined> {
  const store = await getStore();

  return store.twitter;
}

export async function setTwitterCredentials(
  username: string,
  password: string,
  email: string,
): Promise<void> {
  const store = await getStore();

  store.twitter = {
    username,
    password,
    email,
  };

  await setStore(store);
}

export async function getFtToken(): Promise<string | undefined> {
  const store = await getStore();

  return store.ftToken;
}

export async function setFtToken(token: string): Promise<void> {
  const store = await getStore();

  store.ftToken = token;

  await setStore(store);
}

export async function getTelegramApiKey(): Promise<string | undefined> {
  const store = await getStore();

  return store.telegramApiKey;
}

export async function setTelegramAPiKey(apiKey: string): Promise<void> {
  const store = await getStore();

  store.telegramApiKey = apiKey;

  await setStore(store);
}

export async function getBasescanApiKey(): Promise<string | undefined> {
  const store = await getStore();

  return store.basescanApiKey;
}

export async function setBasescanAPiKey(apiKey: string): Promise<void> {
  const store = await getStore();

  store.basescanApiKey = apiKey;

  await setStore(store);
}
