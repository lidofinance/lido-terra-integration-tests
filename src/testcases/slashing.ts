import * as fs from 'fs'
import { mustFail, mustPass } from "../helper/flow/must";
import { getRecord } from "../helper/flow/record";
import { MantleState } from "../mantle-querier/MantleState";
import { emptyBlockWithFixedGas } from "../helper/flow/gas-station";
import { repeat } from '../helper/flow/repeat'
import {TestState} from "./common";

let mantleState: MantleState

async function main() {
    const testState = new TestState()
    mantleState = await testState.getMantleState()

    //block 29
    await mustPass(emptyBlockWithFixedGas(testState.lcdClient, testState.gasStation))

    //block 30
    await mustPass(emptyBlockWithFixedGas(testState.lcdClient, testState.gasStation))

    //block 31
    await mustPass(testState.basset.bond(testState.wallets.a, 20000000000000))

    //block 32 - 40
    await mustPass(emptyBlockWithFixedGas(testState.lcdClient, testState.gasStation, 9))

    //block 41 - 45
    // Oracle slashing happen here
    // deregister oracle vote and waste 5 blocks
    const prevotesToClear = testState.initialPrevotes[0]
    const votesToClear = testState.initialVotes[0]

    await testState.testkit.clearAutomaticTx(prevotesToClear.id)
    await testState.testkit.clearAutomaticTx(votesToClear.id)
    await repeat(5, async () => {
        await mustPass(emptyBlockWithFixedGas(testState.lcdClient, testState.gasStation, 1))
    })

    //block 46 - 50
    await mustPass(emptyBlockWithFixedGas(testState.lcdClient, testState.gasStation, 5))

    //block 51
    await mustPass(testState.basset.bond(testState.wallets.a, 1))

}

main()
    .then(() => console.log('done'))
    .then(async () => {
        console.log("saving state...")
        fs.writeFileSync("slashingtriggeractions.json", JSON.stringify(getRecord(), null, 2))
        fs.writeFileSync("slashingtriggerState.json", JSON.stringify(await mantleState.getState(), null, 2))
    })
    .catch(console.log)
