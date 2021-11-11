import Web3 from "web3";
import { Contract } from "web3-eth-contract";
import { provider } from "web3-core";
import detectEthereumProvider from "@metamask/detect-provider";
import { MetaMaskInpageProvider } from "@metamask/providers";
import BN from "bn.js";

export class DelphinusContract {
  private readonly contract: Contract;

  constructor(
    web3Instance: Web3,
    jsonInterface: any,
    address: string,
    account: string
  ) {
    this.contract = new web3Instance.eth.Contract(jsonInterface.abi, address, {
      from: account,
    });
  }

  async getBalance(account: string) {
    return await this.contract.methods.balanceOf(account).call();
  }

  async getPastEventsFrom(fromBlock: number) {
    return await this.contract.getPastEvents("allEvents", {
      fromBlock: fromBlock,
    });
  }

  getContractInstance() {
    return this.contract;
  }
}

export abstract class DelphinusWeb3 {
  web3Instance: Web3;
  private readonly closeWeb3?: (_: provider) => Promise<void>;

  constructor(web3Instance: Web3, close?: (_: provider) => Promise<void>) {
    this.web3Instance = web3Instance;
    this.closeWeb3 = close;
  }

  abstract connect(): Promise<void>;

  /**
   * switching the wallet’s active Ethereum chain.
   */
  abstract switchNet(
    chainHexId: string,
    chainName: string,
    rpcSource: string
  ): Promise<void>;

  async close() {
    if (this.web3Instance && this.closeWeb3 !== undefined) {
      await this.closeWeb3(this.web3Instance.currentProvider);
    }
  }

  async getNetworkId() {
    return await this.web3Instance.eth.net.getId();
  }

  getDefaultAccount() {
    return this.web3Instance.eth.defaultAccount;
  }

  setDefaultAccount(account: string) {
    this.web3Instance.eth.defaultAccount = account;
  }

  async getAccountInfo() {
    const address = await this.getDefaultAccount();
    const id = await this.web3Instance.eth.net.getId();

    if (address === null) {
      throw "Default Account not set";
    }

    return {
      address: address,
      chainId: id.toString(),
      web3: this.web3Instance,
    };
  }

  /**
   * Creates a new contract instance with all its methods and events
   * defined in its json interface object.
   * @constructor
   * @param {AbiItem[] | AbiItem} jsonInterface - The json interface for the contract to instantiate.
   * @param {string} address - The address of the smart contract to call.
   * @param {string} account - The address transactions should be made from.
   */
  getContract(jsonInterface: any, address: string, account: string) {
    return new DelphinusContract(
      this.web3Instance,
      jsonInterface,
      address,
      account
    );
  }
}

export class Web3BrowsersMode extends DelphinusWeb3 {
  provider: MetaMaskInpageProvider;

  constructor() {
    if (!window.ethereum) {
      throw "MetaMask not installed, Browser mode is not available.";
    }

    super(new Web3(window.ethereum as any), undefined);
    this.provider = window.ethereum as MetaMaskInpageProvider;
  }

  async connect() {
    await this.provider.request({ method: "eth_requestAccounts" });
    let accounts = await this.web3Instance.eth.getAccounts();
    this.setDefaultAccount(accounts[0]);
  }

  async subscribeAccountChange<T>(cb: (account: string) => T) {
    this.provider.on("accountsChanged", (...accounts: unknown[]) => {
      cb(accounts[0] as any);
    });
  }

  async switchNet(chainHexId: string, chainName: string, rpcSource: string) {
    let id = await this.getNetworkId();
    let idHex = "0x" + new BN(id).toString(16);
    console.log("switch chain", idHex, chainHexId);
    if (idHex != chainHexId) {
      try {
        await this.provider.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: chainHexId }],
        });
      } catch (e: any) {
        if (e.code == 4902) {
          try {
            await this.provider.request({
              method: "wallet_addEthereumChain",
              params: [
                {
                  chainId: chainHexId,
                  chainName: chainName,
                  rpcUrls: [rpcSource],
                },
              ],
            });
            await this.provider.request({
              method: "wallet_switchEthereumChain",
              params: [{ chainId: chainHexId }],
            });
          } catch (e) {
            throw new Error("Add Network Rejected by User.");
          }
        } else {
          throw new Error("Can not switch to chain " + chainHexId);
        }
      }
    }
    id = await this.getNetworkId();
    console.log("switched", id, chainHexId);
  }
}

export class Web3ProviderMode extends DelphinusWeb3 {
  readonly monitorAccount: string;

  constructor(config: MonitorMode) {
    super(new Web3(config.provider), config.closeProvider);

    this.monitorAccount = config.monitorAccount;
    super.setDefaultAccount(config.monitorAccount);
  }

  async connect() {}

  async switchNet(
    chainHexId: string,
    chainName: string,
    rpcSource: string
  ): Promise<void> {}
}

export interface MonitorMode {
  provider: provider;
  closeProvider: (prov: provider) => Promise<void>;
  monitorAccount: string;
}

async function withDelphinusWeb3<t>(
  web3: DelphinusWeb3,
  cb: (web3: DelphinusWeb3) => Promise<t>
) {
  await web3.connect();
  try {
    return await cb(web3);
  } finally {
    await web3.close();
  }
}

export async function withBrowerWeb3<t>(
  cb: (web3: DelphinusWeb3) => Promise<t>
) {
  let web3 = new Web3BrowsersMode();
  return await withDelphinusWeb3(web3, cb);
}

export async function withProviderWeb3<t>(
  config: MonitorMode,
  cb: (web3: DelphinusWeb3) => Promise<t>
) {
  let web3 = new Web3ProviderMode(config);
  return await withDelphinusWeb3(web3, cb);
}
