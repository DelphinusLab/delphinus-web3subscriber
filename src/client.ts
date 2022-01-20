import detectEthereumProvider from "@metamask/detect-provider";
import { MetaMaskInpageProvider } from "@metamask/providers";
import BN from "bn.js";
import { ethers } from "ethers";

export class DelphinusContract {
  private readonly contract: ethers.Contract;
  private readonly jsonInterface: any;

  constructor(
    delphinusProvider: DelphinusProvider,
    jsonInterface: any,
    address: string,
    signer?: ethers.Signer
  ) {
    this.jsonInterface = jsonInterface;

    this.contract = new ethers.Contract(
      jsonInterface.abi,
      address,
      signer || delphinusProvider.provider
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

export abstract class DelphinusProvider {
  provider: ethers.providers.JsonRpcProvider;

  constructor(ethersProvider: ethers.providers.JsonRpcProvider) {
    this.provider = ethersProvider;
  }

  abstract connect(): Promise<void>;
  async close() {}

  /**
   * switching the wallet’s active Ethereum chain.
   */
  abstract switchNet(
    chainHexId: string,
    chainName: string,
    rpcSource: string
  ): Promise<void>;

  async getNetworkId() {
    return await this.provider.network.chainId;
  }

  getSigner(address?: string) {
    return this.provider.getSigner(address);
  }

  getDefaultSigner() {
    return this.provider.getSigner();
  }

/*
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
*/

  /**
   * Creates a new contract instance with all its methods and events
   * defined in its json interface object.
   * @constructor
   * @param {AbiItem[] | AbiItem} jsonInterface - The json interface for the contract to instantiate.
   * @param {string} address - The address of the smart contract to call.
   * @param {string} accountAddress - The address transactions should be made from.
   */
  getContract(jsonInterface: any, address: string, accountAddress?: string) {
    return new DelphinusContract(
      this,
      jsonInterface,
      address,
      this.getSigner(accountAddress)
    );
  }
}

export class DelphinusBrowserProvider extends DelphinusProvider {
  metamaskProvider: MetaMaskInpageProvider;

  constructor() {
    if (!window.ethereum) {
      throw "MetaMask not installed, Browser mode is not available.";
    }

    super(new ethers.providers.Web3Provider(window.ethereum as any, "any"));
    this.metamaskProvider = window.ethereum as MetaMaskInpageProvider;
  }

  async connect() {
    await this.metamaskProvider.request({ method: "eth_requestAccounts" });
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
        await this.metamaskProvider.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: chainHexId }],
        });
      } catch (e: any) {
        if (e.code == 4902) {
          try {
            await this.metamaskProvider.request({
              method: "wallet_addEthereumChain",
              params: [
                {
                  chainId: chainHexId,
                  chainName: chainName,
                  rpcUrls: [rpcSource],
                },
              ],
            });
            await this.metamaskProvider.request({
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

export class DelphinusRpcProvider extends DelphinusProvider {
  readonly monitorAccount: string;

  constructor(config: MonitorMode) {
    super(new ethers.providers.JsonRpcProvider(config.chainRpc));

    this.monitorAccount = config.monitorAccount;
    //FIXME: inject monitor account to somewhere
  }

  async connect() {}

  async switchNet(
    chainHexId: string,
    chainName: string,
    rpcSource: string
  ): Promise<void> {}
}

export interface MonitorMode {
  monitorAccount: string;
  chainRpc: string;
}

async function withDelphinusWeb3<t>(
  provider: DelphinusProvider,
  cb: (provider: DelphinusProvider) => Promise<t>
) {
  await provider.connect();
  try {
    return await cb(provider);
  } finally {
    await provider.close();
  }
}

export async function withBrowerWeb3<t>(
  cb: (provider: DelphinusProvider) => Promise<t>
) {
  let web3 = new DelphinusBrowserProvider();
  return await withDelphinusWeb3(web3, cb);
}

export async function withProviderWeb3<t>(
  config: MonitorMode,
  cb: (web3: DelphinusProvider) => Promise<t>
) {
  let web3 = new DelphinusRpcProvider(config);
  return await withDelphinusWeb3(web3, cb);
}

export type DelphinusAccount = ethers.Signer;