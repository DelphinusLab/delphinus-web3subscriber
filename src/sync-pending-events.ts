import { Collection, Document } from "mongodb";
import { EventData } from "web3-eth-contract";
import { DelphinusContract, DelphinusWeb3, Web3ProviderMode } from "./client";
import { DelphinusHttpProvider } from "./provider";
import { DBHelper, withDBHelper } from "./dbhelper";
import { sendAlert } from "delphinus-slack-alert/src/index";
const SlackConfig = require("./slack-alert-config");

// TODO: replace any with real type
function getAbiEvents(abiJson: any) {
  let events: any = {};
  abiJson.forEach((t: any) => {
    if (t.type == "event") {
      events[t.name] = t;
    }
  });
  return events;
}

// TODO: replace any with real type
function buildEventValue(events: any, r: EventData) {
  let event = events[r.event];
  let v: any = {};
  event.inputs.forEach((i: any) => {
    v[i.name] = r.returnValues[i.name];
  });
  return v;
}

/* Mongo Db helper to track all the recorded events handled so far */
class EventDBHelper extends DBHelper {
  private infoCollection?: Collection<Document>;

  async getInfoCollection() {
    if (!this.infoCollection) {
      this.infoCollection = await this.getOrCreateEventCollection(
        "MetaInfoCollection"
      );
    }
    return this.infoCollection;
  }

  async getLastMonitorBlock() {
    let infoCollection = await this.getInfoCollection();

    let rs = await infoCollection.findOne({ name: "LastUpdatedBlock" });
    return rs === null ? 0 : rs.lastblock;
  }

  // TODO: replace any with real type
  async updateLastMonitorBlock(r: EventData, v: any) {
    let client = await this.getClient();
    let eventCollection = await this.getOrCreateEventCollection(r.event);
    let infoCollection = await this.getInfoCollection();

    await client.withSession(async (session) => {
      await session.withTransaction(async () => {
        await infoCollection.updateOne(
          { name: "LastUpdatedBlock" },
          { $set: { lastblock: r.blockNumber } },
          { upsert: true }
        );

        await eventCollection.insertOne({
          blockNumber: r.blockNumber,
          blockHash: r.blockHash,
          transactionHash: r.transactionHash,
          event: v,
        });
      });
    });
  }
}

export class EventTracker {
  private readonly web3: DelphinusWeb3;
  private readonly contract: DelphinusContract;
  private readonly address: string;
  private readonly dbUrl: string;
  private readonly dbName: string;

  // TODO: replace any with real type
  private readonly l1Events: any;

  constructor(
    networkId: string,
    dataJson: any,
    source: string,
    monitorAccount: string,
    mongodbUrl: string
  ) {
    let providerConfig = {
      provider: new DelphinusHttpProvider(source),
      monitorAccount: monitorAccount,
    };
    let web3 = new Web3ProviderMode(providerConfig);

    this.web3 = web3;
    this.l1Events = getAbiEvents(dataJson.abi);
    this.address = dataJson.networks[networkId].address;
    this.contract = web3.getContract(dataJson, this.address, monitorAccount);
    this.dbUrl = mongodbUrl;
    this.dbName = networkId + this.address;
  }

  private async syncPastEvents(
    handlers: (n: string, v: any, hash: string) => Promise<void>,
    db: EventDBHelper
  ) {
    let lastblock = await db.getLastMonitorBlock();
    console.log("sync from ", lastblock);
    try {
      let pastEvents = await this.contract.getPastEventsFrom(lastblock + 1);
      console.log("sync from ", lastblock, "done");
      for (let r of pastEvents) {
        console.log(
          "========================= Get L1 Event: %s ========================",
          r.event
        );
        console.log("blockNumber:", r.blockNumber);
        console.log("blockHash:", r.blockHash);
        console.log("transactionHash:", r.transactionHash);
        let e = buildEventValue(this.l1Events, r);
        await handlers(r.event, e, r.transactionHash);
        await db.updateLastMonitorBlock(r, e);
      }
    } catch (err) {
      sendAlert(err, SlackConfig, true);
    }
  }

  async syncEvents(
    handlers: (n: string, v: any, hash: string) => Promise<void>
  ) {
    await withDBHelper(
      EventDBHelper,
      this.dbUrl,
      this.dbName,
      async (dbhelper: EventDBHelper) => {
        await this.syncPastEvents(handlers, dbhelper);
      }
    );
  }

  // For debug
  async subscribePendingEvents() {
    //var subscription = this.web3.eth.subscribe('pendingTransactions',
    this.web3
      .web3Instance!.eth.subscribe("logs", { address: this.address })
      .on("data", (transaction: any) => {
        console.log(transaction);
      });
  }

  private async resetEventsInfo(db: EventDBHelper) {
    let infoCollection = await db.getInfoCollection();
    await infoCollection.deleteMany({ name: "LastUpdatedBlock" });
    // TODO: eventCollection should also be deleted?
    return true;
  }

  async resetEvents() {
    await withDBHelper(
      EventDBHelper,
      this.dbUrl,
      this.dbName,
      async (dbhelper: EventDBHelper) => {
        await this.resetEventsInfo(dbhelper);
      }
    );
  }

  async close() {
    await this.web3.close();
  }
}

export async function withEventTracker(
  networkId: string,
  dataJson: any,
  source: string,
  monitorAccount: string,
  mongodbUrl: string,
  cb: (eventTracker: EventTracker) => Promise<void>
) {
  let eventTracker = new EventTracker(
    networkId,
    dataJson,
    source,
    monitorAccount,
    mongodbUrl
  );

  try {
    await cb(eventTracker);
  } catch(e) {
    sendAlert(e, SlackConfig, true);
  } finally {
    await eventTracker.close();
  }
}
