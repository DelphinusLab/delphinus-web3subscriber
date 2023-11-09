import {
  Contract,
  Signer,
  BrowserProvider,
  Eip1193Provider,
  Provider,
  JsonRpcSigner,
  InterfaceAbi,
  Wallet,
  TransactionRequest,
} from "ethers";
import {
  DelphinusBaseProvider,
  DelphinusProvider,
  DelphinusSigner,
  GetProvider,
} from "./provider";

export interface ChainInfo {
  chainHexId: string;
  chainName: string;
  nativeCurrency: {
    name: string;
    symbol: string;
    decimals: number;
  };
  rpcUrls: string[];
  blockExplorerUrls: string[];
}

export class DelphinusContract {
  private readonly contract: Contract;
  private readonly jsonInterface: InterfaceAbi;
  /**
   *
   * @param jsonInterface
   * This is the json interface of the contract.
   * @param contractAddress
   * This is the address of the contract.
   * @param signerOrProvider
   * If signer is provided, the contract will be connected to the signer as
   * If provider is provided, the contract will be read only.
   */
  constructor(
    contractAddress: string,
    jsonInterface: InterfaceAbi,
    signerOrProvider?: Signer | Provider
  ) {
    this.jsonInterface = jsonInterface;

    this.contract = new Contract(
      contractAddress,
      jsonInterface,
      signerOrProvider
    );
  }

  getWeb3Contract() {
    return this.contract;
  }

  getJsonInterface() {
    return this.jsonInterface;
  }

  // Subscribe to events emitted by the contract
  subscribeEvent<T>(eventName: string, cb: (event: T) => unknown) {
    return this.contract.on(eventName, cb);
  }

  async getPastEventsFrom(fromBlock: number) {
    return await this.contract.queryFilter("*", fromBlock);
  }

  async getPastEventsFromTo(fromBlock: number, toBlock: number) {
    return await this.contract.queryFilter("*", fromBlock, toBlock);
  }

  async getPastEventsFromSteped(
    fromBlock: number,
    toBlock: number,
    step: number
  ) {
    let pastEvents = [];
    let start = fromBlock;
    let end = 0;
    if (fromBlock > toBlock) {
      console.log("No New Blocks Found From:" + fromBlock);
      return { events: [], breakpoint: null };
    }
    if (step <= 0) {
      pastEvents.push(await this.getPastEventsFromTo(start, toBlock));
      end = toBlock;
      console.log("getEvents from", start, "to", end);
    } else {
      let count = 0;
      while (end < toBlock && count < 10) {
        end = start + step - 1 < toBlock ? start + step - 1 : toBlock;
        console.log("getEvents from", start, "to", end);
        let group = await this.getPastEventsFromTo(start, end);
        if (group.length != 0) {
          pastEvents.push(group);
        }
        start += step;
        count++;
      }
    }
    return { events: pastEvents, breakpoint: end };
  }
}

// Read only provider mode for node client (non-browser environment) when no private key is provided
export class DelphinusReadOnlyProvider extends DelphinusProvider<DelphinusBaseProvider> {
  constructor(providerUrl: string) {
    super(GetProvider(providerUrl));
  }
}

// Wallet provider is for node client (non-browser environment) with functionality to sign transactions
export class DelphinusWalletProvider extends DelphinusSigner<Wallet> {
  constructor(privateKey: string, provider: DelphinusBaseProvider) {
    super(new Wallet(privateKey, provider));
  }

  get provider() {
    // will never be null as we are passing in a provider in the constructor
    return this.signer.provider!;
  }

  // Simulate a call to a contract method on the current blockchain state
  async call(req: TransactionRequest) {
    return await this.signer.call(req);
  }
}

// extend window interface for ts to recognize ethereum
declare global {
  interface Window {
    ethereum?: Eip1193Provider;
  }
}

// BrowserProvider implementation is exclusively for browser wallets such as MetaMask which implements EIP-1193
export class DelphinusBrowserProvider extends DelphinusProvider<BrowserProvider> {
  constructor() {
    if (!window.ethereum) {
      throw "MetaMask not installed, Browser mode is not available.";
    }
    // https://eips.ethereum.org/EIPS/eip-1193#summary
    super(new BrowserProvider(window.ethereum));
  }

  async connect() {
    let address = (await this.provider.getSigner()).address;
    return address;
  }

  close() {
    this.provider.destroy();
  }

  async onAccountChange<T>(cb: (account: string) => T) {
    this.subscribeEvent("accountsChanged", cb);
  }

  async getNetworkId() {
    return (await this.provider.getNetwork()).chainId;
  }
  async getJsonRpcSigner(): Promise<JsonRpcSigner> {
    let signer = await this.provider.getSigner();
    return signer;
  }
  async getContractWithSigner(
    contractAddress: string,
    abi: InterfaceAbi
  ): Promise<DelphinusContract> {
    return new DelphinusContract(
      contractAddress,
      abi,
      await this.getJsonRpcSigner()
    );
  }

  async switchNet(chainInfo: ChainInfo) {
    let { chainHexId, chainName, nativeCurrency, rpcUrls, blockExplorerUrls } =
      chainInfo;
    let id = await this.getNetworkId();
    let idHex = "0x" + id.toString(16);
    console.log("switch chain", idHex, chainHexId);
    if (idHex != chainHexId) {
      try {
        await this.provider.send("wallet_switchEthereumChain", [
          { chainId: chainHexId },
        ]);
      } catch (e: any) {
        if (e.code == 4902) {
          try {
            await this.provider.send("wallet_addEthereumChain", [
              {
                chainId: chainHexId,
                chainName: chainName,
                rpcUrls: rpcUrls,
                nativeCurrency: nativeCurrency,
                blockExplorerUrls:
                  blockExplorerUrls.length > 0 ? blockExplorerUrls : null,
              },
            ]);

            await this.provider.send("wallet_switchEthereumChain", [
              { chainId: chainHexId },
            ]);
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
    return;
  }

  // Wrapper for personal_sign method
  async sign(message: string): Promise<string> {
    let signer = await this.provider.getSigner();
    return await signer.signMessage(message);
  }
}

export async function withBrowserProvider<T>(
  cb: (web3: DelphinusBrowserProvider) => Promise<T>
) {
  let provider = new DelphinusBrowserProvider();

  await provider.connect();
  try {
    return await cb(provider);
  } catch (e) {
    throw e;
  }
}
// For read-only purposes without private key, we can use a provider to read the blockchain state
export async function withReadOnlyProvider<T>(
  cb: (web3: DelphinusProvider<DelphinusBaseProvider>) => Promise<T>,
  providerUrl: string
) {
  let provider = new DelphinusReadOnlyProvider(providerUrl);
  try {
    return await cb(provider);
  } catch (e) {
    throw e;
  }
}

// For non browser mode, we need to provide a private key to sign transactions
// Provider is required to read the blockchain state
// Wrap ethers wallet implementation to provide a unified interface and necessary methods
export async function withDelphinusWalletProvider<T>(
  cb: (web3: DelphinusWalletProvider) => Promise<T>,
  provider: DelphinusBaseProvider,
  privateKey: string
) {
  let wallet = new DelphinusWalletProvider(privateKey, provider);
  try {
    return await cb(wallet);
  } catch (e) {
    throw e;
  }
}
