import { Collection, Document } from "mongodb";
import { DelphinusContract } from "./client";
import { DelphinusReadOnlyConnector } from "./provider";
import { DBHelper, withDBHelper } from "./dbhelper";
import { EventLog, Log } from "ethers";
import { GetBaseProvider } from "./provider";

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
function buildEventValue(events: any, r: EventLog | Log) {
  // let event = events[r];
  let v: any = {};
  // event.inputs.forEach((i: any) => {
  //   v[i.name] = r.returnValues[i.name];
  // });
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

  async updatelastCheckedBlockNumber(blockNumber: number) {
    let infoCollection = await this.getInfoCollection();
    await infoCollection.updateOne(
      { name: "LastUpdatedBlock" },
      { $set: { lastblock: blockNumber } },
      { upsert: true }
    );
  }

  // TODO: replace any with real type
  async updateLastMonitorBlock(r: EventLog, v: any) {
    let client = await this.getClient();
    let eventCollection = await this.getOrCreateEventCollection(r.eventName);
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
  private readonly provider: DelphinusReadOnlyConnector;
  private readonly contract: DelphinusContract;
  private readonly contractAddress: string;
  private readonly dbUrl: string;
  private readonly dbName: string;
  private readonly providerUrl: string;
  private readonly eventsSyncStep: number;
  private readonly eventSyncStartingPoint: number;
  private readonly bufferBlocks: number;

  // TODO: replace any with real type
  private readonly l1Events: any;

  constructor(
    networkId: string,
    dataJson: any,
    providerUrl: string,
    monitorAccount: string,
    mongodbUrl: string,
    eventsSyncStep: number,
    eventSyncStartingPoint: number,
    bufferBlocks: number
  ) {
    this.provider = new DelphinusReadOnlyConnector(providerUrl);
    this.l1Events = getAbiEvents(dataJson.abi);
    this.contractAddress = dataJson.networks[networkId].address;
    this.contract = this.provider.getContractWithoutSigner(
      this.contractAddress,
      dataJson.abi
    );
    this.dbUrl = mongodbUrl;
    this.dbName = networkId + this.contractAddress;
    this.providerUrl = providerUrl;
    this.eventSyncStartingPoint = eventSyncStartingPoint;
    this.bufferBlocks = bufferBlocks;
    const defaultStep = 0;
    if (eventsSyncStep == undefined || eventsSyncStep <= 0) {
      this.eventsSyncStep = defaultStep;
    } else {
      this.eventsSyncStep = eventsSyncStep;
    }
  }

  private async syncPastEvents(
    handlers: (n: string, v: any, hash: string) => Promise<void>,
    db: EventDBHelper
  ) {
    let lastCheckedBlockNumber = await db.getLastMonitorBlock();
    if (lastCheckedBlockNumber < this.eventSyncStartingPoint) {
      lastCheckedBlockNumber = this.eventSyncStartingPoint;
      console.log(
        "Chain Height Before Deployment: " + lastCheckedBlockNumber + " Is Used"
      );
    }
    let latestBlockNumber = await getLatestBlockNumberFromSource(
      this.providerUrl
    );
    let trueLatestBlockNumber = await getTrueLatestBlockNumber(
      this.providerUrl,
      lastCheckedBlockNumber,
      latestBlockNumber
    );
    let reliableBlockNumber = await getReliableBlockNumber(
      trueLatestBlockNumber,
      lastCheckedBlockNumber,
      this.bufferBlocks
    );
    console.log("sync from ", lastCheckedBlockNumber + 1);
    try {
      let pastEvents = await this.contract.getPastEventsFromSteped(
        lastCheckedBlockNumber + 1,
        reliableBlockNumber,
        this.eventsSyncStep
      );
      console.log("sync from ", lastCheckedBlockNumber + 1, "done");
      for (let group of pastEvents.events) {
        for (let r of group) {
          console.log(
            "========================= Get L1 Event: %s ========================",
            r
          );
          console.log("blockNumber:", r.blockNumber);
          console.log("blockHash:", r.blockHash);
          console.log("transactionHash:", r.transactionHash);
          let e = buildEventValue(this.l1Events, r);
          // TODO: check what handlers is supposed to do
          await handlers(r.topics[0], e, r.transactionHash);
          await db.updateLastMonitorBlock(r as EventLog, e);
        }
      }
      if (pastEvents.breakpoint) {
        await db.updatelastCheckedBlockNumber(pastEvents.breakpoint);
      }
    } catch (err) {
      console.log("%s", err);
      throw err;
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
    // TODO: Check what the function is supposed to track

    let contract = this.provider.getContractWithoutSigner(
      this.contractAddress,
      this.l1Events
    );
    contract.subscribeEvent("*", (event: any) => {
      console.log(event);
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
}

export async function withEventTracker(
  networkId: string,
  dataJson: any,
  source: string,
  monitorAccount: string,
  mongodbUrl: string,
  eventsSyncStep: number,
  eventSyncStartingPoint: number,
  bufferBlocks: number,
  cb: (eventTracker: EventTracker) => Promise<void>
) {
  let eventTracker = new EventTracker(
    networkId,
    dataJson,
    source,
    monitorAccount,
    mongodbUrl,
    eventsSyncStep,
    eventSyncStartingPoint,
    bufferBlocks
  );

  try {
    await cb(eventTracker);
  } catch (e) {
    throw e;
  } finally {
    //await eventTracker.close();
  }
}

export async function getReliableBlockNumber(
  trueLatestBlockNumber: any,
  lastCheckedBlockNumber: number,
  bufferBlocks: number
) {
  let latestBlockNumber = lastCheckedBlockNumber;
  if (trueLatestBlockNumber) {
    latestBlockNumber =
      trueLatestBlockNumber - bufferBlocks > 0
        ? trueLatestBlockNumber - bufferBlocks
        : lastCheckedBlockNumber;
  }
  return latestBlockNumber;
}

async function getLatestBlockNumberFromSource(providerUrl: string) {
  let provider = GetBaseProvider(providerUrl);
  try {
    return await provider.getBlockNumber();
  } catch (e) {
    throw e;
  }
}

export async function getTrueLatestBlockNumber(
  providerUrl: string,
  startPoint: number,
  endPoint: number
) {
  if (endPoint < startPoint) {
    console.log(
      "ISSUE: LatestBlockNumber get from RpcSource is smaller than lastCheckedBlockNumber"
    );
    return null;
  }
  let provider = GetBaseProvider(providerUrl);
  let chekced = false;
  let blockNumberIssue = false;
  while (!chekced) {
    await provider.getBlock(`${endPoint}`).then(async (block) => {
      if (block == null) {
        let [lowerBoundary, upperBoundary] = await binarySearchValidBlock(
          providerUrl,
          startPoint,
          endPoint
        );
        startPoint = lowerBoundary;
        endPoint = upperBoundary;
        blockNumberIssue = true;
      } else {
        if (blockNumberIssue) {
          console.log(
            `ISSUE: Cannot find actual blocks from block number: ${
              endPoint + 1
            }, the actual latestBlockNumber is: ${endPoint}`
          );
        }
        chekced = true;
      }
    });
  }
  return endPoint;
}

export async function binarySearchValidBlock(
  providerUrl: string,
  start: number,
  end: number
) {
  let provider = GetBaseProvider(providerUrl);
  let mid = Math.floor((start + end) / 2);
  if (mid == start) {
    return [mid, mid];
  }
  await provider.getBlock(`${mid}`).then((midblock) => {
    if (midblock != null) {
      start = mid;
    } else {
      end = mid;
    }
  });
  return [start, end];
}
