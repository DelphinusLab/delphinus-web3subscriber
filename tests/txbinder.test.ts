import {
  JsonRpcProvider,
  TransactionReceipt,
  Wallet,
  parseEther,
} from "ethers";
import { TxBinder } from "../src/txbinder";

const mockTransactionReceipt = {
  to: "0x123",
  from: "0x789",
  contractAddress: null,
  hash: "0xmockTransactionHash",
} as any as TransactionReceipt;

jest.mock("ethers", () => {
  const originalModule = jest.requireActual("ethers");

  // Mock the Wallet class as we don't want to send real transactions
  return {
    ...originalModule,
    Wallet: jest.fn().mockImplementation(() => ({
      sendTransaction: jest.fn(() =>
        Promise.resolve({
          hash: "0xmockTransactionHash",
          wait: jest.fn(() => Promise.resolve(mockTransactionReceipt)),
        })
      ),
    })),
  };
});

// Test TxBinder class

describe("TxBinder", () => {
  let txBinder: TxBinder;
  // Hardhat local node
  const provider = new JsonRpcProvider("http://127.0.0.1:8545");

  // Known private keys for hardhat testing
  const wallet_1 = new Wallet(
    "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
    provider
  );

  const wallet_2 = new Wallet(
    "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d"
  );

  const mockAction = "mockAction";
  const errorAction = "errorAction";

  beforeEach(() => {
    txBinder = new TxBinder();
    txBinder.bind(mockAction, () => {
      // Test transaction to send 1 wei from wallet_1 to wallet_2
      return wallet_1.sendTransaction({
        to: wallet_2.address,
        value: parseEther("1"), // 1 ether
      });
    });

    txBinder.bind(errorAction, async () => {
      // Test transaction to send 1 wei from wallet_1 to wallet_2
      return wallet_1.sendTransaction({
        to: wallet_2.address,
        value: parseEther("1"), // 1 ether
      });
    });
  });

  describe("snapshot callbacks", () => {
    it("should call the callback registered with the snapshot name", () => {
      let callback = jest.fn();
      txBinder.register_snapshot("test", callback);
      txBinder.snapshot("test");
      expect(callback).toBeCalled();
    });

    it("should not call the callback registered with a different snapshot name", () => {
      let callback = jest.fn();
      txBinder.register_snapshot("test", callback);
      txBinder.snapshot("test2");
      expect(callback).not.toBeCalled();
    });
  });

  describe("when callbacks", () => {
    it("should call the callback registered with the transactionHash event", async () => {
      let callback = jest.fn();

      txBinder.when(mockAction, "transactionHash", callback);

      await txBinder.execute(mockAction);
      expect(callback).toBeCalled();
    });

    it("should call the callback registered with the transactionReceipt event", async () => {
      let callback = jest.fn();
      txBinder.when(mockAction, "transactionReceipt", callback);
      await txBinder.execute(mockAction);
      expect(callback).toBeCalled();
    });

    it("should call the callback registered with the error event", async () => {
      // Mock the sendTransaction function from ethers lib but throw an error
      // instead of returning a TransactionResponse
      (wallet_1.sendTransaction as jest.Mock).mockImplementationOnce(() => {
        throw new Error("Mock error");
      });
      let callback = jest.fn();
      txBinder.when(errorAction, "error", callback);
      try {
        await txBinder.execute(errorAction);
      } catch (e) {
        expect(callback).toBeCalled();
      }
    });
  });
});
