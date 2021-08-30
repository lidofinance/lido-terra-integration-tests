import * as fs from 'fs'
import { floateq as floateq, mustFail, mustPass } from "../helper/flow/must";
import { getRecord } from "../helper/flow/record";
import { getCoreState } from "../mantle-querier/core";
import { MantleState } from "../mantle-querier/MantleState";
import { emptyBlockWithFixedGas } from "../helper/flow/gas-station";
import { repeat } from '../helper/flow/repeat'
import {get_expected_sum_from_requests, TestState} from "./common";
import AnchorbAssetQueryHelper from "../helper/basset_queryhelper";
import * as assert from "assert";

let mantleState: MantleState

async function main() {
    const testState = new TestState()
    mantleState = await testState.getMantleState()
    const querier = new AnchorbAssetQueryHelper(testState.testkit, testState.basset)
    const blunaContractAddress = testState.basset.contractInfo.anchor_basset_token.contractAddress

    // blocks 69 - 70
    await mustPass(emptyBlockWithFixedGas(testState.lcdClient, testState.gasStation, 2))

    //block 71
    await mustPass(testState.basset.bond(testState.wallets.a, 1_000_000_000))

    //blocks 72 - 80
    await mustPass(emptyBlockWithFixedGas(testState.lcdClient, testState.gasStation, 9))

    //blocks 81 - 85
    // Oracle slashing happen here
    // deregister oracle vote and waste 5 blocks
    const prevotesToClear = testState.initialPrevotes[0]
    const votesToClear = testState.initialVotes[0]

    await testState.testkit.clearAutomaticTx(prevotesToClear.id)
    await testState.testkit.clearAutomaticTx(votesToClear.id)
    await repeat(5, async () => {
        await mustPass(emptyBlockWithFixedGas(testState.lcdClient, testState.gasStation, 1))
    })

    // block 86
    await mustPass(testState.basset.slashing(testState.wallets.a))

    // blocks 87 - 91
    await mustPass(emptyBlockWithFixedGas(testState.lcdClient, testState.gasStation, 5))

    // block 92
    await mustPass(testState.basset.bond(testState.wallets.a, 1))

    // blocks 93 - 102
    await mustPass(emptyBlockWithFixedGas(testState.lcdClient, testState.gasStation, 10))

    let ex_rate_before_bond = await querier.bluna_exchange_rate()
    assert.ok(ex_rate_before_bond < 1)

    // block 103
    await mustPass(testState.basset.bond(testState.wallets.a, 2_000_000))

    let ex_rate_after_bond = await querier.bluna_exchange_rate()
    assert.ok(ex_rate_after_bond < 1)
    assert.ok(ex_rate_after_bond > ex_rate_before_bond)

    // blocks 104 - 177
    let prev_exchange_rate = 0.5;
    for (let i = 0; i < 74; i++) {
        let curr_exchange_rate = await querier.bluna_exchange_rate()
        assert.ok(curr_exchange_rate < 1)
        // check exchange_rate is growing on each iteration
        assert.ok(curr_exchange_rate > prev_exchange_rate)
        prev_exchange_rate = curr_exchange_rate
        await mustPass(testState.basset.bond(testState.wallets.a, 2_000_000))
    }

    // blocks 178 - 227
    await mustPass(emptyBlockWithFixedGas(testState.lcdClient, testState.gasStation, 50))

    // blocks 228 - 302
    const initial_bluna_balance_a = await querier.balance_bluna(testState.wallets.a.key.accAddress)
    const initial_uluna_balance_a = Number((await testState.wallets.a.lcd.bank.balance(testState.wallets.a.key.accAddress)).get("uluna").amount)
    for (let i = 0; i < 75; i++) {
        await testState.basset.send_cw20_token(
            blunaContractAddress,
            testState.wallets.a,
            2_000_000,
            {unbond: {}},
            testState.basset.contractInfo["anchor_basset_hub"].contractAddress
        )
    }
    assert.equal(initial_bluna_balance_a - 150_000_000, await querier.balance_bluna(testState.wallets.a.key.accAddress))

    const unbond_requests_a = await querier.unbond_requests(testState.wallets.a.key.accAddress)

    // blocks 303 - 352
    await mustPass(emptyBlockWithFixedGas(testState.lcdClient, testState.gasStation, 50))

    // block 353
    await mustPass(testState.basset.finish(testState.wallets.a))

    //block 354
    await mustPass(testState.basset.update_global_index(testState.wallets.a))

    const uluna_balance_a = Number((await testState.wallets.a.lcd.bank.balance(testState.wallets.a.key.accAddress)).get("uluna").amount)
    const actual_withdrawal_sum_a = (Number(uluna_balance_a) - initial_uluna_balance_a)
    
    assert.ok(actual_withdrawal_sum_a < 150_000_000)
}

main()
    .then(() => console.log('done'))
    .then(async () => {
        console.log("saving state...")
        fs.writeFileSync("slashing_bluna_actions.json", JSON.stringify(getRecord(), null, 2))
        fs.writeFileSync("slashing_bluna_state.json", JSON.stringify(await mantleState.getState(), null, 2))
    })
    .catch(console.log)
