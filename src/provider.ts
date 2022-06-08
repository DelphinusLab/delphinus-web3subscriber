import { HttpProvider, WebsocketProvider, provider } from "web3-core";
import HDWalletProvider from "@truffle/hdwallet-provider";
const Web3HttpProvider = require("web3-providers-http");
const Web3WsProvider = require("web3-providers-ws");

export abstract class DelphinusProvider {
  provider: provider;

  constructor(prov: provider) {
    this.provider = prov;
  }

  abstract close(): Promise<void>;
}

export class DelphinusHttpProvider extends DelphinusProvider {
  constructor(uri: string) {
    super(new Web3HttpProvider(uri, DelphinusHttpProvider.getDefaultOptions()));
  }

  static getDefaultOptions() {
    return {
      keepAlive: false,
      timeout: 20000, // milliseconds,
      withCredentials: false,
    };
  }

  async close() {
    (this.provider as HttpProvider).disconnect();
  }
}

export class DelphinusHDWalletProvider extends DelphinusProvider {
  constructor(privateKey: string, url: string) {
    super(
      new HDWalletProvider({
        privateKeys: [privateKey],
        providerOrUrl: url,
        shareNonce: false,
      })
    );

    // TODO: Exit a process is not appropriate since it's a lib!
    (this.provider as HDWalletProvider).engine.on("error", (err: any) => {
      console.log(err);
      console.log(this.provider);

      console.log("stopping HDWalletProvider...");
      this.close();
      throw err;

      //process.exit(-1);
    });
  }

  async close() {
    await (this.provider as any).engine.stop();
  }
}

export class DelphinusWsProvider extends DelphinusProvider {
  constructor(uri: string) {
    super(new Web3WsProvider(uri, DelphinusWsProvider.getDefaultOption()));

    // TODO: Exit a process is not appropriate since it's a lib!
    (this.provider as WebsocketProvider).connection.onerror = () => {
      console.info("websocket connection error, process exiting...");
      process.exit(-1);
    };
  }

  static getDefaultOption() {
    return {
      timeout: 30000, // ms

      clientConfig: {
        // Useful if requests are large
        maxReceivedFrameSize: 100000000, // bytes - default: 1MiB
        maxReceivedMessageSize: 100000000, // bytes - default: 8MiB

        // Useful to keep a connection alive
        keepalive: true,
        keepaliveInterval: 6000, // ms
      },

      // Enable auto reconnection
      reconnect: {
        auto: false,
        delay: 5000, // ms
        maxAttempts: 5,
        onTimeout: true,
      },
    };
  }

  async close() {
    await (this.provider as WebsocketProvider).connection.close();
  }
}
