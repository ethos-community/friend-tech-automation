import { FRIEND_TECH_BASE_CONTRACT_ADDRESS, friendTechContractAbi } from '@fta/helpers';
import type { TransactionReceipt } from 'ethers';
import { Contract, JsonRpcProvider, Wallet, formatEther } from 'ethers';

export interface TradeEventParams {
  trader: string;
  subject: string;
  isBuy: boolean;
  shareAmount: number;
  ethAmount: number;
  protocolEthAmount: number;
  subjectEthAmount: number;
  supply: number;
}

export class FriendTechContract {
  private readonly contractRead: Contract;
  private readonly contractWrite: Contract;
  private readonly ethersProvider: JsonRpcProvider;
  public wallet: Wallet;

  constructor(alchemyApiUrl: string, privateKey: string) {
    this.ethersProvider = new JsonRpcProvider(alchemyApiUrl);
    this.wallet = new Wallet(privateKey, this.ethersProvider);

    this.contractRead = new Contract(
      FRIEND_TECH_BASE_CONTRACT_ADDRESS,
      friendTechContractAbi,
      this.ethersProvider,
    );
    this.contractWrite = new Contract(
      FRIEND_TECH_BASE_CONTRACT_ADDRESS,
      friendTechContractAbi,
      this.wallet,
    );
  }

  async waitForTransaction(hash: string): Promise<TransactionReceipt | null> {
    return await this.ethersProvider.waitForTransaction(hash);
  }

  async getBuyPriceAfterFee(address: string, amount: number): Promise<string> {
    const value = await this.contractRead.getBuyPriceAfterFee(address, amount);

    return value;
  }

  async sharesBalance(subject: string, holder: string): Promise<number> {
    return Number(await this.contractRead.sharesBalance(subject, holder));
  }

  async buyShares(
    payableAmount: string,
    address: string,
    amount: number,
  ): Promise<{ hash: string }> {
    return await this.contractWrite.buyShares(address, amount, {
      value: payableAmount,
    });
  }

  async sellShares(address: string, amount: number): Promise<{ hash: string }> {
    if (!this.contractWrite) {
      throw new Error('Missing privateKey');
    }

    return await this.contractWrite.sellShares(address, amount);
  }

  onTrade(fn: (params: TradeEventParams) => Promise<void>): void {
    this.contractRead
      .on(
        this.contractRead.filters.Trade,
        (
          trader: string,
          subject: string,
          isBuy: boolean,
          shareAmount: number,
          ethAmount: number,
          protocolEthAmount: number,
          subjectEthAmount: number,
          supply: number,
        ) => {
          fn({
            trader,
            subject,
            isBuy,
            shareAmount: Number(shareAmount),
            ethAmount: Number(formatEther(ethAmount)),
            protocolEthAmount: Number(formatEther(protocolEthAmount)),
            subjectEthAmount: Number(formatEther(subjectEthAmount)),
            supply: Number(supply),
          }).catch((err) => {
            console.error('ft_contract.cb_failed', err);
          });
        },
      )
      .catch((err) => {
        console.error('ft_contract.on_trade_failed', err);
      });
  }
}
