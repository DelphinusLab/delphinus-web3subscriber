const Mongo = require('mongodb');
const Web3 = require("web3")
const FileSys = require("fs")

function get_abi_events(abi_json) {
  let events = {};
  abi_json.forEach(t => {
    if (t.type=="event") {
      events[t.name] = t;
    }
  });
  return events;
}

async function get_info_collection(db) {
  let collections = await db.listCollections({name:"MetaInfoCollection"}).toArray();
  if (collections.length == 0) {
    console.log("Initial MetaInfoCollection");
    let c = await db.createCollection("MetaInfoCollection");
    return c;
  } else {
    let c = db.collection("MetaInfoCollection");
    return c;
  }
}

async function query_event_collection(db, event_name) {
  let collections = await db.listCollections({name:event_name}).toArray();
  if (collections.length == 0) {
    console.log("Init collection: ", event_name);
    let c = await db.createCollection(event_name);
    return c;
  } else {
    let c = db.collection(event_name);
    return c;
  }
}



async function get_last_monitor_block(info_collection) {
  let rs = await info_collection.find({name:"LastUpdatedBlock"}).toArray();
  if (rs.length == 0) {return 0;}
  else {
    console.log(rs[0]);
    return(rs[0].lastblock);
  }
}

async function update_last_monitor_block(info_collection, events, r) {
  let event = events[r.event];
  let result = await info_collection.updateOne({name:"LastUpdatedBlock"},
    {$set:{lastblock:r.blockNumber}},
    {upsert:true});
  let v = {};
  event.inputs.forEach(i => {
    v[i.name] = r.returnValues[i.name];
  });
  return v;
}

async function foldM (as, init, f) {
  let c = init;
  for (i=0;i<as.length;i++) {
    c = await f(c, as[i]);
  }
  return c;
}

class EventTracker {
  constructor(network_id, data_json, config, handlers) {
    this.config = config;
    let web3 = new Web3(config.web3_source);
    this.abi_json = data_json.abi;
    this.events = get_abi_events(this.abi_json);
    this.address = data_json.networks[network_id].address;
    this.network_id = network_id;
    this.contract = new web3.eth.Contract(this.abi_json, this.address, {
      from:config.monitor_account
    });
    this.handlers = handlers;
  }

  get_db_url () {
    let r = this.config.mongodb_url + "/" + this.network_id + this.address;
    return r;
  }

  async sync_past_events(db) {
    let info_collection = await get_info_collection(db);
    let lastblock = await get_last_monitor_block(info_collection);
    console.log ("monitor %s from %s", event.name, lastblock);
    let past_events = await this.contract.getPastEvents("allEvents", {
        fromBlock:lastblock, toBlock:"latest"
    });
    return await foldM (past_events, [], async (acc, r) => {
      let e = await update_last_monitor_block(info_collection, this.events, r);
      acc.push(this.handlers(event.name, e));
      return (acc);
    });
  }

  async subscribe_event (db) {
    let info_collection = await get_info_collection(db);
    let lastblock = await get_last_monitor_block(info_collection);
    console.log ("monitor from %s", lastblock);
    let r = await this.contract.events.allEvents(
        {fromBlock:lastblock}
    );
    r.on("connected", subscribe_id => {
      console.log(subscribe_id);
    })
    .on('data', async (r) => {
      console.log("blockHash:", r.blockHash);
      console.log("transactionHash:", r.transactionHash);
      console.log("subscribe event: %s", r.event);
      let e = await update_last_monitor_block(info_collection, this.events, r);
      this.handlers(r.event, e);
    });
    return true;
  }

  async sync_events () {
    let url = this.get_db_url();
    let db = await Mongo.MongoClient.connect(url, {useUnifiedTopology: true});
    let ps = this.sync_past_events(db);
    return Promise.all(ps);
  }

  async subscribe_events () {
    let url = this.get_db_url();
    let db = await Mongo.MongoClient.connect(url, {useUnifiedTopology: true});
    this.subscribe_event (db.db());
    return true;
  }

  async reset_events_info (db) {
    let info_collection = await get_info_collection(db);
    await info_collection.deleteMany({name:"LastUpdatedBlock"});
    return true;
  }

  async reset_events () {
    let url = this.get_db_url();
    let db = await Mongo.MongoClient.connect(url, {useUnifiedTopology: true});
    return (await this.reset_events_info(db.db(), this.events));
  }
}

module.exports = {
  EventTracker: EventTracker
}
