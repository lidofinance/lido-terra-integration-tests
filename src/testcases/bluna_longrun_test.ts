import * as fs from "fs";
import { floateq as floateq, mustPass } from "../helper/flow/must";
import { getRecord } from "../helper/flow/record";
import {
    registerChainOracleVote,
    registerChainOraclePrevote,
} from "../helper/oracle/chain-oracle";
import { MantleState } from "../mantle-querier/MantleState";
import { emptyBlockWithFixedGas } from "../helper/flow/gas-station";
import { repeat } from "../helper/flow/repeat";
import { unjail } from "../helper/validator-operation/unjail";
import { get_expected_sum_from_requests, TestState } from "./common";
import AnchorbAssetQueryHelper from "../helper/basset_queryhelper";
var assert = require('assert');


let mantleState: MantleState;

async function main() {
    let j
    let i
    const testState = new TestState()
    mantleState = await testState.getMantleState()
    const querier = new AnchorbAssetQueryHelper(testState.testkit, testState.basset)

    // "first dummy" bonding just to make exchenage rate = 1
    await mustPass(testState.basset.bond(testState.wallets.ownerWallet, 2_000_000))


    const blunaContractAddress = testState.basset.contractInfo.anchor_basset_token.contractAddress

    //block 67
    await mustPass(emptyBlockWithFixedGas(testState.lcdClient, testState.gasStation))

    //block 68
    await mustPass(emptyBlockWithFixedGas(testState.lcdClient, testState.gasStation))

    //block 81 - 85
    // deregister oracle vote and waste 5 blocks
    const prevotesToClear = testState.initialPrevotes[0]
    const votesToClear = testState.initialVotes[0]

    await testState.testkit.clearAutomaticTx(prevotesToClear.id)
    await testState.testkit.clearAutomaticTx(votesToClear.id)
    await repeat(5, async () => {
        await mustPass(emptyBlockWithFixedGas(testState.lcdClient, testState.gasStation, 1))
    })

    //block 86 - 90
    // Oracle slashing happen at the block 89
    await mustPass(emptyBlockWithFixedGas(testState.lcdClient, testState.gasStation, 5))

    //block 91 unjail & revive oracle
    // unjail & re-register oracle votes
    await mustPass(unjail(testState.wallets.valAWallet))

    const currentBlockHeight = await mantleState.getCurrentBlockHeight()

    // // register vote for valA
    const previousVote = await testState.testkit.registerAutomaticTx(registerChainOracleVote(
        testState.validators[0].account_name,
        testState.validators[0].Msg.delegator_address,
        testState.validators[0].Msg.validator_address,
        currentBlockHeight + 2,
    ))

    // register votes
    const previousPrevote = await testState.testkit.registerAutomaticTx(registerChainOraclePrevote(
        testState.validators[0].account_name,
        testState.validators[0].Msg.delegator_address,
        testState.validators[0].Msg.validator_address,
        currentBlockHeight + 1
    ))

    //block 92 - 94
    //bond
    await testState.basset.slashing(testState.wallets.a)

    await mustPass(emptyBlockWithFixedGas(testState.lcdClient, testState.gasStation, 3))
    // set really low xhg_rate for first iteration
    let bluna_exchange_rate = 0.5;
    for (j = 0; j < 3; j++) {
        for (i = 0; i < 25; i++) {
            assert.ok(await querier.bluna_exchange_rate() <= 1)
            // check exchange_rate is growing on each iteration
            assert.ok(await querier.bluna_exchange_rate() > bluna_exchange_rate)
            bluna_exchange_rate = await querier.bluna_exchange_rate()
            await mustPass(testState.basset.bond(testState.wallets.a, 2_000_000))
        }
    }


    // set really low xhg_rate for first iteration
    bluna_exchange_rate = 0.5;
    for (j = 0; j < 3; j++) {
        for (i = 0; i < 25; i++) {
            assert.ok(await querier.bluna_exchange_rate() <= 1)
            // check exchange_rate is growing on each iteration
            assert.ok(await querier.bluna_exchange_rate() > bluna_exchange_rate)
            bluna_exchange_rate = await querier.bluna_exchange_rate()
            await mustPass(testState.basset.bond(testState.wallets.b, 2_000_000))
        }
    }

    // set really low xhg_rate for first iteration
    bluna_exchange_rate = 0.5;
    for (j = 0; j < 3; j++) {
        for (i = 0; i < 25; i++) {
            assert.ok(await querier.bluna_exchange_rate() <= 1)
            // check exchange_rate is growing on each iteration
            assert.ok(await querier.bluna_exchange_rate() > bluna_exchange_rate)
            bluna_exchange_rate = await querier.bluna_exchange_rate()
            await mustPass(testState.basset.bond(testState.wallets.c, 2_000_000))
        }
    }

    //block 95
    await mustPass(emptyBlockWithFixedGas(testState.lcdClient, testState.gasStation, 50))

    await mustPass(testState.basset.update_global_index(testState.wallets.a))

    const initail_bluna_balance_a = await querier.balance_bluna(testState.wallets.a.key.accAddress)
    for (j = 0; j < 3; j++) {
        for (i = 0; i < 25; i++) {
            await testState.basset.send_cw20_token(
                blunaContractAddress,
                testState.wallets.a,
                1_000_000,
                { unbond: {} },
                testState.basset.contractInfo["anchor_basset_hub"].contractAddress
            )
        }
    }
    assert.equal(initail_bluna_balance_a - 75_000_000, await querier.balance_bluna(testState.wallets.a.key.accAddress))


    const initail_bluna_balance_b = await querier.balance_bluna(testState.wallets.b.key.accAddress)
    for (j = 0; j < 3; j++) {
        for (i = 0; i < 25; i++) {
            await testState.basset.send_cw20_token(
                blunaContractAddress,
                testState.wallets.b,
                1_000_000,
                { unbond: {} },
                testState.basset.contractInfo["anchor_basset_hub"].contractAddress
            )
        }
    }
    assert.equal(initail_bluna_balance_b - 75_000_000, await querier.balance_bluna(testState.wallets.b.key.accAddress))


    const initail_bluna_balance_c = await querier.balance_bluna(testState.wallets.c.key.accAddress)
    for (j = 0; j < 3; j++) {
        for (i = 0; i < 25; i++) {
            await testState.basset.send_cw20_token(
                blunaContractAddress,
                testState.wallets.c,
                1_000_000,
                { unbond: {} },
                testState.basset.contractInfo["anchor_basset_hub"].contractAddress
            )
        }
    }
    assert.equal(initail_bluna_balance_c - 75_000_000, await querier.balance_bluna(testState.wallets.c.key.accAddress))


    //block 99 - 159
    const unbond_requests_a = await querier.unbond_requests(testState.wallets.a.key.accAddress)
    const unbond_requests_b = await querier.unbond_requests(testState.wallets.b.key.accAddress)
    const unbond_requests_c = await querier.unbond_requests(testState.wallets.c.key.accAddress)

    await mustPass(emptyBlockWithFixedGas(testState.lcdClient, testState.gasStation, 30))
    const inital_uluna_balance_a = Number((await testState.wallets.a.lcd.bank.balance(testState.wallets.a.key.accAddress)).get("uluna").amount)
    const inital_uluna_balance_b = Number((await testState.wallets.b.lcd.bank.balance(testState.wallets.b.key.accAddress)).get("uluna").amount)
    const inital_uluna_balance_c = Number((await testState.wallets.c.lcd.bank.balance(testState.wallets.c.key.accAddress)).get("uluna").amount)
    //block 160
    await mustPass(testState.basset.finish(testState.wallets.a))
    await mustPass(testState.basset.finish(testState.wallets.b))
    await mustPass(testState.basset.finish(testState.wallets.c))


    //block 170
    await mustPass(testState.basset.update_global_index(testState.wallets.a))



    const uluna_balance_a = Number((await testState.wallets.a.lcd.bank.balance(testState.wallets.a.key.accAddress)).get("uluna").amount)
    const uluna_balance_b = Number((await testState.wallets.b.lcd.bank.balance(testState.wallets.b.key.accAddress)).get("uluna").amount)
    const uluna_balance_c = Number((await testState.wallets.c.lcd.bank.balance(testState.wallets.c.key.accAddress)).get("uluna").amount)

    const actual_withdrawal_sum_a = (Number(uluna_balance_a) - inital_uluna_balance_a)
    const actual_withdrawal_sum_b = (Number(uluna_balance_b) - inital_uluna_balance_b)
    const actual_withdrawal_sum_c = (Number(uluna_balance_c) - inital_uluna_balance_c)

    const expected_withdrawal_sum_a = await get_expected_sum_from_requests(querier, unbond_requests_a, "bluna")
    const expected_withdrawal_sum_b = await get_expected_sum_from_requests(querier, unbond_requests_b, "bluna")
    const expected_withdrawal_sum_c = await get_expected_sum_from_requests(querier, unbond_requests_c, "bluna")


    assert.ok(floateq(expected_withdrawal_sum_a, actual_withdrawal_sum_a, 1e-5))
    assert.ok(floateq(expected_withdrawal_sum_b, actual_withdrawal_sum_b, 1e-5))
    assert.ok(floateq(expected_withdrawal_sum_c, actual_withdrawal_sum_c, 1e-5))

}

main()
    .then(() => console.log("done"))
    .then(async () => {
        console.log("saving state...");
        fs.writeFileSync(
            "blunalongruntest_action.json",
            JSON.stringify(getRecord(), null, 2)
        );
        fs.writeFileSync(
            "blunalongruntest_state.json",
            JSON.stringify(await mantleState.getState(), null, 2)
        );
    })
    .catch(console.log);
