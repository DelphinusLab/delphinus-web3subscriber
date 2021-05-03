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

function getContract(web3, config, contract_info, account) {
  let abi_json = contract_info.abi;
  let address = contract_info.networks[config.device_id].address;
  let contract = new web3.eth.Contract(abi_json, address, {
    from:account
  });
  return contract;
}

async function getBalance(token) {
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
  getContract: getContract,
  getBalance: getBalance,
  approveBalance: approveBalance,
}
