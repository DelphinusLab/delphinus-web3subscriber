import {getweb3, binarySearchValidBlock, getTrueLatestBlockNumber} from "../src/sync-pending-events";
import { DelphinusContract } from "../src/client";
import { EventData } from "web3-eth-contract";

let mockEvents:EventData[] = [{
    returnValues: {
        value: 0
    },
    raw: {
        data: "0",
        topics: ["0"]
    },
    event: "0",
    signature: "0",
    logIndex: 0,
    transactionIndex: 0,
    transactionHash: "0",
    blockHash: "0",
    blockNumber: 0,
    address: "0"
},
{
    returnValues: {
        value: 1
    },
    raw: {
        data: "1",
        topics: ["1"]
    },
    event: "1",
    signature: "1",
    logIndex: 1,
    transactionIndex: 1,
    transactionHash: "1",
    blockHash: "1",
    blockNumber: 1,
    address: "1"
}];

const mockGetEvents = jest.spyOn(DelphinusContract.prototype, "getPastEventsFromTo");
mockGetEvents.mockImplementation(
    (start, end) => {
        let result = [];
        for (let i = start; i <= end; i++){
            if(mockEvents[i]){
                result.push(mockEvents[i])
            }
        }
        return Promise.resolve(result)
    }
)

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
        await getTrueLatestBlockNumber("MockProvider", 5, 100).then((result)=>{
            expect(result).toEqual(6);
        });
    });

    test("test getValidBlockNumber function works case 2", async () => {
        jest.setTimeout(60000); //1 minute timeout
        await getTrueLatestBlockNumber("MockProvider", 6, 100).then((result)=>{
            expect(result).toEqual(6);
        });
    });

    test("test getValidBlockNumber function works case 3", async () => {
        jest.setTimeout(60000); //1 minute timeout
        await getTrueLatestBlockNumber("MockProvider", 2, 6).then((result)=>{
            expect(result).toEqual(6);
        });
    });

    test("test getPastEventsFromSteped function works case 1", async () => {
        jest.setTimeout(60000); //1 minute timeout
        await DelphinusContract.prototype.getPastEventsFromSteped(0,15,1).then((result:any)=>{
            expect(result.breakpoint).toEqual(9);
            expect(result.events).toEqual([[mockEvents[0]],[mockEvents[1]]]);
        });
    });

    test("test getPastEventsFromSteped function works case 2", async () => {
        jest.setTimeout(60000); //1 minute timeout
        await DelphinusContract.prototype.getPastEventsFromSteped(1,15,1).then((result:any)=>{
            expect(result.breakpoint).toEqual(10);
            expect(result.events).toEqual([[mockEvents[1]]]);
        });
    });

    test("test getPastEventsFromSteped function works case 3", async () => {
        jest.setTimeout(60000); //1 minute timeout
        await DelphinusContract.prototype.getPastEventsFromSteped(0,15,2).then((result:any)=>{
            expect(result.breakpoint).toEqual(15);
            expect(result.events).toEqual([[mockEvents[0],mockEvents[1]]]);
        });
    });

    test("test getPastEventsFromSteped function works case 4", async () => {
        jest.setTimeout(60000); //1 minute timeout
        await DelphinusContract.prototype.getPastEventsFromSteped(0,15,-2).then((result:any)=>{
            expect(result.breakpoint).toEqual(15);
            expect(result.events).toEqual([[mockEvents[0],mockEvents[1]]]);
        });
    });

    test("test getPastEventsFromSteped function works case 5", async () => {
        jest.setTimeout(60000); //1 minute timeout
        await DelphinusContract.prototype.getPastEventsFromSteped(0,25,2).then((result:any)=>{
            expect(result.breakpoint).toEqual(19);
            expect(result.events).toEqual([[mockEvents[0],mockEvents[1]]]);
        });
    });

    test("test getPastEventsFromSteped function works case 6", async () => {
        jest.setTimeout(60000); //1 minute timeout
        await DelphinusContract.prototype.getPastEventsFromSteped(10,2,1).then((result:any)=>{
            expect(result).toEqual({"events": [], "breakpoint": null});
        });
    });
});