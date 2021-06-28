import * as fs from "fs";
import { assertAbstractType } from "graphql";
import AnchorbAssetQueryHelper from "../helper/basset_queryhelper";
import { emptyBlockWithFixedGas } from "../helper/flow/gas-station";
import { mustFail, mustPass } from "../helper/flow/must";
import { getRecord } from "../helper/flow/record";
import { MantleState } from "../mantle-querier/MantleState";
import {TestState} from "./common";
var assert = require('assert');

let mantleState: MantleState;

async function main() {
    const testState = new TestState();
    mantleState = await testState.getMantleState();
    const querier = new AnchorbAssetQueryHelper(testState.testkit,testState.basset)


    await mustPass(testState.basset.bond(testState.wallets.a, 10000000000))
    assert.equal(await querier.balance_bluna(testState.wallets.a.key.accAddress),9999000000)
    await mustPass(querier.holder(testState.wallets.a.key.accAddress).then(info => {
        assert.equal(info.balance,9999000000)
    }))
    

    await mustPass(testState.basset.bond_for_st_luna(testState.wallets.a, 10000000000))  
    assert.equal(await querier.balance_stluna(testState.wallets.a.key.accAddress),10000000000) 
    await mustPass(testState.basset.bond_for_st_luna(testState.wallets.b, 10000000000)) 
    assert.equal(await querier.balance_stluna(testState.wallets.b.key.accAddress),10000000000) 


    await mustPass(testState.basset.convert_stluna_to_bluna(testState.wallets.a, 100000000))
    assert.equal(await querier.balance_bluna(testState.wallets.a.key.accAddress),10099000000)
    await mustPass(querier.holder(testState.wallets.a.key.accAddress).then(info => {
        assert.equal(info.balance,10099000000)
    }))
    assert.equal(await querier.balance_stluna(testState.wallets.a.key.accAddress),9900000000)
    await mustPass(testState.basset.convert_stluna_to_bluna(testState.wallets.b, 10000000000))
    assert.equal(await querier.balance_bluna(testState.wallets.b.key.accAddress),10000000000)
    await mustPass(querier.holder(testState.wallets.b.key.accAddress).then(info => {
        assert.equal(info.balance,10000000000)
    }))
    assert.equal(await querier.balance_stluna(testState.wallets.b.key.accAddress),0)

    // console.log(await querier.bluma_reward_state())
    // console.log(await querier.balance_bluna(testState.wallets.a.key.accAddress))
    // console.log(await querier.balance_stluna(testState.wallets.a.key.accAddress))
    // console.log(await querier.bluma_reward_config())
    // console.log(await querier.holders())
    // console.log("a = ",testState.wallets.a.key.accAddress)
    // console.log("b = ",testState.wallets.b.key.accAddress)
    // console.log("ownerWallet = ",testState.wallets.ownerWallet.key.accAddress)

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
