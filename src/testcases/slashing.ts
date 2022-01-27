import * as fs from 'fs'
import { floateq as floateq, mustPass } from "../helper/flow/must";
import { emptyBlockWithFixedGas } from "../helper/flow/gas-station";
import {get_expected_sum_from_requests} from "./common_localterra";
import AnchorbAssetQueryHelper from "../helper/basset_queryhelper";
import * as assert from "assert";
import {disconnectValidator, TestStateLocalTestNet, vals} from "./common_localtestnet";

export default async function main() {
    const testState = new TestStateLocalTestNet()
    await testState.init()
    const querier = new AnchorbAssetQueryHelper(
        testState.lcdClient,
        testState.basset,
    )


    const blunaContractAddress = testState.basset.contractInfo.lido_terra_token.contractAddress
    const stlunaContractAddress = testState.basset.contractInfo.lido_terra_token_stluna.contractAddress
    const initial_uluna_balance_b = Number((await testState.wallets.b.lcd.bank.balance(testState.wallets.b.key.accAddress))[0].get("uluna").amount)

    // blocks 69 - 70
    await mustPass(emptyBlockWithFixedGas(testState.lcdClient, testState.gasStation, 2))


    await mustPass(testState.basset.add_validator(testState.wallets.ownerWallet, vals[1].address))
    await mustPass(testState.basset.add_validator(testState.wallets.ownerWallet, vals[2].address))
    await mustPass(testState.basset.add_validator(testState.wallets.ownerWallet, vals[3].address))

    //blocs 71 - 72
    assert.ok(await querier.bluna_exchange_rate() == 1)
    assert.ok(await querier.stluna_exchange_rate() == 1)
    await mustPass(testState.basset.bond(testState.wallets.a, 1_000_000_000))
    await mustPass(testState.basset.bond_for_stluna(testState.wallets.b, 10_000_000))

    //blocks 73 - 81
    await mustPass(emptyBlockWithFixedGas(testState.lcdClient, testState.gasStation, 9))

    let total_bluna_bond_amount_before_slashing = await querier.total_bond_bluna_amount()
    let total_stluna_bond_amount_before_slashing = await querier.total_bond_stluna_amount()

    await disconnectValidator("terradnode1")
    await testState.waitForJailed("terradnode1")

    await mustPass(emptyBlockWithFixedGas(testState.lcdClient, testState.gasStation, 20))

    // blocks 87 - 88
    await mustPass(testState.basset.slashing(testState.wallets.a))
    await mustPass(testState.basset.slashing(testState.wallets.b))

    // blocks 89 - 93
    await mustPass(emptyBlockWithFixedGas(testState.lcdClient, testState.gasStation, 5))

    let total_bluna_bond_amount_after_slashing = await querier.total_bond_bluna_amount()
    let total_stluna_bond_amount_after_slashing = await querier.total_bond_stluna_amount()

    assert.ok(
        floateq(total_stluna_bond_amount_before_slashing / total_bluna_bond_amount_before_slashing,
        total_stluna_bond_amount_after_slashing / total_bluna_bond_amount_after_slashing, 0.01))

    assert.ok(await querier.bluna_exchange_rate() < 1)
    assert.ok(await querier.stluna_exchange_rate() < 1)

    // blocks 94 - 95
    await mustPass(testState.basset.bond(testState.wallets.a, 1))
    await mustPass(testState.basset.bond_for_stluna(testState.wallets.b, 1))
    assert.ok(await querier.bluna_exchange_rate() < 1)
    assert.ok(await querier.stluna_exchange_rate() < 1)

    // blocks 96 - 105
    await mustPass(emptyBlockWithFixedGas(testState.lcdClient, testState.gasStation, 10))

    let bluna_ex_rate_before_second_bond = await querier.bluna_exchange_rate()
    let stluna_ex_rate_before_second_bond = await querier.stluna_exchange_rate()
    assert.ok(bluna_ex_rate_before_second_bond < 1)
    assert.ok(stluna_ex_rate_before_second_bond < 1)

    // blocks 107 - 106
    await mustPass(testState.basset.bond(testState.wallets.a, 2_000_000))
    await mustPass(testState.basset.bond_for_stluna(testState.wallets.b, 2_000_000))

    let bluna_ex_rate_after_second_bond = await querier.bluna_exchange_rate()
    let stluna_ex_rate_after_second_bond = await querier.stluna_exchange_rate()
    assert.ok(bluna_ex_rate_after_second_bond < 1)
    assert.ok(stluna_ex_rate_after_second_bond < 1)
    assert.ok(bluna_ex_rate_after_second_bond > bluna_ex_rate_before_second_bond)
    assert.ok(floateq(stluna_ex_rate_after_second_bond,stluna_ex_rate_before_second_bond,1e-5))

    // blocks 108 - 181
    let prev_exchange_rate = 0.5;
    for (let i = 0; i < 74; i++) {
        let curr_exchange_rate = await querier.bluna_exchange_rate()
        assert.ok(curr_exchange_rate < 1)
        // check exchange_rate is growing on each iteration
        assert.ok(curr_exchange_rate > prev_exchange_rate)
        prev_exchange_rate = curr_exchange_rate
        await mustPass(testState.basset.bond(testState.wallets.a, 2_000_000))
    }

    // blocks 182 - 255
    for (let i = 0; i < 74; i++) {
        await mustPass(testState.basset.bond_for_stluna(testState.wallets.b, 2_000_000))
    }

    let stluna_ex_rate_before_update = await querier.stluna_exchange_rate()
    // blocks 256 - 257
    await mustPass(testState.basset.update_global_index(testState.wallets.a))
    await mustPass(testState.basset.update_global_index(testState.wallets.b))
    // exchange rate is growing due to reward rebonding
    assert.ok(await querier.stluna_exchange_rate() > stluna_ex_rate_before_update)

    // blocks 258 - 307
    await mustPass(emptyBlockWithFixedGas(testState.lcdClient, testState.gasStation, 50))

    // blocks 308 - 382
    const initial_bluna_balance_a = await querier.balance_bluna(testState.wallets.a.key.accAddress)
    const initial_uluna_balance_a = Number((await testState.wallets.a.lcd.bank.balance(testState.wallets.a.key.accAddress))[0].get("uluna").amount)
    for (let i = 0; i < 75; i++) {
        await testState.basset.send_cw20_token(
            blunaContractAddress,
            testState.wallets.a,
            2_000_000,
            {unbond: {}},
            testState.basset.contractInfo["lido_terra_hub"].contractAddress
        )
    }
    assert.equal(initial_bluna_balance_a - 150_000_000, await querier.balance_bluna(testState.wallets.a.key.accAddress))

    // blocks 383 - 457
    for (let i = 0; i < 75; i++) {
        await testState.basset.send_cw20_token(
            stlunaContractAddress,
            testState.wallets.b,
            2_000_000,
            {unbond: {}},
            testState.basset.contractInfo["lido_terra_hub"].contractAddress
        )
    }

    // block 458
    await testState.basset.send_cw20_token(
        stlunaContractAddress,
        testState.wallets.b,
        await querier.balance_stluna(testState.wallets.b.key.accAddress),
        {unbond: {}},
        testState.basset.contractInfo["lido_terra_hub"].contractAddress
    )

    const unbond_requests_a = await querier.unbond_requests(testState.wallets.a.key.accAddress)
    const unbond_requests_b = await querier.unbond_requests(testState.wallets.b.key.accAddress)

    // blocks 459 - 508
    await mustPass(emptyBlockWithFixedGas(testState.lcdClient, testState.gasStation, 50))

    // blocks 509 - 510
    await mustPass(testState.basset.finish(testState.wallets.a))
    await mustPass(testState.basset.finish(testState.wallets.b))

    //blocks 511 - 512
    await mustPass(testState.basset.update_global_index(testState.wallets.a))
    await mustPass(testState.basset.update_global_index(testState.wallets.b))

    const uluna_balance_a = Number((await testState.wallets.a.lcd.bank.balance(testState.wallets.a.key.accAddress))[0].get("uluna").amount)
    const uluna_balance_b = Number((await testState.wallets.b.lcd.bank.balance(testState.wallets.b.key.accAddress))[0].get("uluna").amount)
    const actual_withdrawal_sum_a = (Number(uluna_balance_a) - initial_uluna_balance_a)
    const actual_withdrawal_sum_b = (Number(uluna_balance_b) - initial_uluna_balance_b) + 160_000_001
    const expected_withdrawal_sum_a = await get_expected_sum_from_requests(querier, unbond_requests_a, "bluna")
    const expected_withdrawal_sum_b = await get_expected_sum_from_requests(querier, unbond_requests_b, "stluna")

    assert.ok(actual_withdrawal_sum_a < 150_000_001)
    assert.ok(actual_withdrawal_sum_b < 160_000_001)
    assert.ok(floateq(expected_withdrawal_sum_a, actual_withdrawal_sum_a, 1e-4))
    assert.ok(floateq(expected_withdrawal_sum_b, actual_withdrawal_sum_b, 1e-4))
}

if (require.main === module) {
    main()
        .then(() => console.log("done"))
        .catch(console.log);
}
