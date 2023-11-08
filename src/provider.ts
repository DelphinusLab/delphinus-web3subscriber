import {
  InterfaceAbi,
  AbstractProvider,
  WebSocketProvider,
  JsonRpcProvider,
  AbstractSigner,
} from "ethers";
import { DelphinusContract } from "./client";

export abstract class DelphinusProvider<T extends AbstractProvider> {
  readonly provider: T;
  constructor(provider: T) {
    this.provider = provider;
  }
  // Subscribe to provider level events such as a new block
  async subscribeEvent<T>(eventName: string, cb: (event: T) => unknown) {
    return this.provider.on(eventName, cb);
  }
  // Read only version of contract
  getContractWithoutSigner(contractAddress: string, abi: InterfaceAbi) {
    return new DelphinusContract(contractAddress, abi, this.provider);
  }
}

// Signer class is to sign transactions from a node client (non-browser environment)
// Requires private key
export abstract class DelphinusSigner<T extends AbstractSigner> {
  readonly signer: T;
  constructor(signer: T) {
    this.signer = signer;
  }

  get provider() {
    return this.signer.provider;
  }
  // Subscribe to provider level events such as a new block
  async subscribeEvent<T>(eventName: string, cb: (event: T) => unknown) {
    return this.provider?.on(eventName, cb);
  }

  // Contract instance with signer attached
  getContractWithSigner(
    contractAddress: string,
    abi: InterfaceAbi
  ): DelphinusContract {
    return new DelphinusContract(contractAddress, abi, this.signer);
  }
}

// DelphinusBaseProvider is a type alias for WebSocketProvider and JsonRpcProvider
export type DelphinusBaseProvider = WebSocketProvider | JsonRpcProvider;

// GetProvider is a helper function to get a provider from a url
export function GetProvider(providerUrl: string) {
  if (providerUrl.startsWith("ws")) {
    return new WebSocketProvider(providerUrl);
  } else {
    return new JsonRpcProvider(providerUrl);
  }
}
