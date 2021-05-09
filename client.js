const Web3 = require("web3")

const initWeb3 = async (config, client_mode) => {
  if (client_mode) {
    // We are in client mode
    if (window.ethereum) {
      await window.ethereum.send('eth_requestAccounts');
      window.web3 = new Web3(window.ethereum);
      return window.web3;
    }
    throw "ClientNotHasEthereumPlugin";
  } else {
    return new Web3(config.web3_source);
  }
}

const initWeb3Client = async () => {
    // We are in client mode
  await window.ethereum.send('eth_requestAccounts');
  window.web3 = new Web3(window.ethereum);
  return window.web3;
}

async function getDefaultAccount(web3, config) {
  let account = config.monitor_account;
  let accounts = await web3.eth.getAccounts();
  if (accounts.length != 0) {
    account = accounts[0];
  }
  return account;
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
  getContract: getContract,
  getContractByAddress : getContractByAddress,
  getBalance: getBalance,
  approveBalance: approveBalance,
}
