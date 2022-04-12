export class PromiseBinder {
  // TODO: replace any with real type
  actions: any;

  constructor() {
    this.actions = { snapshot: {} };
  }

  /**
   * Bind an action to the sending promise of the smart contract
   * @param name: the name of action
   * @param promise A promise which sends a transaction to the smart contract
   * @returns
   */
  async bind(name: string, promise: any) {
    let p = promise;
    // If the event has been registed via 'when' method
    if (this.actions[name]) {
      for (let c in this.actions[name]) {
        p = p.on(c, this.actions[name][c]);
      }
    }
    return await p;
  }

  /**
   * invoke callback registed via
   * p.when("snapshot", name, callback);
   * @param name the name of snapshot
   */
  snapshot(name: string) {
    if (this.actions.snapshot[name] != undefined) {
      this.actions.snapshot[name]();
    }
  }

  /**
   * return a promise which supports register callback via when method.
   * @param p
   * @returns
   */
  return(p: () => any) {
    var self = this;
    let promise: any = (new Promise((f) => setTimeout(f, 2000))).then(()=>p());
    /*
     * FIXME: promise.when may happen after actions to be bind.
     * Current we just add a 2 second delay, which means we assume the .when register should be done in 2 seconds after the return() called.
     */
    promise.when = (action: string, c: string, fn: (_: any) => void) => {
      if (self.actions[action] == undefined) {
        self.actions[action] = {};
      }
      self.actions[action][c] = fn;
      return promise;
    };
    return promise;
  }
}
