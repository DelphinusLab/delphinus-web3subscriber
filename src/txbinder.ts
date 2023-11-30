import {
  Contract,
  JsonRpcProvider,
  TransactionReceipt,
  TransactionResponse,
  Wallet,
} from "ethers";

// custom event strings used to bind callbacks to promises
export type PromiseBinderEvents =
  | "transactionHash"
  | "transactionReceipt"
  | "error";

// Object which stores the callbacks for each Action name defined by the user

type PromiseBindings = Record<string, PromiseBinderCallbacks>;
type TransactionBindings = Record<string, () => Promise<TransactionResponse>>;

type TransactionHashCallback = (txHash: TransactionResponse | null) => void;
type ReceiptCallback = (receipt: TransactionReceipt | null) => void;
type ErrorCallback = (error: unknown | null) => void;

// Conditional type which returns the correct callback type for each event
type CallbackType<T extends PromiseBinderEvents> = T extends "transactionHash"
  ? TransactionHashCallback
  : T extends "transactionReceipt"
  ? ReceiptCallback
  : T extends "error"
  ? ErrorCallback
  : never;

type PromiseBinderCallbacks = {
  [Event in PromiseBinderEvents]?: CallbackType<Event>;
};

export interface PromiseBinderActions {
  bindings: PromiseBindings;
  transactionMethods: TransactionBindings;
  snapshot: Record<string, (args?: unknown) => void>;
}

export class TxBinder {
  actions: PromiseBinderActions;

  constructor() {
    this.actions = { bindings: {}, transactionMethods: {}, snapshot: {} };
  }

  // TODO: Allow binding the transaction to an action and executing later
  bind(name: string, txMethod: () => Promise<TransactionResponse>): TxBinder {
    // Bind a transaction method to an action name
    this.actions.transactionMethods[name] = txMethod;
    return this;
  }

  /**
   * Execute a transaction and handle the transactionHash, transactionReceipt and error event callbacks
   * @param name: the name of action
   * @param txMethod An ethers transaction method which returns a TransactionResponse
   * Overrides the txMethod passed to the bind() method
   * @returns
   */
  async execute(
    name: string,
    txMethod?: () => Promise<TransactionResponse>,
    options?: {
      confirmations?: number;
      timeout?: number;
    }
  ) {
    // If override tx method is provided, try to execute that instead
    try {
      let transaction = txMethod
        ? txMethod
        : this.actions.transactionMethods[name];
      const txResponse = await transaction();
      // If the transactionHash event has been registered, call the associated callback
      this.actions.bindings[name]?.transactionHash?.(txResponse);

      // Wait for the transaction to be confirmed
      const receipt = await txResponse.wait(
        options?.confirmations,
        options?.timeout
      );
      // If the confirmation event has been registered, call the associated callback
      this.actions.bindings[name]?.transactionReceipt?.(receipt);
      return receipt;
    } catch (error) {
      // If an error occurs, call the error callback
      this.actions.bindings[name]?.error?.(error);
      throw error;
    }
  }

  /**
   * invoke callback registed via
   * p.register_snapshot("snapshot", name, callback);
   * @param name the name of snapshot
   */
  snapshot(name: string) {
    if (this.actions.snapshot[name] != undefined) {
      this.actions.snapshot[name]();
    }
  }
  // Register a callback to be called when the snapshot event is emitted
  /**
   *
   * @param name the name of snapshot
   * @param callback
   */
  register_snapshot(name: string, callback: () => void) {
    this.actions.snapshot[name] = callback;
  }

  // Type safe overloads for the when method
  // Overload the when method for the 'transactionHash' event to provide type for callbacks
  when(
    action: string,
    event: "transactionHash",
    callback: TransactionHashCallback
  ): TxBinder;

  // Overload the when method for the 'transactionReceipt' event
  when(
    action: string,
    event: "transactionReceipt",
    callback: ReceiptCallback
  ): TxBinder;

  // Overload the when method for the 'error' event
  when(action: string, event: "error", callback: ErrorCallback): TxBinder;
  /**
   *
   * @param name the name of action
   * @param event the name of the transaction event to bind to
   * @param callback the callback to be called when the event is emitted
   *
   *  This is overloaded based on the event parameter to provide type safety for the callback parameter
   */
  when(
    name: string,
    event: PromiseBinderEvents,
    //TODO: type should be inferred based on the event parameter, currently handled by overloads which is ok but not ideal
    callback: (...args: any[]) => void
  ): TxBinder {
    if (!this.actions.bindings[name]) {
      this.actions.bindings[name] = {
        transactionHash: undefined,
        transactionReceipt: undefined,
        error: undefined,
      };
    }
    this.actions.bindings[name][event] = callback;
    return this;
  }
}

async function ExampleBinder() {
  // create a wallet and provider by supplying a private key and provider url
  let provider = new JsonRpcProvider("https://infura or alchemy url");
  let wallet = new Wallet("0x eth private key", provider);
  let contract = new Contract("0x contract address", [], wallet);
  const binder = new TxBinder();
  // Example of how to use the when method

  // Bind the transaction method to an action name
  binder.bind("Approve", () => {
    return contract.approve("0x1", 1);
  });

  // Bind some callbacks to the approve action using the when method
  binder
    .when("Approve", "transactionHash", (txResponse) => {
      console.log("transactionHash", txResponse);
    })
    .when("Approve", "transactionReceipt", (receipt) => {
      console.log("transactionReceipt", receipt);
    })
    .when("Approve", "error", (error) => {
      console.log("error", error);
    });

  // Bind some callbacks to the deposit action
  binder
    .when("Deposit", "transactionHash", async (txResponse) => {
      console.log("transactionHash", txResponse);
    })
    .when("Deposit", "transactionReceipt", (receipt) => {
      console.log("transactionReceipt", receipt);
    })
    .when("Deposit", "error", (error) => {
      console.log("error", error);
    });

  // Override the previous provided transaction method in the bind() method
  await binder.execute("approve", () => {
    // execute some transaction which returns a TransactionResponse
    return contract.approve("0x1", 1);
  });

  await binder.execute("deposit", () => {
    return wallet.sendTransaction({
      to: "0x1",
      value: 1,
    });
  });

  // bind a callback to the snapshot event
  binder.register_snapshot("deposit", () => {
    console.log("deposit snapshot");
  });

  // execute the snapshot
  binder.snapshot("deposit");
}
