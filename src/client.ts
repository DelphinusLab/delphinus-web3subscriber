import Web3 from "web3";
import { Contract } from "web3-eth-contract";
import { provider } from "web3-core";
import detectEthereumProvider from "@metamask/detect-provider";
import { MetaMaskInpageProvider } from "@metamask/providers";
import BN from "bn.js";
import { ethers } from "ethers";

import { DelphinusProvider } from "./provider";
import { encodeL1address } from "./addresses";

export class DelphinusContractEther {
  private contract: ethers.Contract;

  constructor(address: string, jsonABI: any, provider: BlockChainClient) {
    this.contract = new ethers.Contract(
      address,
      jsonABI.abi,
      provider.getSignerOrProvider()
    );
  }

  async call(method: string, ...args: any[]) {
    return await this.contract[method](...args);
  }

  address() {
    return this.contract.address;
  }
}

export class DelphinusContract {
  private readonly contract: Contract;
  private readonly jsonInterface: any;

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

  async getPastEventsFrom(fromBlock: number) {
    return await this.contract.getPastEvents("allEvents", {
      fromBlock: fromBlock,
    });
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

export abstract class BlockChainClient {
  private readonly provider: ethers.providers.JsonRpcProvider;

  constructor(provider: ethers.providers.JsonRpcProvider) {
    this.provider = provider;
  }

  abstract switchNet(
    switchToChainId: number,
    chainName: string,
    rpcSource: string
  ): Promise<void>;

  async getAccountInfo() {
    return await this.provider.getSigner().getAddress();
  }

  async getChainID() {
    return (await this.provider.getNetwork()).chainId;
  }

  async send(method: string, params: any[]) {
    return this.provider.send(method, params);
  }

  async getContract(address: string, jsonABI: any) {
    return new DelphinusContractEther(address, jsonABI, this);
  }

  getSignerOrProvider() {
    return this.provider.getSigner() || this.provider;
  }

  /**
   *
   * @param address address must start with 0x
   * @returns
   */
  async encodeL1Address(address: string) {
    if (address.substring(0, 2) != "0x") {
      throw "address must start with 0x";
    }

    const addressHex = address.substring(2);
    const chex = (await this.getChainID()).toString();
    return encodeL1address(addressHex, chex);
  }
}

class BlockChainClientBrowser extends BlockChainClient {
  private externalProvider: ethers.providers.ExternalProvider;

  constructor() {
    const provider = new ethers.providers.Web3Provider(window.ethereum as any);
    super(provider);
    this.externalProvider = window.ethereum as any;
  }

  async switchNet(
    switchToChainId: number,
    chainName: string,
    rpcSource: string
  ) {
    let currentChainId = await this.getChainID();
    console.log("switch chain", currentChainId, switchToChainId);
    if (currentChainId != switchToChainId) {
      try {
        await this.externalProvider.request!({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: switchToChainId }],
        });
      } catch (e: any) {
        if (e.code == 4902) {
          try {
            await this.externalProvider.request!({
              method: "wallet_addEthereumChain",
              params: [
                {
                  chainId: switchToChainId,
                  chainName: chainName,
                  rpcUrls: [rpcSource],
                },
              ],
            });
            await this.externalProvider.request!({
              method: "wallet_switchEthereumChain",
              params: [{ chainId: switchToChainId }],
            });
          } catch (e) {
            throw new Error("Add Network Rejected by User.");
          }
        } else {
          throw new Error("Can not switch to chain " + switchToChainId);
        }
      }
    }
    currentChainId = await this.getChainID();
    console.log("switched", currentChainId, switchToChainId);
  }
}

class BlockChainClientProvider extends BlockChainClient {
  constructor(rpcUrl: string) {
    const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
    super(provider);
  }

  async switchNet(
    _switchToChainId: number,
    _chainName: string,
    _rpcSource: string
  ) {}
}

export async function withBlockchainClient<t>(
  cb: (blockchain: BlockChainClient) => Promise<t>,
  browserOrUrl?: string
) {
  let client = browserOrUrl
    ? new BlockChainClientProvider(browserOrUrl)
    : new BlockChainClientBrowser();
  return cb(client);
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
