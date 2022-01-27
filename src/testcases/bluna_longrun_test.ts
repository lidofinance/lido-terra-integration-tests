// import * as fs from "fs";
import {floateq as floateq, mustPass} from "../helper/flow/must";
import {emptyBlockWithFixedGas} from "../helper/flow/gas-station";
import {unjail} from "../helper/validator-operation/unjail";
import {get_expected_sum_from_requests} from "./common_localterra";
import AnchorbAssetQueryHelper from "../helper/basset_queryhelper";
import {TestStateLocalTerra} from "./common_localterra";
import {disconnectValidator, TestStateLocalTestNet, vals} from "./common_localtestnet";
var assert = require('assert');


// let mantleState: MantleState;

export default async function main() {
    let j
    let i
    const testState = new TestStateLocalTestNet()
    await testState.init()

    const querier = new AnchorbAssetQueryHelper(
        testState.lcdClient,
        testState.basset,
    )


    // adding validator terradnode1 to jail it later
    await mustPass(testState.basset.add_validator(testState.wallets.ownerWallet, vals[1].address))
    await mustPass(testState.basset.bond(testState.wallets.ownerWallet, 2_000_000))


    const blunaContractAddress = testState.basset.contractInfo.lido_terra_token.contractAddress



    await disconnectValidator("terradnode1")
    await testState.waitForJailed("terradnode1")



    //block 86 - 90
    // Oracle slashing happen at the block 89
    await mustPass(emptyBlockWithFixedGas(testState.lcdClient, testState.gasStation, 20))

    //block 92 - 94
    //bond
    await testState.basset.slashing(testState.wallets.a)

    await mustPass(emptyBlockWithFixedGas(testState.lcdClient, testState.gasStation, 3))
    // set really low xhg_rate for first iteration
    let bluna_exchange_rate = 0.5;
    for (j = 0; j < 3; j++) {
        for (i = 0; i < 25; i++) {
            console.log(await querier.bluna_exchange_rate())
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
                {unbond: {}},
                testState.basset.contractInfo["lido_terra_hub"].contractAddress
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
                {unbond: {}},
                testState.basset.contractInfo["lido_terra_hub"].contractAddress
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
                {unbond: {}},
                testState.basset.contractInfo["lido_terra_hub"].contractAddress
            )
        }
    }
    assert.equal(initail_bluna_balance_c - 75_000_000, await querier.balance_bluna(testState.wallets.c.key.accAddress))


    //block 99 - 159
    const unbond_requests_a = await querier.unbond_requests(testState.wallets.a.key.accAddress)
    const unbond_requests_b = await querier.unbond_requests(testState.wallets.b.key.accAddress)
    const unbond_requests_c = await querier.unbond_requests(testState.wallets.c.key.accAddress)

    await mustPass(emptyBlockWithFixedGas(testState.lcdClient, testState.gasStation, 30))
    const inital_uluna_balance_a = Number((await testState.wallets.a.lcd.bank.balance(testState.wallets.a.key.accAddress))[0].get("uluna").amount)
    const inital_uluna_balance_b = Number((await testState.wallets.b.lcd.bank.balance(testState.wallets.b.key.accAddress))[0].get("uluna").amount)
    const inital_uluna_balance_c = Number((await testState.wallets.c.lcd.bank.balance(testState.wallets.c.key.accAddress))[0].get("uluna").amount)
    //block 160
    await mustPass(testState.basset.finish(testState.wallets.a))
    await mustPass(testState.basset.finish(testState.wallets.b))
    await mustPass(testState.basset.finish(testState.wallets.c))


    //block 170
    await mustPass(testState.basset.update_global_index(testState.wallets.a))



    const uluna_balance_a = Number((await testState.wallets.a.lcd.bank.balance(testState.wallets.a.key.accAddress))[0].get("uluna").amount)
    const uluna_balance_b = Number((await testState.wallets.b.lcd.bank.balance(testState.wallets.b.key.accAddress))[0].get("uluna").amount)
    const uluna_balance_c = Number((await testState.wallets.c.lcd.bank.balance(testState.wallets.c.key.accAddress))[0].get("uluna").amount)

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

if (require.main === module) {
    main()
        .then(() => console.log("done"))
        .catch(console.log);
}
