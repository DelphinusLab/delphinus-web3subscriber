class PromiseBinder {
  constructor() {
    this.actions = {snapshot:{}};
  }
  async bind (name, promise) {
    let p = promise;
    if (this.actions[name]) {
      for (var c in this.actions[name]) {
        p = p.on(c, this.actions[name][c]);
      }
    }
    let v = await p;
    return v;
  }
  snapshot (name) {
    if(this.actions.snapshot[name] != undefined) {
      this.actions.snapshot[name]();
    }
  }
  return (p) {
    var self = this;
    let promise = p();
    promise.when = (action, c, fn) => {
      if (self.actions[action] == undefined) {
        self.actions[action] = {};
      }
      self.actions[action][c] = fn;
      return promise;
    };
    return promise;
  }
}

module.exports = {
  PromiseBinder: PromiseBinder,
}
