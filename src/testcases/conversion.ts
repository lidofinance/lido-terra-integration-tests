import {Coins} from "@terra-money/terra.js";
import AnchorbAssetQueryHelper from "../helper/basset_queryhelper";
import {emptyBlockWithFixedGas} from "../helper/flow/gas-station";
import {mustFail, mustPass} from "../helper/flow/must";
import {TestStateLocalTerra} from "./common_localterra";

let assert = require('assert');

async function main() {
    const testState = new TestStateLocalTerra()
    await testState.init()

    const querier = new AnchorbAssetQueryHelper(
        testState.lcdClient,
        testState.basset,
    )

    const uusd_tx_fee = 10_000_000;

    // "first dummy" bonding just to make exchange rate = 1.
    await mustPass(testState.basset.bond(testState.wallets.lido_fee, 100_000_000_000))
    assert.equal(await querier.total_bond_bluna_amount(), 100_000_000_000)
    assert.equal(await querier.balance_bluna(testState.wallets.lido_fee.key.accAddress), 100_000_000_000)

    await mustPass(testState.basset.bond(testState.wallets.a, 100_000_000_000))
    assert.equal(await querier.total_bond_bluna_amount(), 200_000_000_000)
    assert.equal(await querier.balance_bluna(testState.wallets.a.key.accAddress), 100_000_000_000)
    assert.equal((await querier.holder(testState.wallets.a.key.accAddress)).balance, 100_000_000_000)

    await mustPass(testState.basset.bond_for_stluna(testState.wallets.a, 10_000_000_000))
    assert.equal(await querier.total_bond_stluna_amount(), 10_000_000_000)
    assert.equal(await querier.balance_stluna(testState.wallets.a.key.accAddress), 10_000_000_000)

    await mustPass(testState.basset.convert_stluna_to_bluna(testState.wallets.a, 1_000_000_000))
    assert.equal(await querier.balance_bluna(testState.wallets.a.key.accAddress), 101_000_000_000)
    assert.equal((await querier.holder(testState.wallets.a.key.accAddress)).balance, 101_000_000_000)
    assert.equal(await querier.total_bond_stluna_amount(), 9_000_000_000)
    assert.equal(await querier.total_bond_bluna_amount(), 201_000_000_000)
    assert.equal(await querier.balance_stluna(testState.wallets.a.key.accAddress), 9_000_000_000)

    await mustPass(testState.basset.convert_bluna_to_stluna(testState.wallets.a, 1_000_000_000))
    assert.equal(await querier.balance_bluna(testState.wallets.a.key.accAddress), 100_000_000_000)
    assert.equal((await querier.holder(testState.wallets.a.key.accAddress)).balance, 100_000_000_000)
    assert.equal(await querier.total_bond_stluna_amount(), 10_000_000_000)
    assert.equal(await querier.total_bond_bluna_amount(), 200_000_000_000)
    assert.equal(await querier.balance_stluna(testState.wallets.a.key.accAddress), 10_000_000_000)

    // insufficient balance
    await mustFail(testState.basset.convert_stluna_to_bluna(testState.wallets.a, 1_000_000_000_000))
    await mustFail(testState.basset.convert_bluna_to_stluna(testState.wallets.a, 1_000_000_000_000))
    // claiming reward after conversion
    let [coins1] = await testState.wallets.c.lcd.bank.balance(testState.wallets.c.key.accAddress)
    const initial_uusd_balance = Number(coins1.get("uusd").amount)
    // tx - 1
    await mustPass(testState.basset.bond(testState.wallets.c, 100_000_000_000))
    await mustPass(emptyBlockWithFixedGas(testState.lcdClient, testState.gasStation, 5))

    // tx - 2
    await mustPass(testState.basset.update_global_index(testState.wallets.c))
    const accrued_reward = Number((await querier.bluna_accrued_reward(testState.wallets.c.key.accAddress)).rewards)

    // tx - 3 - conversion
    await mustPass(testState.basset.convert_bluna_to_stluna(testState.wallets.c, 100_000_000_000))

    // tx - 4 - claiming
    await mustPass(testState.basset.reward2(testState.wallets.c, testState.wallets.c.key.accAddress))
    let [coins2] = await testState.wallets.c.lcd.bank.balance(testState.wallets.c.key.accAddress)
    const uusd_balance = Number(coins2.get("uusd").amount)

    const tax_rate = await testState.lcdClient.treasury.taxRate()
    const tax_cap = await testState.lcdClient.treasury.taxCap("uusd")

    const tax_amount = tax_rate.mul(accrued_reward).toNumber()
    const tax_cap_amount = tax_cap.toIntCoin().amount.toNumber()
    assert.equal(uusd_balance,
        initial_uusd_balance
        - 4 * uusd_tx_fee + // fee for 4 txs
        accrued_reward -  // the accrued rewards
        (tax_amount > tax_cap_amount ? tax_cap_amount : tax_amount)) // deduct_tax (capped)
}

main()
    .then(() => console.log("done"))
    .then(async () => {})
    .catch(console.log);
