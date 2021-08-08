const Web3 = require("web3")

var web3instance = undefined;
var web3monitors = {};

/* There are two mode, the client mode requires a browser client
 * and the monitor mode only requires the provider in config
 */
const initWeb3 = async (config, client_mode) => {
  if (client_mode) {
    if (web3instance != undefined) {
      return web3instance;
    }
    // We are in client mode
    if (window.ethereum) {
      await window.ethereum.send('eth_requestAccounts');
      web3instance = new Web3(window.ethereum);
      return web3instance;
    }
    throw "ClientNotHasEthereumPlugin";
  } else {
    if (web3monitors[config.device_id] == undefined) {
      let provider = config.provider ();
      let w = new Web3(provider);
      web3monitors[config.device_id] = w;
    }
    return web3monitors[config.device_id];
  }
}

async function getDefaultAccount(web3, config) {
  let account = "";
  let accounts = await web3.eth.getAccounts();
  if (accounts.length != 0) {
    account = accounts[0];
  } else {
    account = config.monitor_account;
  }
  return account;
}

async function getAccountInfo(config, client_mode) {
  const web3 = await initWeb3(config, client_mode);
  const address = await getDefaultAccount(web3, config);
  const id = await web3.eth.net.getId();
  console.log("account", address);
  return {address: address, chainId:id, web3: web3};
}

function subscribeAccountChange(client_mode, cb) {
  if (client_mode) {
    window.ethereum.on('accountsChanged', function (accounts) {
      cb(accounts[0]);
    })
  };
}

function getContract(web3, config, contract_info, account) {
  let abi_json = contract_info.abi;
  let address = contract_info.networks[config.device_id].address;
  let contract = new web3.eth.Contract(abi_json, address, {
    from:account
  });
  return contract;
}

function getContractByAddress(web3, contract_addr, contract_info, account) {
  let abi_json = contract_info.abi;
  let contract = new web3.eth.Contract(abi_json, contract_addr, {
    from:account
  });
  return contract;
}

async function getBalance(token, account) {
  let balance = await token.methods.balanceOf(account).call();
  return balance;
}

async function approveBalance(token, contract, amount) {
  let contract_address = contract.options.address;
  try {
    let rx = await token.methods.approve(contract_address, amount).send();
    return rx;
  } catch (err) {
    console.log("%s", err);
  }
}

module.exports = {
  initWeb3: initWeb3,
  getDefaultAccount: getDefaultAccount,
  getAccountInfo: getAccountInfo,
  getContract: getContract,
  getContractByAddress : getContractByAddress,
  getBalance: getBalance,
  approveBalance: approveBalance,
  subscribeAccountChange: subscribeAccountChange,
}
