import { toHexStr } from "../src/addresses";
describe("test functions in addresses.ts works", () => {
    test("test toHexStr function works", async () => {
        jest.setTimeout(60000); //1 minute timeout
        const deciToHexStr = await toHexStr("123")
        expect(deciToHexStr).toEqual('0x7b');
    });
});