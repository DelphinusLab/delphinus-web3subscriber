import {getweb3, binarySearchValidBlock, getValidBlockNumber, getReliableBlockNumber} from "../src/sync-pending-events";

let mockBlocks = ['1','1','1','1','1','1','1']; //Latest ValidBlockNumber should be 6
const addMock = jest.spyOn(getweb3, "getWeb3FromSource");
addMock.mockReturnValue({eth: { getBlock: (index: string) => {return Promise.resolve(mockBlocks[Number(index)])}}});

describe("test functions in syncEvent works", () => {
    test("test binarySearchValidBlock function works case 1", async () => {
        jest.setTimeout(60000); //1 minute timeout
        await binarySearchValidBlock("MockProvider", 2, 15).then((result)=>{
            expect(result).toEqual([2, 8]);
        });
    });

    test("test binarySearchValidBlock function works case 2", async () => {
        jest.setTimeout(60000); //1 minute timeout
        await binarySearchValidBlock("MockProvider", 6, 100).then((result)=>{
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

    test("test getReliableBlockNumber function works case 1", async () => {
        jest.setTimeout(60000); //1 minute timeout
        //trueLatestBlockNumber:30, lastCheckedBlockNumber:10, bufferBlocks:10
        //reliableBlockNumber = trueLatestBlockNumber - bufferBlocks = 10
        let reliableBlockNumber = await getReliableBlockNumber(30, 10, 10);
        expect(reliableBlockNumber).toEqual(20);
    });

    test("test getReliableBlockNumber function works case 2", async () => {
        jest.setTimeout(60000); //1 minute timeout
        //trueLatestBlockNumber:10, lastCheckedBlockNumber:5, bufferBlocks:15
        //trueLatestBlockNumber - bufferBlocks < 0
        //reliableBlockNumber = lastCheckedBlockNumber 
        let reliableBlockNumber = await getReliableBlockNumber(10, 5, 15);
        expect(reliableBlockNumber).toEqual(5);
    });

    test("test getReliableBlockNumber function works case 3", async () => {
        jest.setTimeout(60000); //1 minute timeout
        //trueLatestBlockNumber:null, lastCheckedBlockNumber:10, bufferBlocks:15
        //reliableBlockNumber = lastCheckedBlockNumber
        let reliableBlockNumber = await getReliableBlockNumber(null, 10, 15);
        expect(reliableBlockNumber).toEqual(10);
    });
});