import { MsgWithdrawValidatorCommission } from "@terra-money/terra.js";
import * as fs from "fs";
import { assertAbstractType } from "graphql";
import AnchorbAssetQueryHelper from "../helper/basset_queryhelper";
import { emptyBlockWithFixedGas } from "../helper/flow/gas-station";
import { mustFail, mustPass } from "../helper/flow/must";
import { getRecord } from "../helper/flow/record";
import { MantleState } from "../mantle-querier/MantleState";
import { TestState } from "./common";
var assert = require('assert');

let mantleState: MantleState;

export default async function main() {
    const testState = new TestState();
    mantleState = await testState.getMantleState();
    const querier = new AnchorbAssetQueryHelper(testState.testkit, testState.basset)

    const uusd_tx_fee = 1_000_000;




    // "first dummy" bonding just to make exchenage rate = 1
    await mustPass(testState.basset.bond(testState.wallets.lido_fee, 100_000_000_000))
    assert.equal(await querier.total_bond_bluna_amount(), 200_000_000_000)
    assert.equal(await querier.balance_bluna(testState.wallets.lido_fee.key.accAddress), 99_999_000_000)


    await mustPass(testState.basset.bond(testState.wallets.a, 100_000_000_000))
    assert.equal(await querier.total_bond_bluna_amount(), 300_000_000_000)
    assert.equal(await querier.balance_bluna(testState.wallets.a.key.accAddress), 100_000_000_000)
    assert.equal((await querier.holder(testState.wallets.a.key.accAddress)).balance, 100_000_000_000)



    await mustPass(testState.basset.bond_for_stluna(testState.wallets.a, 10_000_000_000))
    assert.equal(await querier.total_bond_stluna_amount(), 10_000_000_000)
    assert.equal(await querier.balance_stluna(testState.wallets.a.key.accAddress), 10_000_000_000)


    await mustPass(testState.basset.convert_stluna_to_bluna(testState.wallets.a, 1_000_000_000))
    assert.equal(await querier.balance_bluna(testState.wallets.a.key.accAddress), 101_000_000_000)
    assert.equal((await querier.holder(testState.wallets.a.key.accAddress)).balance, 101_000_000_000)
    assert.equal(await querier.total_bond_stluna_amount(), 9_000_000_000)
    assert.equal(await querier.total_bond_bluna_amount(), 301_000_000_000)
    assert.equal(await querier.balance_stluna(testState.wallets.a.key.accAddress), 9_000_000_000)

    await mustPass(testState.basset.convert_bluna_to_stluna(testState.wallets.a, 1_000_000_000))
    assert.equal(await querier.balance_bluna(testState.wallets.a.key.accAddress), 100_000_000_000)
    assert.equal((await querier.holder(testState.wallets.a.key.accAddress)).balance, 100_000_000_000)
    assert.equal(await querier.total_bond_stluna_amount(), 10_000_000_000)
    assert.equal(await querier.total_bond_bluna_amount(), 300_000_000_000)
    assert.equal(await querier.balance_stluna(testState.wallets.a.key.accAddress), 10_000_000_000)

    // insufficient balance
    await mustFail(testState.basset.convert_stluna_to_bluna(testState.wallets.a, 1_000_000_000_000))
    await mustFail(testState.basset.convert_bluna_to_stluna(testState.wallets.a, 1_000_000_000_000))


    // claiming reward after conversion
    const initial_uusd_balance = Number((await testState.wallets.c.lcd.bank.balance(testState.wallets.c.key.accAddress)).get("uusd").amount)
    // tx - 1
    await mustPass(testState.basset.bond(testState.wallets.c, 100_000_000_000))
    await mustPass(emptyBlockWithFixedGas(testState.lcdClient, testState.gasStation, 15))
    // tx - 2
    await mustPass(testState.basset.update_global_index(testState.wallets.c))
    const accrued_reward = Number((await querier.bluna_accrued_reward(testState.wallets.c.key.accAddress)).rewards)
    // tx - 3 - conversion
    await mustPass(testState.basset.convert_bluna_to_stluna(testState.wallets.c, 100_000_000_000))
    // tx - 4 - claiming
    await mustPass(testState.basset.reward2(testState.wallets.c, testState.wallets.c.key.accAddress))
    const uusd_balance = Number((await testState.wallets.c.lcd.bank.balance(testState.wallets.c.key.accAddress)).get("uusd").amount)
    assert.equal(uusd_balance, initial_uusd_balance - 4 * uusd_tx_fee + accrued_reward)

}

main()
    .then(() => console.log("done"))
    .then(async () => {
        console.log("saving state...");
        fs.writeFileSync(
            "conversion_action.json",
            JSON.stringify(getRecord(), null, 2)
        );
        fs.writeFileSync(
            "conversion_state.json",
            JSON.stringify(await mantleState.getState(), null, 2)
        );
    })
    .catch(console.log);
