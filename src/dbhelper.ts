import { MongoClient, Db } from "mongodb";

export class DBHelper {
  private readonly url: string;
  private client?: MongoClient;
  private db?: Db;

  constructor(url: string) {
    this.url = url;
  }

  async connect() {
    this.client = await MongoClient.connect(this.url);
    this.db = this.client.db();
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

  protected async getOrCreateEventCollection(eventName: string) {
    let db = this.getDb();
    let collections = await db.listCollections({ name: eventName }).toArray();

    if (collections.length == 0) {
      console.log("Init collection: ", eventName);
      return await db.createCollection(eventName);
    } else {
      return db.collection(eventName);
    }
  }
}

type AConstructorTypeOf<T> = new (...args: any[]) => T;

export async function withDBHelper<T extends DBHelper, R>(
  Ctor: AConstructorTypeOf<T>,
  uri: string,
  cb: (db: T) => Promise<R>
) {
  let db = new Ctor(uri);
  try {
    await db.connect();
  } catch (e) {
    console.log(e);
    console.log("failed to connect with db, DBHelper exiting...");
    return;
  }

  try {
    return await cb(db);
  } finally {
    await db.close();
  }
}
