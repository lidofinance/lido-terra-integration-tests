import * as fs from "fs";
import {GraphQLClient} from "graphql-request";
import AnchorbAssetQueryHelper from "../helper/basset_queryhelper";
import {emptyBlockWithFixedGas} from "../helper/flow/gas-station";
import {mustFail, mustPass} from "../helper/flow/must";
import {getRecord} from "../helper/flow/record";
import {makeContractStoreQuery} from "../mantle-querier/common";
import {MantleState} from "../mantle-querier/MantleState";
import {TestState} from "./common";
import {TestStateLocalTerra} from "./common_localterra";
var assert = require('assert');
let mantleState: MantleState;
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}


async function main() {

    // let mantleClient = new GraphQLClient("http://localhost:1337/");

    // console.log(await makeContractStoreQuery(
    //     "terra1sc0xuv5mchavyf8g7leszztdjvru4kws59dlkg",
    //     {
    //         balance: {
    //             address: "terra1x46rqay4d3cssq8gxxvqz8xt6nwlz4td20k38v"
    //         }
    //     },
    //     mantleClient
    // ))
    // return 0
    const testState = new TestStateLocalTerra()
    await testState.init()

    const blunaContractAddress = testState.basset.contractInfo.anchor_basset_token.contractAddress
    const querier = new AnchorbAssetQueryHelper(
        testState.lcdClient,
        new GraphQLClient("http://localhost:1337/"),
        testState.basset)

    await mustPass(testState.basset.bond(testState.wallets.a, 9_999_000_000))
    await sleep(1000)
    assert.equal(await querier.balance_bluna(testState.wallets.a.key.accAddress), 9_999_000_000)

    await mustPass(testState.basset.transfer_cw20_token(
        blunaContractAddress, testState.wallets.a, testState.wallets.b, 1_000_000_000)
    )
    await sleep(1000)
    assert.equal(await querier.balance_bluna(testState.wallets.a.key.accAddress), 8_999_000_000)
    assert.equal(await querier.balance_bluna(testState.wallets.b.key.accAddress), 1_000_000_000)


    await mustPass(testState.basset.burn_cw20_token(blunaContractAddress, testState.wallets.b, 100_000_000))
    await sleep(1000)
    assert.equal(await querier.balance_bluna(testState.wallets.b.key.accAddress), 900_000_000)


    // unbonding + withdrawal
    const unbond_amount = 1_000_000_000;
    const initial_uluna_balance = Number((await testState.wallets.a.lcd.bank.balance(testState.wallets.a.key.accAddress)).get("uluna").amount)
    await mustPass(testState.basset.send_cw20_token(
        blunaContractAddress,
        testState.wallets.a,
        unbond_amount,
        {unbond: {}},
        testState.basset.contractInfo["anchor_basset_hub"].contractAddress
    ))
    await sleep(1000)
    assert.equal(await querier.balance_bluna(testState.wallets.a.key.accAddress), 7_999_000_000)
    await mustPass(emptyBlockWithFixedGas(testState.lcdClient, testState.gasStation, 50))
    console.log(await querier.all_history())
    console.log(await querier.token_info_bluna())
    console.log(await querier.balance_bluna(testState.wallets.a.key.accAddress))
    console.log(await testState.wallets.a.lcd.bank.balance(testState.basset.contractInfo["anchor_basset_hub"].contractAddress))
    console.log(await querier.get_withdraweble_unbonded(testState.wallets.a.key.accAddress))
    await mustPass(testState.basset.finish(testState.wallets.a))
    await sleep(1000)
    const uluna_balance = Number((await testState.wallets.a.lcd.bank.balance(testState.wallets.a.key.accAddress)).get("uluna").amount)
    let withdrawal_rate = Number((await querier.all_history()).history[0].withdraw_rate)
    assert.equal(uluna_balance, initial_uluna_balance + unbond_amount * withdrawal_rate)




    // mint message allowed only from anchor_basset_hub contract as sender
    await mustFail(testState.basset.mint_cw20_token(
        blunaContractAddress,
        testState.wallets.a,
        testState.basset.contractInfo["anchor_basset_hub"].contractAddress,
        100000))

    // TransferFrom
    await mustPass(testState.basset.increase_allowance(blunaContractAddress, testState.wallets.a, testState.wallets.b.key.accAddress, 200_000_000, {never: {}}))
    await mustPass(testState.basset.transfer_from_cw20_token(blunaContractAddress, testState.wallets.b, testState.wallets.a, testState.wallets.b, 50_000_000))
    await sleep(1000)
    assert.equal(await querier.balance_bluna(testState.wallets.b.key.accAddress), 950_000_000)
    await mustPass(testState.basset.transfer_from_cw20_token(blunaContractAddress, testState.wallets.b, testState.wallets.a, testState.wallets.b, 50_000_000))
    await sleep(1000)
    assert.equal(await querier.balance_bluna(testState.wallets.b.key.accAddress), 1_000_000_000)

    await mustPass(testState.basset.decrease_allowance(blunaContractAddress, testState.wallets.a, testState.wallets.b.key.accAddress, 100_000_000, {never: {}}))
    await mustFail(testState.basset.transfer_from_cw20_token(blunaContractAddress, testState.wallets.b, testState.wallets.a, testState.wallets.b, 20000))

    // BurnFrom
    await mustPass(testState.basset.increase_allowance(blunaContractAddress, testState.wallets.a, testState.wallets.b.key.accAddress, 1_000_000_000, {never: {}}))
    await mustPass(testState.basset.burn_from_cw20_token(blunaContractAddress, testState.wallets.b, testState.wallets.a, 899_000_000))
    await sleep(1000)
    assert.equal(await querier.balance_bluna(testState.wallets.a.key.accAddress), 7_000_000_000)

    await mustPass(testState.basset.decrease_allowance(blunaContractAddress, testState.wallets.a, testState.wallets.b.key.accAddress, 101_000_000, {never: {}}))
    await mustFail(testState.basset.burn_from_cw20_token(blunaContractAddress, testState.wallets.b, testState.wallets.a, 10000))

    // SendFrom
    await mustPass(testState.basset.increase_allowance(blunaContractAddress, testState.wallets.a, testState.wallets.b.key.accAddress, 2 * unbond_amount, {never: {}}))
    let initial_uluna_balance_b = Number((await testState.wallets.b.lcd.bank.balance(testState.wallets.b.key.accAddress)).get("uluna").amount)
    await mustPass(testState.basset.send_from_cw20_token(blunaContractAddress, testState.wallets.b, testState.wallets.a,
        unbond_amount,
        {unbond: {}},
        testState.basset.contractInfo["anchor_basset_hub"].contractAddress))
    await sleep(1000)
    assert.equal(await querier.balance_bluna(testState.wallets.a.key.accAddress), 6_000_000_000)
    await mustPass(emptyBlockWithFixedGas(testState.lcdClient, testState.gasStation, 50))
    await mustPass(testState.basset.finish(testState.wallets.b))
    let uluna_balance_b = Number((await testState.wallets.b.lcd.bank.balance(testState.wallets.b.key.accAddress)).get("uluna").amount)
    await sleep(1000)
    let withdrawal_history = (await querier.all_history()).history
    withdrawal_rate = Number(withdrawal_history[withdrawal_history.length - 1].withdraw_rate)
    assert.equal(uluna_balance_b, initial_uluna_balance_b + unbond_amount * withdrawal_rate)


    await mustPass(testState.basset.decrease_allowance(blunaContractAddress, testState.wallets.a, testState.wallets.b.key.accAddress, unbond_amount, {never: {}}))
    await mustFail(testState.basset.send_from_cw20_token(blunaContractAddress, testState.wallets.b, testState.wallets.a,
        100000,
        {unbond: {}},
        testState.basset.contractInfo["anchor_basset_hub"].contractAddress))

}

main()
    .then(() => console.log("done"))
    .then(async () => {
        // console.log("saving state...");
        // fs.writeFileSync(
        //     "bluna_short_test_action.json",
        //     JSON.stringify(getRecord(), null, 2)
        // );
        // fs.writeFileSync(
        //     "bluna_short_test_state.json",
        //     JSON.stringify(await mantleState.getState(), null, 2)
        // );
    })
    .catch(console.log);
