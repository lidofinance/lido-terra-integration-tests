import * as fs from "fs";
import { floateq, mustPass } from "../helper/flow/must";
import { getRecord } from "../helper/flow/record";
import {
    registerChainOracleVote,
    registerChainOraclePrevote,
} from "../helper/oracle/chain-oracle";
import { MantleState } from "../mantle-querier/MantleState";
import { emptyBlockWithFixedGas } from "../helper/flow/gas-station";
import { repeat } from "../helper/flow/repeat";
import { unjail } from "../helper/validator-operation/unjail";
import { TestState } from "./common";
import AnchorbAssetQueryHelper from "../helper/basset_queryhelper";
var assert = require('assert');

let mantleState: MantleState;

async function main() {
    let j;
    let i
    const testState = new TestState()
    mantleState = await testState.getMantleState()
    const stlunaContractAddress = testState.basset.contractInfo.anchor_basset_token_stluna.contractAddress
    const querier = new AnchorbAssetQueryHelper(testState.testkit, testState.basset)

    const initial_uluna_balance_a = Number((await testState.wallets.a.lcd.bank.balance(testState.wallets.a.key.accAddress)).get("uluna").amount)
    const initial_uluna_balance_b = Number((await testState.wallets.b.lcd.bank.balance(testState.wallets.b.key.accAddress)).get("uluna").amount)
    const initial_uluna_balance_c = Number((await testState.wallets.c.lcd.bank.balance(testState.wallets.c.key.accAddress)).get("uluna").amount)

    const initial_uluna_balance_lido_fee = Number((await testState.wallets.lido_fee.lcd.bank.balance(testState.wallets.lido_fee.key.accAddress)).get("uluna").amount)


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

    let stluna_exchange_rate = await querier.stluna_exchange_rate()
    assert.equal(1, stluna_exchange_rate)
    //block 92 - 94
    //bond
    await mustPass(emptyBlockWithFixedGas(testState.lcdClient, testState.gasStation, 3))
    for (j = 0; j < 3; j++) {
        for (i = 0; i < 25; i++) {
            await mustPass(testState.basset.bond_for_stluna(testState.wallets.a, 2_000_000))
        }
    }
    assert.ok(floateq(
        150_000_000 / stluna_exchange_rate,
        await querier.balance_stluna(testState.wallets.a.key.accAddress),
        1e-6,
    ))
    await mustPass(testState.basset.update_global_index(testState.wallets.a))
    // exchange rate is growing due to reward rebonding
    assert.ok(await querier.stluna_exchange_rate() > stluna_exchange_rate)
    stluna_exchange_rate = await querier.stluna_exchange_rate()


    for (j = 0; j < 3; j++) {
        for (i = 0; i < 25; i++) {
            await mustPass(testState.basset.bond_for_stluna(testState.wallets.b, 2_000_000))
        }
    }
    assert.ok(floateq(
        150_000_000 / stluna_exchange_rate,
        await querier.balance_stluna(testState.wallets.b.key.accAddress),
        1e-6,
    ))
    await mustPass(testState.basset.update_global_index(testState.wallets.b))
    // exchange rate is growing due to reward rebonding
    assert.ok(await querier.stluna_exchange_rate() > stluna_exchange_rate)
    stluna_exchange_rate = await querier.stluna_exchange_rate()


    for (j = 0; j < 3; j++) {
        for (i = 0; i < 25; i++) {
            await mustPass(testState.basset.bond_for_stluna(testState.wallets.c, 2_000_000))
        }
    }
    assert.ok(floateq(
        150_000_000 / stluna_exchange_rate,
        await querier.balance_stluna(testState.wallets.c.key.accAddress),
        1e-6,
    ))
    await mustPass(testState.basset.update_global_index(testState.wallets.c))
    // exchange rate is growing due to reward rebonding
    assert.ok(await querier.stluna_exchange_rate() > stluna_exchange_rate)
    stluna_exchange_rate = await querier.stluna_exchange_rate()

    //block 95
    await mustPass(emptyBlockWithFixedGas(testState.lcdClient, testState.gasStation, 50))

    const ubond_exch_rate = await querier.stluna_exchange_rate()
    for (j = 0; j < 3; j++) {
        for (i = 0; i < 25; i++) {
            await testState.basset.send_cw20_token(
                stlunaContractAddress,
                testState.wallets.a,
                1_000_000,
                { unbond: {} },
                testState.basset.contractInfo["anchor_basset_hub"].contractAddress
            )
        }
    }
    await testState.basset.send_cw20_token(
        stlunaContractAddress,
        testState.wallets.a,
        await querier.balance_stluna(testState.wallets.a.key.accAddress),
        { unbond: {} },
        testState.basset.contractInfo["anchor_basset_hub"].contractAddress
    )


    for (j = 0; j < 3; j++) {
        for (i = 0; i < 25; i++) {
            await testState.basset.send_cw20_token(
                stlunaContractAddress,
                testState.wallets.b,
                1_000_000,
                { unbond: {} },
                testState.basset.contractInfo["anchor_basset_hub"].contractAddress
            )
        }
    }
    await testState.basset.send_cw20_token(
        stlunaContractAddress,
        testState.wallets.b,
        await querier.balance_stluna(testState.wallets.b.key.accAddress),
        { unbond: {} },
        testState.basset.contractInfo["anchor_basset_hub"].contractAddress
    )


    for (j = 0; j < 3; j++) {
        for (i = 0; i < 25; i++) {
            await testState.basset.send_cw20_token(
                stlunaContractAddress,
                testState.wallets.c,
                1_000_000,
                { unbond: {} },
                testState.basset.contractInfo["anchor_basset_hub"].contractAddress
            )
        }
    }
    await mustPass(emptyBlockWithFixedGas(testState.lcdClient, testState.gasStation, 20))
    await testState.basset.send_cw20_token(
        stlunaContractAddress,
        testState.wallets.c,
        await querier.balance_stluna(testState.wallets.c.key.accAddress),
        { unbond: {} },
        testState.basset.contractInfo["anchor_basset_hub"].contractAddress
    )
    await mustPass(testState.basset.update_global_index(testState.wallets.c))


    //block 99 - 159
    await mustPass(emptyBlockWithFixedGas(testState.lcdClient, testState.gasStation, 50))
    //block 160
    await mustPass(testState.basset.finish(testState.wallets.a))
    await mustPass(testState.basset.finish(testState.wallets.b))
    await mustPass(testState.basset.finish(testState.wallets.c))


    const uluna_balance_a = Number((await testState.wallets.a.lcd.bank.balance(testState.wallets.a.key.accAddress)).get("uluna").amount)
    const uluna_balance_b = Number((await testState.wallets.b.lcd.bank.balance(testState.wallets.b.key.accAddress)).get("uluna").amount)
    const uluna_balance_c = Number((await testState.wallets.c.lcd.bank.balance(testState.wallets.c.key.accAddress)).get("uluna").amount)
    const uluna_balance_lido_fee = Number((await testState.wallets.lido_fee.lcd.bank.balance(testState.wallets.lido_fee.key.accAddress)).get("uluna").amount)


    assert.ok(uluna_balance_a > initial_uluna_balance_a)
    assert.ok(uluna_balance_b > initial_uluna_balance_b)
    assert.ok(uluna_balance_c > initial_uluna_balance_c)
    assert.ok(uluna_balance_lido_fee > initial_uluna_balance_lido_fee)

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
