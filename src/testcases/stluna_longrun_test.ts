import {floateq, mustPass} from "../helper/flow/must";
import {emptyBlockWithFixedGas} from "../helper/flow/gas-station";
import AnchorbAssetQueryHelper from "../helper/basset_queryhelper";
import {defaultSleepTime, disconnectValidator, get_expected_sum_from_requests, sleep, TestStateLocalTestNet, vals} from "./common_localtestnet";
var assert = require('assert');


export default async function main() {
    let j;
    let i
    const testState = new TestStateLocalTestNet()
    await testState.init()

    const querier = new AnchorbAssetQueryHelper(
        testState.lcdClient,
        testState.basset,
    )
    const stlunaContractAddress = testState.basset.contractInfo.lido_terra_token_stluna.contractAddress
    await mustPass(testState.basset.add_validator(testState.wallets.ownerWallet, vals[1].address))
    await mustPass(testState.basset.bond(testState.wallets.d, 1_000_000))

    const initial_uluna_balance_a = Number((await testState.wallets.a.lcd.bank.balance(testState.wallets.a.key.accAddress))[0].get("uluna").amount)
    const initial_uluna_balance_b = Number((await testState.wallets.b.lcd.bank.balance(testState.wallets.b.key.accAddress))[0].get("uluna").amount)
    const initial_uluna_balance_c = Number((await testState.wallets.c.lcd.bank.balance(testState.wallets.c.key.accAddress))[0].get("uluna").amount)

    const initial_uluna_balance_lido_fee = Number((await testState.wallets.lido_fee.lcd.bank.balance(testState.wallets.lido_fee.key.accAddress))[0].get("uluna").amount)


    //block 67
    await sleep(defaultSleepTime)

    //block 68
    await sleep(defaultSleepTime)

    await disconnectValidator("terradnode1")
    await testState.waitForJailed("terradnode1")

    //block 91 unjail & revive oracle
    // unjail & re-register oracle votes
    // temporarly disabling unjailing
    // await mustPass(unjail(testState.wallets.valAWallet))



    let stluna_exchange_rate = await querier.stluna_exchange_rate()
    assert.equal(1, stluna_exchange_rate)
    //block 92 - 94
    //bond
    await sleep(defaultSleepTime)
    for (j = 0; j < 3; j++) {
        for (i = 0; i < 25; i++) {
            await mustPass(testState.basset.bond_for_stluna(testState.wallets.a, 2_000_000))
        }
    }
    // we are bonding 3 * 25 = 75 iterations by 2_000_000 uluna each, 150_000_000 in total
    // we are expecting to have (150_000_000 / stluna_exchange_rate) stluna tokens
    assert.ok(floateq(
        150_000_000 / stluna_exchange_rate,
        await querier.balance_stluna(testState.wallets.a.key.accAddress),
        1e-6,
    ))
    await mustPass(testState.basset.update_global_index(testState.wallets.a))
    // exchange rate is growing due to reward rebonding
    console.log(stluna_exchange_rate, await querier.stluna_exchange_rate())
    assert.ok(await querier.stluna_exchange_rate() > stluna_exchange_rate)
    stluna_exchange_rate = await querier.stluna_exchange_rate()

    // with a localtestnet environment, stluna ex rate at this point of test is equal ~570
    // each bond iteration we a loosing 0.7ustluna,
    // 2_000_000/570 = 3504.7 = 3504 
    for (j = 0; j < 3; j++) {
        for (i = 0; i < 25; i++) {
            await mustPass(testState.basset.bond_for_stluna(testState.wallets.b, 2_000_000))
        }
    }
    // we are bonding 3 * 25 = 75 iterations by 2_000_000 uluna each, 150_000_000 in total
    // we are expecting to have (150_000_000 / stluna_exchange_rate) stluna tokens
    // since we loosing a lot of ustluna due to contract accuracy and huge stluna exrate
    // we have to set lower accuracy in assertion
    assert.ok(floateq(
        150_000_000 / stluna_exchange_rate,
        await querier.balance_stluna(testState.wallets.b.key.accAddress),
        1e-3,
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
    // we are bonding 3 * 25 = 75 iterations by 2_000_000 uluna each, 150_000_000 in total
    // we are expecting to have (150_000_000 / stluna_exchange_rate) stluna tokens
    assert.ok(floateq(
        150_000_000 / stluna_exchange_rate,
        await querier.balance_stluna(testState.wallets.c.key.accAddress),
        1e-3,
    ))
    await mustPass(testState.basset.update_global_index(testState.wallets.c))
    // exchange rate is growing due to reward rebonding
    assert.ok(await querier.stluna_exchange_rate() > stluna_exchange_rate)
    stluna_exchange_rate = await querier.stluna_exchange_rate()

    //block 95
    await sleep(defaultSleepTime)

    const ubond_exch_rate = await querier.stluna_exchange_rate()
    for (j = 0; j < 3; j++) {
        for (i = 0; i < 25; i++) {
            await testState.basset.send_cw20_token(
                stlunaContractAddress,
                testState.wallets.a,
                1_000_000,
                {unbond: {}},
                testState.basset.contractInfo["lido_terra_hub"].contractAddress
            )
        }
    }
    await testState.basset.send_cw20_token(
        stlunaContractAddress,
        testState.wallets.a,
        await querier.balance_stluna(testState.wallets.a.key.accAddress),
        {unbond: {}},
        testState.basset.contractInfo["lido_terra_hub"].contractAddress
    )


    for (j = 0; j < 3; j++) {
        for (i = 0; i < 25; i++) {
            await testState.basset.send_cw20_token(
                stlunaContractAddress,
                testState.wallets.b,
                1_000_000,
                {unbond: {}},
                testState.basset.contractInfo["lido_terra_hub"].contractAddress
            )
        }
    }
    await testState.basset.send_cw20_token(
        stlunaContractAddress,
        testState.wallets.b,
        await querier.balance_stluna(testState.wallets.b.key.accAddress),
        {unbond: {}},
        testState.basset.contractInfo["lido_terra_hub"].contractAddress
    )


    for (j = 0; j < 3; j++) {
        for (i = 0; i < 25; i++) {
            await testState.basset.send_cw20_token(
                stlunaContractAddress,
                testState.wallets.c,
                1_000_000,
                {unbond: {}},
                testState.basset.contractInfo["lido_terra_hub"].contractAddress
            )
        }
    }
    await sleep(defaultSleepTime)
    await testState.basset.send_cw20_token(
        stlunaContractAddress,
        testState.wallets.c,
        await querier.balance_stluna(testState.wallets.c.key.accAddress),
        {unbond: {}},
        testState.basset.contractInfo["lido_terra_hub"].contractAddress
    )
    await mustPass(testState.basset.update_global_index(testState.wallets.c))


    //block 99 - 159
    await sleep(defaultSleepTime)
    const unbond_requests_a = await querier.unbond_requests(testState.wallets.a.key.accAddress)
    const unbond_requests_b = await querier.unbond_requests(testState.wallets.b.key.accAddress)
    const unbond_requests_c = await querier.unbond_requests(testState.wallets.c.key.accAddress)
    //block 160
    await mustPass(testState.basset.finish(testState.wallets.a))
    await mustPass(testState.basset.finish(testState.wallets.b))
    await mustPass(testState.basset.finish(testState.wallets.c))


    const uluna_balance_a = Number((await testState.wallets.a.lcd.bank.balance(testState.wallets.a.key.accAddress))[0].get("uluna").amount)
    const uluna_balance_b = Number((await testState.wallets.b.lcd.bank.balance(testState.wallets.b.key.accAddress))[0].get("uluna").amount)
    const uluna_balance_c = Number((await testState.wallets.c.lcd.bank.balance(testState.wallets.c.key.accAddress))[0].get("uluna").amount)
    const uluna_balance_lido_fee = Number((await testState.wallets.lido_fee.lcd.bank.balance(testState.wallets.lido_fee.key.accAddress))[0].get("uluna").amount)

    const actual_profit_sum_a = (Number(uluna_balance_a) - initial_uluna_balance_a)
    const actual_profit_sum_b = (Number(uluna_balance_b) - initial_uluna_balance_b)
    const actual_profit_sum_c = (Number(uluna_balance_c) - initial_uluna_balance_c)
    // we have unbonded all our stluna tokens, we have withdrawed(testState.basset.finish) all uluna
    // our profit is "withdrawal amount" - "bonded amount"
    const expected_profit_sum_a = await get_expected_sum_from_requests(querier, unbond_requests_a, "stluna") - 150_000_000
    const expected_profit_sum_b = await get_expected_sum_from_requests(querier, unbond_requests_b, "stluna") - 150_000_000
    const expected_profit_sum_c = await get_expected_sum_from_requests(querier, unbond_requests_c, "stluna") - 150_000_000
    // due to js float64 math precision we have to set the precision value = 1e-3, i.e. 0.1%
    assert.ok(floateq(expected_profit_sum_a, actual_profit_sum_a, 1e-3))
    assert.ok(floateq(expected_profit_sum_b, actual_profit_sum_b, 1e-3))
    assert.ok(floateq(expected_profit_sum_c, actual_profit_sum_c, 1e-3))
    assert.ok(uluna_balance_a > initial_uluna_balance_a)
    assert.ok(uluna_balance_b > initial_uluna_balance_b)
    assert.ok(uluna_balance_c > initial_uluna_balance_c)


    assert.ok(uluna_balance_lido_fee > initial_uluna_balance_lido_fee)

}

if (require.main === module) {
    main()
        .then(() => console.log("done"))
        .catch(console.log);
}
