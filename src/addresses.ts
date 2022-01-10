import BN from 'bn.js';

const { addressIdToAddress, addressToAddressId } = require("substrate-ss58");
const L1ADDR_BITS = 160;

export function encodeL1address(addressHex: string, chex: string) {
  let c = new BN(chex + "0000000000000000000000000000000000000000", "hex");
  let a = new BN(addressHex, 16);
  return c.add(a);
}

/* chain_id:dec * address:hex
 */
export function decodeL1address(l1address: string) {
  let uid = new BN(l1address);
  let chainId = uid.shrn(L1ADDR_BITS);
  let addressHex = uid.sub(chainId.shln(L1ADDR_BITS)).toString(16);
  //address is 160 thus we need to padding '0' at the begining
  let prefix = Array(40 - addressHex.length + 1).join("0");
  addressHex = prefix + addressHex;
  let chainHex = chainId.toString(10);
  return [chainHex, addressHex];
}

export function toHexStr(a: string) {
  let c = new BN(a);
  return "0x" + c.toString(16);
}

export function toDecStr(a: string) {
  let c = new BN(a);
  return c.toString(10);
}

export function toSS58(bn: string) {
  let hexStr = new BN(bn).toString(16);
  let r = "";
  for (let i = 0; i < 64 - hexStr.length; i++) {
    r += "0";
  }
  r = r + hexStr;
  return addressIdToAddress(r);
}

export function SS58toBN(ss58: string) {
  let hex = addressToAddressId(ss58);
  return new BN(hex.substring(2), "hex");
}
