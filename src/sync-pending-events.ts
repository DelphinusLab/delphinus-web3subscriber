import { Collection, Document } from "mongodb";
import { EventData } from "web3-eth-contract";
import { DelphinusContract, DelphinusWeb3, Web3ProviderMode } from "./client";
import { DelphinusHttpProvider } from "./provider";
import { DBHelper, withDBHelper } from "./dbhelper";
import Web3 from "web3";

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

  async updatelastCheckedBlockNumber(blockNumber:number){
    let infoCollection = await this.getInfoCollection();
    await infoCollection.updateOne(
      { name: "LastUpdatedBlock" },
      { $set: { lastblock: blockNumber } },
      { upsert: true }
    );
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
  private readonly source: string;
  private readonly eventsSyncStep: number;
  private readonly eventSyncStartingPoint: number;

  // TODO: replace any with real type
  private readonly l1Events: any;

  constructor(
    networkId: string,
    dataJson: any,
    source: string,
    monitorAccount: string,
    mongodbUrl: string,
    eventsSyncStep: number,
    eventSyncStartingPoint: number,
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
    this.source = source;
    this.eventSyncStartingPoint = eventSyncStartingPoint;
    const defaultStep = 0;
    if(eventsSyncStep == undefined || eventsSyncStep <= 0){
      this.eventsSyncStep = defaultStep;
    }else{
      this.eventsSyncStep = eventsSyncStep;
    }
  }

  private async syncPastEvents(
    handlers: (n: string, v: any, hash: string) => Promise<void>,
    db: EventDBHelper
  ) {
    let lastCheckedBlockNumber = await db.getLastMonitorBlock();
    let latestBlockNumber = await getLatestBlockNumber(this.source);
    let trueLatestBlockNumber = await getValidBlockNumber(this.source, lastCheckedBlockNumber, latestBlockNumber);
    if (trueLatestBlockNumber) {
      latestBlockNumber = trueLatestBlockNumber;
    }else {
      latestBlockNumber = lastCheckedBlockNumber;
    }
    if(lastCheckedBlockNumber < this.eventSyncStartingPoint) {
      lastCheckedBlockNumber = this.eventSyncStartingPoint;
      console.log("Chain Height Before Deployment: " + lastCheckedBlockNumber + " Is Used");
    }
    console.log("sync from ", lastCheckedBlockNumber + 1);
    try {
      let pastEvents = await this.contract.getPastEventsFromSteped(lastCheckedBlockNumber + 1, latestBlockNumber, this.eventsSyncStep);
      console.log("sync from ", lastCheckedBlockNumber + 1, "done");
      for(let group of pastEvents.events){
        for (let r of group) {
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
      }
      await db.updatelastCheckedBlockNumber(pastEvents.breakpoint);
    } catch (err) {
      console.log("%s", err);
      throw(err);
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
  eventsSyncStep: number,
  eventSyncStartingPoint: number,
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
  );

  try {
    await cb(eventTracker);
  } catch(e) {
    throw(e);
  } finally {
    await eventTracker.close();
  }
}

export const getweb3 = {
  getWeb3FromSource: (provider: string) => {
    const HttpProvider = "https";
    let web3: any
    if(provider.includes(HttpProvider)){
      web3 = new Web3(new Web3.providers.HttpProvider(provider));
      return web3
    }else {
      web3 = new Web3(new Web3.providers.WebsocketProvider(provider));
      return web3
    }
  }
}

async function getLatestBlockNumber(provider: string) {
  let latestBlockNumber: any
  let web3:Web3 = getweb3.getWeb3FromSource(provider);
  await web3.eth.getBlockNumber(function(err, result) {  
    if (err) {
      console.log(err);
      throw err;
    } else {
      latestBlockNumber = result;
    }
  });
  return latestBlockNumber
}

export async function getValidBlockNumber(provider: string, startPoint: number, endPoint: number) {
  if(endPoint < startPoint){
    console.log('ISSUE: LatestBlockNumber get from RpcSource is smaller than lastCheckedBlockNumber');
    return null
  }
  let web3:Web3 = getweb3.getWeb3FromSource(provider);
  let chekced =  false;
  let blockNumberIssue = false;
  while(!chekced){
    await web3.eth.getBlock(`${endPoint}`).then(async block => {
      if (block == null) {
        let [lowerBoundary, upperBoundary] = await binarySearchValidBlock(provider, startPoint, endPoint);
        startPoint = lowerBoundary;
        endPoint = upperBoundary;
        blockNumberIssue = true;
      }else {
        if (blockNumberIssue){
          console.log(`ISSUE: Cannot find actual blocks from block number: ${endPoint + 1}, the actual latestBlockNumber is: ${endPoint}`);
        }
        chekced = true;
      }
    })
  }
  return endPoint
}

export async function binarySearchValidBlock(provider: string, start: number, end: number){
  let web3:Web3 = getweb3.getWeb3FromSource(provider);
  let mid = Math.floor((start + end)/2);
  if (mid == start){
    return [mid, mid]
  }
  await web3.eth.getBlock(`${mid}`).then(midblock => {
    if (midblock != null){
      start = mid;
    }else{ 
      end = mid;
    }
  })
  return [start, end]
}