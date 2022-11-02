import {getweb3, binarySearchValidBlock, getValidBlockNumber} from "../src/sync-pending-events";

let mockBlocks = ['1','1','1','1','1','1','1']; //Latest ValidBlockNumber should be 6
const addMock = jest.spyOn(getweb3, "getWeb3FromSource");
addMock.mockReturnValue({eth: { getBlock: (index: string) => {return Promise.resolve(mockBlocks[Number(index)])}}});

describe("test functions in syncEvent works", () => {
    test("test binarySearchValidBlock function works case 1", async () => {
        jest.setTimeout(60000); //1 minute timeout
        binarySearchValidBlock("MockProvider", 2, 15).then((result)=>{
            expect(result).toEqual([2, 8]);
        });
    });

    test("test binarySearchValidBlock function works case 2", async () => {
        jest.setTimeout(60000); //1 minute timeout
        binarySearchValidBlock("MockProvider", 6, 100).then((result)=>{
            expect(result).toEqual([6, 53]);
        });
    });

    test("test getValidBlockNumber function works case 1", async () => {
        jest.setTimeout(60000); //1 minute timeout
        await getValidBlockNumber("MockProvider", 5, 100).then((result)=>{
            expect(result).toEqual(6);
        });
    });

    test("test getValidBlockNumber function works case 2", async () => {
        jest.setTimeout(60000); //1 minute timeout
        await getValidBlockNumber("MockProvider", 6, 100).then((result)=>{
            expect(result).toEqual(6);
        });
    });

    test("test getValidBlockNumber function works case 3", async () => {
        jest.setTimeout(60000); //1 minute timeout
        await getValidBlockNumber("MockProvider", 2, 6).then((result)=>{
            expect(result).toEqual(6);
        });
    });
});