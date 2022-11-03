import { MongoClient, Db } from "mongodb";

export class DBHelper {
  private readonly url: string;
  private readonly name: string;
  private client?: MongoClient;
  private db?: Db;

  constructor(url: string, n: string) {
    this.url = url;
    this.name = n;
  }

  async connect() {
    this.client = await MongoClient.connect(this.url);
    this.db = this.client.db(this.name);
  }

  protected getDb() {
    if (this.db === undefined) {
      throw new Error("db was not initialized");
    }

    return this.db;
  }

  protected getClient() {
    if (this.client === undefined) {
      throw new Error("db was not initialized");
    }

    return this.client;
  }

  async close() {
    await this.client?.close();
  }

  protected async getOrCreateEventCollection(eventName: string, index?: any) {
    let db = this.getDb();
    let collections = await db.listCollections({ name: eventName }).toArray();

    if (collections.length == 0) {
      console.log("Init collection: ", eventName);
      let c = await db.createCollection(eventName);
      if (index !== undefined) {
          c.createIndex(index, {unique: true});
      }
      return c;
    } else {
      return db.collection(eventName);
    }
  }
}

type AConstructorTypeOf<T> = new (...args: any[]) => T;

export async function withDBHelper<T extends DBHelper, R>(
  Ctor: AConstructorTypeOf<T>,
  uri: string,
  n: string,
  cb: (db: T) => Promise<R>
) {
  let db = new Ctor(uri, n);
  try {
    await db.connect();
  } catch (e) {
    console.log(e);
    console.log("failed to connect with db, DBHelper exiting...");
    throw e;
  }

  try {
    return await cb(db);
  } finally {
    await db.close();
  }
}
