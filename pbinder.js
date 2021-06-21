class PromiseBinder {
  constructor() {
    this.actions = {snapshot:{}};
  }
  async bind (name, promise) {
    let p = promise;
    //console.log(name, this.actions[name]);
    //console.log(this.actions);
    if (this.actions[name]) {
      for (var c in this.actions[name]) {
        p = p.on(c, this.actions[name][c]);
      }
    }
    let v = await p;
    return v;
  }
  snapshot (name, func) {
    if(this.actions[snapshot][name] != undefined) {
      this.actions[snapshot][name]();
    }
  }
  return (p) {
    let promise = p();
    promise.when = (action, c, fn) => {
      if (this.actions[action] == undefined) {
        this.actions[action] = {};
      }
      this.actions[action][c] = fn;
      return promise;
    };
    return promise;
  }
}

module.exports = {
  PromiseBinder: PromiseBinder,
}
