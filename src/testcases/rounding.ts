import * as fs from 'fs'
import { mustFail, mustPass } from "../helper/flow/must";
import { getRecord } from "../helper/flow/record";
import { registerChainOracleVote, registerChainOraclePrevote } from "../helper/oracle/chain-oracle";
import { MantleState } from "../mantle-querier/MantleState";
import { emptyBlockWithFixedGas } from "../helper/flow/gas-station";
import { repeat } from '../helper/flow/repeat'
import { unjail } from '../helper/validator-operation/unjail'
import {TestState} from "./common";

let mantleState: MantleState

async function main() {
    const testState = new TestState()
    mantleState = await testState.getMantleState()
    let testkit = testState.testkit
    let lcd = testState.lcdClient
    let gasStation = testState.gasStation
    let a = testState.wallets.a
    let b = testState.wallets.b
    let basset = testState.basset
    let validators = testState.validators
    const blunaContractAddress = testState.basset.contractInfo.anchor_basset_token.contractAddress

    //block 29
    await mustPass(emptyBlockWithFixedGas(lcd, gasStation))

    //block 30
    await mustPass(emptyBlockWithFixedGas(lcd, gasStation))

    //block 31
    await mustPass(basset.bond(a, 20000000000000))

    //block 32 - 40
    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 9))

    //block 41~45
    // deregister oracle vote and waste 5 blocks
    const prevotesToClear = testState.initialPrevotes[0]
    const votesToClear = testState.initialVotes[0]

    await testkit.clearAutomaticTx(prevotesToClear.id)
    await testkit.clearAutomaticTx(votesToClear.id)
    await repeat(5, async () => {
        await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 1))
    })

    //block 46 - 50
    // Oracle slashing happen at the block 49
    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 5))

    //block 51 unjail & revive oracle
    // unjail & re-register oracle votes
    await mustPass(unjail(testState.wallets.valAWallet))

    const currentBlockHeight = await mantleState.getCurrentBlockHeight()

    // // register vote for valA
    const previousVote = await testkit.registerAutomaticTx(registerChainOracleVote(
        validators[0].account_name,
        validators[0].Msg.delegator_address,
        validators[0].Msg.validator_address,
        currentBlockHeight + 2,
    ))

    // register votes
    const previousPrevote = await testkit.registerAutomaticTx(registerChainOraclePrevote(
        validators[0].account_name,
        validators[0].Msg.delegator_address,
        validators[0].Msg.validator_address,
        currentBlockHeight + 1
    ))

    let i = 0
    while (i < 110) {
        i++
        //block 52 - 54
        await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 3))

        //block 55
        await mustPass(basset.bond(a, 20000000000000))

        //block 56
        await mustPass(basset.transfer_cw20_token(blunaContractAddress, a, b, 10000000))

        //block 57
        await basset.send_cw20_token(
            blunaContractAddress,
            a,
            20000000000000,
            { unbond: {} },
            basset.contractInfo["anchor_basset_hub"].contractAddress
        )

        //block 58
        await mustPass(basset.send_cw20_token(
            blunaContractAddress,
            a,
            1000000,
            { unbond: {} },
            basset.contractInfo["anchor_basset_hub"].contractAddress
        ))

        //block 59 - 66
        await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 8))

        //block 67
        await mustPass(emptyBlockWithFixedGas(lcd, gasStation))

        //block 68 - 89
        await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 22))

        // block 90
        await mustPass(emptyBlockWithFixedGas(lcd, gasStation))

        //block 91 - 119
        await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 29))

        //block 120
        await mustPass(basset.finish(a))
    }
}

main()
    .then(() => console.log('done'))
    .then(async () => {
        console.log("saving state...")
        fs.writeFileSync("rounding_actions.json", JSON.stringify(getRecord(), null, 2))
        fs.writeFileSync("rounding_state.json", JSON.stringify(await mantleState.getState(), null, 2))
    })
    .catch(console.log)