const Mongo = require('mongodb');
const Web3 = require("web3")
const FileSys = require("fs")

const Web3WsProvider = require('web3-providers-ws');

const new_promise = (v) => {
  let r = new Promise((resolve,reject) => {resolve(1);});
  return r;
}

const options = {
    timeout: 30000, // ms

     clientConfig: {
      // Useful if requests are large
      maxReceivedFrameSize: 100000000,   // bytes - default: 1MiB
      maxReceivedMessageSize: 100000000, // bytes - default: 8MiB

      // Useful to keep a connection alive
      keepalive: true,
      keepaliveInterval: 6000 // ms
    },

    // Enable auto reconnection
    reconnect: {
        auto: true,
        delay: 5000, // ms
        maxAttempts: 5,
        onTimeout: true
    }
};

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

class DBHelper {
  /* Mongo Db helper to track all the recorded events handled so far */
  constructor(db) {
    this.db = db;
  }

  async init() {
    this.info_collection = await get_info_collection(this.db);
  }

  async get_last_monitor_block() {
    let rs = await this.info_collection.find({name:"LastUpdatedBlock"}).toArray();
    if (rs.length == 0) {
      return 0;
    }
    else {
      return(rs[0].lastblock);
    }
  }

  async update_last_monitor_block(r, v) {
    await this.info_collection.updateOne(
      {name:"LastUpdatedBlock"},
      {$set:{lastblock:r.blockNumber}},
      {upsert:true}
    );
    let event_collection = await query_event_collection(this.db, r.event);
    await event_collection.insertOne({
      blockNumber: r.blockNumber,
      blockHash: r.blockHash,
      transactionHash: r.transactionHash,
      event: v
    });
  }

  build_event_value(events, r) {
    let event = events[r.event];
    let v = {};
    event.inputs.forEach(i => {
      v[i.name] = r.returnValues[i.name];
    });
    return v;
  }
}

class EventTracker {
  constructor(network_id, data_json, config, handlers) {

    this.init_provider = () => {
        let provider = new Web3WsProvider(config.ws_source, options);
        provider.connection.onopen = () => {
            console.info("Event Tracker Started");
        };

        provider.connection.onerror = function() {
           console.info("connection error");
        };

        provider.connection.onclose = function() {
           console.info("connection close");
        };
        return provider;
    };

    let provider = this.init_provider();
    let web3 = new Web3(provider);
    this.provider = provider;
    this.config = config;
    this.web3 = web3;

    this.abi_json = data_json.abi;
    this.events = get_abi_events(this.abi_json);
    this.address = data_json.networks[network_id].address;
    this.network_id = network_id;
    this.contract = new web3.eth.Contract(this.abi_json, this.address, {
      from:config.monitor_account
    });
    this.handlers = handlers;
    console.log(this.handlers);
  }

  get_db_url () {
    let r = this.config.mongodb_url + "/" + this.network_id + this.address;
    return r;
  }

  async sync_past_events(db) {
    let lastblock = await db.get_last_monitor_block();
    console.log ("sync from ", lastblock);
    let past_events = await this.contract.getPastEvents("allEvents", {
        fromBlock:lastblock + 1
        //fromBlock:"latest"
        //, toBlock:"latest"
    });
    for (var r of past_events) {
      console.log("========================= Get Event: %s ========================", r.event);
      console.log("blockNumber:", r.blockNumber);
      console.log("blockHash:", r.blockHash);
      console.log("transactionHash:", r.transactionHash);
      let e = db.build_event_value(this.events, r);
      console.log(r.event);
      await this.handlers(r.event, e, r.transactionHash);
      await db.update_last_monitor_block(r,e);
    };
  }

  async subscribe_event (db) {
    let lastblock = await db.get_last_monitor_block();
    console.log ("monitor from %s", lastblock);
    let p = new_promise(1);
    let r = this.contract.events.allEvents(
        {fromBlock:lastblock}
    );
    const g = async (r) => {
      console.log("========================= Get Event: %s ========================", r.event);
      console.log("blockNumber:", r.blockNumber);
      console.log("blockHash:", r.blockHash);
      console.log("transactionHash:", r.transactionHash);
      let e = db.build_event_value(this.events, r);
      await this.handlers(r.event, e, r.transactionHash);
      await db.update_last_monitor_block(r, e);
    };
    r.on("connected", subscribe_id => {
      console.log("subscribe id:", subscribe_id);
    })
    .on('data', (r) => {
      p = p.then(() => g(r));
    });
    await r;
  }

  async sync_events () {
    let url = this.get_db_url();
    let db = await Mongo.MongoClient.connect(url, {useUnifiedTopology: true});
    let dbhelper = new DBHelper(db.db());
    await dbhelper.init();
    await this.sync_past_events(dbhelper);
    console.log("event subscribed");
    return true;
  }

  async subscribe_events () {
    let url = this.get_db_url();
    let db = await Mongo.MongoClient.connect(url, {useUnifiedTopology: true});
    let dbhelper = new DBHelper(db.db());
    await dbhelper.init();
    let _this = this;
    this.heart_beat = setInterval(()=> {
        if (_this.provider.connection.readyState == 1) {
            _this.provider.connection.send('HeartBeat');
            console.info("HeartBeat Sent");
        } else {
            console.info("Connection Not Ready");
            console.info("Reconnecting ...");
            _this.provider.connection.close();
            _this.provider = _this.init_provider();
            _this.web3.eth.clearSubscriptions();
            _this.web3.setProvider(_this.provider);
            _this.subscribe_event (dbhelper);
        }
    }, 50000);
    console.log("event subscribed");
    this.subscribe_event (dbhelper);
    return true;
  }

  async polling(db) {
    try {
      await this.sync_past_events(db);
      await setTimeout(() => {
        console.log("Polling ...");
        this.polling(db);
      }, 5000);
    } catch (e) {
      console.log("Sync Event Error:");
      console.log(e.message);
      console.info("Reconnecting ...");
      this.provider.connection.close();
      this.provider = this.init_provider();
      this.web3.eth.clearSubscriptions();
      this.web3.setProvider(this.provider);
      await setTimeout(() => {
        console.log("Polling ...");
        this.polling(db);
      }, 5000);
    }
  }

  async sync_events() {
    let url = this.get_db_url();
    let db = await Mongo.MongoClient.connect(url, {useUnifiedTopology: true});
    let dbhelper = new DBHelper(db.db());
    await dbhelper.init();
    await this.polling(dbhelper);
  }

  async subscribe_pending_events() {
    //var subscription = this.web3.eth.subscribe('pendingTransactions',
    var subscription = this.web3.eth.subscribe('logs',
      {address: this.address},
    )
    .on("data", function(transaction) {
      console.log(transaction);
    });
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
