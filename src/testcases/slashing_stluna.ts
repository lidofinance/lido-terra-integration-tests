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
    const stlunaContractAddress = testState.basset.contractInfo.anchor_basset_token_stluna.contractAddress
    const initial_uluna_balance_a = Number((await testState.wallets.a.lcd.bank.balance(testState.wallets.a.key.accAddress)).get("uluna").amount)

    // blocks 73 - 74
    await mustPass(emptyBlockWithFixedGas(testState.lcdClient, testState.gasStation, 2))

    //block 74
    assert.ok(await querier.stluna_exchange_rate() == 1)
    await mustPass(testState.basset.bond_for_stluna(testState.wallets.a, 1_000_000))

    //blocks 75 - 83
    await mustPass(emptyBlockWithFixedGas(testState.lcdClient, testState.gasStation, 9))

    //blocks 84 - 88
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

    // blocks 86 - 91
    await mustPass(emptyBlockWithFixedGas(testState.lcdClient, testState.gasStation, 5))
    
    // blocks 92 - 101
    await mustPass(emptyBlockWithFixedGas(testState.lcdClient, testState.gasStation, 10))

    let stluna_exchange_rate = await querier.stluna_exchange_rate()
    assert.ok(stluna_exchange_rate = 1)
    //
    // block 102
    await mustPass(testState.basset.bond_for_stluna(testState.wallets.a, 2_000_000))

    stluna_exchange_rate = await querier.stluna_exchange_rate()
    assert.ok(stluna_exchange_rate < 1)
    
    // blocks 103 - 105
    await mustPass(emptyBlockWithFixedGas(testState.lcdClient, testState.gasStation, 3))
    
    // blocks 105-179
    for (let i = 0; i < 74; i++) {
        await mustPass(testState.basset.bond_for_stluna(testState.wallets.a, 2_000_000))
    }
    
    // block 180
    // we are bonding 3 * 25 = 75 iterations by 2_000_000 uluna each, 150_000_000 in total
    // we are expecting to have (150_000_000 / stluna_exchange_rate) stluna tokens
    stluna_exchange_rate = await querier.stluna_exchange_rate()
    await mustPass(testState.basset.update_global_index(testState.wallets.a))
    // exchange rate is growing due to reward rebonding
    assert.ok(await querier.stluna_exchange_rate() > stluna_exchange_rate)
    stluna_exchange_rate = await querier.stluna_exchange_rate()

    // blocks 181 - 230
    await mustPass(emptyBlockWithFixedGas(testState.lcdClient, testState.gasStation, 50))
    
    // blocks 231 - 305
    const ubond_exch_rate = await querier.stluna_exchange_rate()
    for (let i = 0; i < 75; i++) {
        await testState.basset.send_cw20_token(
            stlunaContractAddress,
            testState.wallets.a,
            2_000_000,
            {unbond: {}},
            testState.basset.contractInfo["anchor_basset_hub"].contractAddress
        )
    }
    
    // block 306
    await testState.basset.send_cw20_token(
        stlunaContractAddress,
        testState.wallets.a,
        await querier.balance_stluna(testState.wallets.a.key.accAddress),
        {unbond: {}},
        testState.basset.contractInfo["anchor_basset_hub"].contractAddress
    )

    const unbond_requests_a = await querier.unbond_requests(testState.wallets.a.key.accAddress)

    // blocks 307 - 356
    await mustPass(emptyBlockWithFixedGas(testState.lcdClient, testState.gasStation, 50))

    const uluna_balance_a_before_finish = Number((await testState.wallets.a.lcd.bank.balance(testState.wallets.a.key.accAddress)).get("uluna").amount)
    // block 357
    await mustPass(testState.basset.finish(testState.wallets.a))

    //block 358
    await mustPass(testState.basset.update_global_index(testState.wallets.a))

    const uluna_balance_a = Number((await testState.wallets.a.lcd.bank.balance(testState.wallets.a.key.accAddress)).get("uluna").amount)
    const actual_withdrawal_sum_a = (Number(uluna_balance_a) - initial_uluna_balance_a)
    const expected_withdrawal_sum_a = await get_expected_sum_from_requests(querier, unbond_requests_a) - 151_000_000
    
    assert.ok(floateq(expected_withdrawal_sum_a, actual_withdrawal_sum_a, 1e-4))
    assert.ok(actual_withdrawal_sum_a < 0)
}

main()
    .then(() => console.log('done'))
    .then(async () => {
        console.log("saving state...")
        fs.writeFileSync("slashing_stluna_actions.json", JSON.stringify(getRecord(), null, 2))
        fs.writeFileSync("slashing_stluna_State.json", JSON.stringify(await mantleState.getState(), null, 2))
    })
    .catch(console.log)
