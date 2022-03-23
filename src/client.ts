import Web3 from "web3";
import { Contract, EventData } from "web3-eth-contract";
import { provider } from "web3-core";
import detectEthereumProvider from "@metamask/detect-provider";
import { MetaMaskInpageProvider } from "@metamask/providers";
import BN from "bn.js";

import { DelphinusProvider } from "./provider";

export class DelphinusContract {
  private readonly contract: Contract;
  private readonly jsonInterface: any;
  public static contractAPITimeOut: number = 10000; //10 seconds

  constructor(
    web3Instance: DelphinusWeb3,
    jsonInterface: any,
    address: string,
    account?: string
  ) {
    this.jsonInterface = jsonInterface;

    this.contract = new web3Instance.web3Instance.eth.Contract(
      jsonInterface.abi,
      address,
      {
        from: account || web3Instance.getDefaultAccount(),
      }
    );
  }

  getWeb3Contract() {
    return this.contract;
  }

  getJsonInterface() {
    return this.jsonInterface;
  }

  promiseWithTimeout<T>(
    promise: Promise<T>,
    ms: number,
    timeoutError:string
  ){
    var timeoutHandler: NodeJS.Timeout;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutHandler = setTimeout(() => {
        reject(new Error(timeoutError));
      }, ms);
    });
  
    // returns a race between timeout and the passed promise
    return Promise.race<T>([promise, timeoutPromise])
    .then(
      (value) => {
        clearTimeout(timeoutHandler);
        return value;
      }
    )
  }

  async getPastEventsFrom(fromBlock: number) {
    const getPastEventsPromise = this.contract.getPastEvents("allEvents", {
      fromBlock: fromBlock,
    });
    
    try{
      return await this.promiseWithTimeout(getPastEventsPromise, DelphinusContract.contractAPITimeOut, `getPastEvents time out after ${DelphinusContract.contractAPITimeOut} milliseconds`);
    }
    catch(e)
    {
      console.log("Exit Process: ", e);
      process.exit(1);
    }
  }

  address() {
    return this.contract.options.address;
  }
}

export abstract class DelphinusWeb3 {
  web3Instance: Web3;

  constructor(web3Instance: Web3, close?: (_: provider) => Promise<void>) {
    this.web3Instance = web3Instance;
  }

  abstract connect(): Promise<void>;
  abstract close(): Promise<void>;

  /**
   * switching the wallet’s active Ethereum chain.
   */
  abstract switchNet(
    chainHexId: string,
    chainName: string,
    rpcSource: string
  ): Promise<void>;

  async getNetworkId() {
    return await this.web3Instance.eth.net.getId();
  }

  getDefaultAccount() {
    if (this.web3Instance.eth.defaultAccount === null) {
      throw "DefaultAccount is null";
    }

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
  getContract(jsonInterface: any, address: string, account?: string) {
    return new DelphinusContract(
      this,
      jsonInterface,
      address,
      account || this.getDefaultAccount()
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

  async close() {}

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
  readonly delphinusProvider: DelphinusProvider;

  constructor(config: MonitorMode) {
    super(new Web3(config.provider.provider));

    this.delphinusProvider = config.provider;
    this.monitorAccount = config.monitorAccount;
    super.setDefaultAccount(config.monitorAccount);
  }

  async connect() {}

  async close() {
    await this.delphinusProvider.close();
  }

  async switchNet(
    chainHexId: string,
    chainName: string,
    rpcSource: string
  ): Promise<void> {}
}

export interface MonitorMode {
  provider: DelphinusProvider;
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
