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
import {TestStateLocalTestNet} from "./common_localtestnet";
var assert = require('assert');
let mantleState: MantleState;



export default async function main(contracts?: Record<string, number>) {

    const testState = new TestStateLocalTestNet(contracts)
    await testState.init()

    const blunaContractAddress = testState.basset.contractInfo.lido_terra_token.contractAddress
    const querier = new AnchorbAssetQueryHelper(
        testState.lcdClient,
        testState.basset,
    )

    await mustPass(testState.basset.bond(testState.wallets.a, 9_999_000_000))
    assert.equal(await querier.balance_bluna(testState.wallets.a.key.accAddress), 9_999_000_000)

    await mustPass(testState.basset.transfer_cw20_token(
        blunaContractAddress, testState.wallets.a, testState.wallets.b, 1_000_000_000)
    )
    assert.equal(await querier.balance_bluna(testState.wallets.a.key.accAddress), 8_999_000_000)
    assert.equal(await querier.balance_bluna(testState.wallets.b.key.accAddress), 1_000_000_000)

    await mustPass(testState.basset.burn_cw20_token(blunaContractAddress, testState.wallets.b, 100_000_000))
    assert.equal(await querier.balance_bluna(testState.wallets.b.key.accAddress), 900_000_000)


    // unbonding + withdrawal
    const unbond_amount = 1_000_000_000;
    // idx 0 - coins
    // idx 1 - pages, just ignore them
    const initial_uluna_balance = Number((await testState.wallets.a.lcd.bank.balance(testState.wallets.a.key.accAddress))[0].get("uluna").amount)
    await mustPass(testState.basset.send_cw20_token(
        blunaContractAddress,
        testState.wallets.a,
        unbond_amount,
        {unbond: {}},
        testState.basset.contractInfo["lido_terra_hub"].contractAddress
    ))
    assert.equal(await querier.balance_bluna(testState.wallets.a.key.accAddress), 7_999_000_000)
    await mustPass(emptyBlockWithFixedGas(testState.lcdClient, testState.gasStation, 50))
    await mustPass(testState.basset.finish(testState.wallets.a))
    const uluna_balance = Number((await testState.wallets.a.lcd.bank.balance(testState.wallets.a.key.accAddress))[0].get("uluna").amount)
    let withdrawal_rate = Number((await querier.all_history()).history[0].bluna_withdraw_rate)
    assert.equal(uluna_balance, initial_uluna_balance + unbond_amount * withdrawal_rate)




    // mint message allowed only from lido_terra_hub contract as sender
    await mustFail(testState.basset.mint_cw20_token(
        blunaContractAddress,
        testState.wallets.a,
        testState.basset.contractInfo["lido_terra_hub"].contractAddress,
        100000))

    // TransferFrom
    await mustPass(testState.basset.increase_allowance(blunaContractAddress, testState.wallets.a, testState.wallets.b.key.accAddress, 200_000_000, {never: {}}))
    await mustPass(testState.basset.transfer_from_cw20_token(blunaContractAddress, testState.wallets.b, testState.wallets.a, testState.wallets.b, 50_000_000))
    assert.equal(await querier.balance_bluna(testState.wallets.b.key.accAddress), 950_000_000)
    await mustPass(testState.basset.transfer_from_cw20_token(blunaContractAddress, testState.wallets.b, testState.wallets.a, testState.wallets.b, 50_000_000))
    assert.equal(await querier.balance_bluna(testState.wallets.b.key.accAddress), 1_000_000_000)

    await mustPass(testState.basset.decrease_allowance(blunaContractAddress, testState.wallets.a, testState.wallets.b.key.accAddress, 100_000_000, {never: {}}))
    await mustFail(testState.basset.transfer_from_cw20_token(blunaContractAddress, testState.wallets.b, testState.wallets.a, testState.wallets.b, 20000))

    // BurnFrom
    await mustPass(testState.basset.increase_allowance(blunaContractAddress, testState.wallets.a, testState.wallets.b.key.accAddress, 1_000_000_000, {never: {}}))
    await mustPass(testState.basset.burn_from_cw20_token(blunaContractAddress, testState.wallets.b, testState.wallets.a, 899_000_000))
    assert.equal(await querier.balance_bluna(testState.wallets.a.key.accAddress), 7_000_000_000)

    await mustPass(testState.basset.decrease_allowance(blunaContractAddress, testState.wallets.a, testState.wallets.b.key.accAddress, 101_000_000, {never: {}}))
    await mustFail(testState.basset.burn_from_cw20_token(blunaContractAddress, testState.wallets.b, testState.wallets.a, 10000))

    // SendFrom
    await mustPass(testState.basset.increase_allowance(blunaContractAddress, testState.wallets.a, testState.wallets.b.key.accAddress, 2 * unbond_amount, {never: {}}))
    let initial_uluna_balance_b = Number((await testState.wallets.b.lcd.bank.balance(testState.wallets.b.key.accAddress))[0].get("uluna").amount)
    await mustPass(testState.basset.send_from_cw20_token(blunaContractAddress, testState.wallets.b, testState.wallets.a,
        unbond_amount,
        {unbond: {}},
        testState.basset.contractInfo["lido_terra_hub"].contractAddress))
    assert.equal(await querier.balance_bluna(testState.wallets.a.key.accAddress), 6_000_000_000)
    await mustPass(emptyBlockWithFixedGas(testState.lcdClient, testState.gasStation, 50))
    await mustPass(testState.basset.finish(testState.wallets.b))
    let uluna_balance_b = Number((await testState.wallets.b.lcd.bank.balance(testState.wallets.b.key.accAddress))[0].get("uluna").amount)
    let withdrawal_history = (await querier.all_history()).history
    withdrawal_rate = Number(withdrawal_history[withdrawal_history.length - 1].bluna_withdraw_rate)
    assert.equal(uluna_balance_b, initial_uluna_balance_b + unbond_amount * withdrawal_rate)


    await mustPass(testState.basset.decrease_allowance(blunaContractAddress, testState.wallets.a, testState.wallets.b.key.accAddress, unbond_amount, {never: {}}))
    await mustFail(testState.basset.send_from_cw20_token(blunaContractAddress, testState.wallets.b, testState.wallets.a,
        100000,
        {unbond: {}},
        testState.basset.contractInfo["lido_terra_hub"].contractAddress))

}

if (require.main === module) {
    main()
        .then(() => console.log("done"))
        .catch(console.log);
}
