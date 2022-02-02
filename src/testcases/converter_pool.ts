import * as fs from 'fs'
import { floateq as floateq, mustPass } from "../helper/flow/must";
import { emptyBlockWithFixedGas } from "../helper/flow/gas-station";
import {get_expected_sum_from_requests} from "./common_localterra";
import AnchorbAssetQueryHelper, {makeRestStoreQuery} from "../helper/basset_queryhelper";
import * as assert from "assert";
import {disconnectValidator, TestStateLocalTestNet, vals} from "./common_localtestnet";
import {makeContractStoreQuery} from "../mantle-querier/common";

function approxeq(a, b, e) {
    console.log(a, b);
    return Math.abs(a - b) <= e;
}

async function simulation_query(url, converterContractAddress, offerTokenAddress, amount) {
    let queryResp = await makeRestStoreQuery(converterContractAddress, {simulation: {offer_asset: {amount: amount, info: {token: {contract_addr: offerTokenAddress}}}}}, url);
    return queryResp.return_amount
}

async function reverse_simulation_query(url, converterContractAddress, askTokenAddress, amount) {
    let queryResp = await makeRestStoreQuery(converterContractAddress, {reverse_simulation: {ask_asset: {amount: amount, info: {token: {contract_addr: askTokenAddress}}}}}, url);
    return queryResp.offer_amount
}

async function main() {
    const testState = new TestStateLocalTestNet()
    await testState.init()
    const querier = new AnchorbAssetQueryHelper(
        testState.lcdClient,
        testState.basset,
    )

    const blunaContractAddress = testState.basset.contractInfo.lido_terra_token.contractAddress
    const stlunaContractAddress = testState.basset.contractInfo.lido_terra_token_stluna.contractAddress
    const converterContractAddress = testState.converter.contractInfo.lido_terra_stluna_bluna_converter_contract.contractAddress;

    await mustPass(testState.basset.add_validator(testState.wallets.ownerWallet, vals[1].address))
    await mustPass(testState.basset.add_validator(testState.wallets.ownerWallet, vals[2].address))
    await mustPass(testState.basset.add_validator(testState.wallets.ownerWallet, vals[3].address))

    let stLunaBondAmount = 20_000_000_000;
    let bLunaBondAmount = 20_000_000_000;

    await mustPass(testState.basset.bond_for_stluna(testState.wallets.a, stLunaBondAmount))
    await mustPass(testState.basset.bond(testState.wallets.b, bLunaBondAmount))

    await mustPass(emptyBlockWithFixedGas(testState.lcdClient, testState.gasStation, 10));
    await mustPass(testState.basset.update_global_index(testState.wallets.ownerWallet));

    // I want to swap 10 stluna to bluna. I should get the same amount as simulation tells
    let swapAmount = "10000000";
    let returnbLunaAmount = await simulation_query(testState.lcdClient.config.URL, converterContractAddress, stlunaContractAddress, swapAmount);

    // check reverse simulation query
    // what amount of stLuna should I provide to get returnbLunaAmount above?
    let offerstLunaAmount = await reverse_simulation_query(testState.lcdClient.config.URL, converterContractAddress, blunaContractAddress, returnbLunaAmount);
    assert.ok(approxeq(+swapAmount, +offerstLunaAmount, 1));

    let bLunaBalanceBeforeSwap = await querier.balance_bluna(testState.wallets.a.key.accAddress);
    await mustPass(testState.converter.swap(testState.wallets.a, +swapAmount, stlunaContractAddress));
    let bLunaBalanceAfterSwap = await querier.balance_bluna(testState.wallets.a.key.accAddress);
    assert.strictEqual(bLunaBalanceAfterSwap - bLunaBalanceBeforeSwap, +returnbLunaAmount);

    // I want to swap 10 bluna to stluna. I should get the same amount as simulation tells. But lets get the return amount
    // on another address
    let returnstLunaAmount = await simulation_query(testState.lcdClient.config.URL, converterContractAddress, blunaContractAddress, swapAmount);

    // check reverse simulation query
    // what amount of bLuna should I provide to get returnstLunaAmount above?
    let offerbLunaAmount = await reverse_simulation_query(testState.lcdClient.config.URL, converterContractAddress, stlunaContractAddress, returnstLunaAmount);
    assert.ok(approxeq(+swapAmount, +offerbLunaAmount, 1));

    let stLunaBalanceBeforeSwap = await querier.balance_stluna(testState.wallets.c.key.accAddress);
    await mustPass(testState.converter.swap(testState.wallets.b, +swapAmount, blunaContractAddress, testState.wallets.c.key.accAddress));
    let stLunaBalanceAfterSwap = await querier.balance_stluna(testState.wallets.c.key.accAddress);
    assert.strictEqual(stLunaBalanceAfterSwap - stLunaBalanceBeforeSwap, +returnstLunaAmount);


    //slashing happens
    await disconnectValidator("terradnode1")
    await testState.waitForJailed("terradnode1")

    await mustPass(emptyBlockWithFixedGas(testState.lcdClient, testState.gasStation, 20))
    await mustPass(testState.basset.update_global_index(testState.wallets.ownerWallet));

    // I want to swap 10 stluna to bluna again. I should get the same amount as simulation tells
    returnbLunaAmount = await simulation_query(testState.lcdClient.config.URL, converterContractAddress, stlunaContractAddress, swapAmount);

    // check reverse simulation query
    // what amount of stLuna should I provide to get returnbLunaAmount above?
    offerstLunaAmount = await reverse_simulation_query(testState.lcdClient.config.URL, converterContractAddress, blunaContractAddress, returnbLunaAmount);
    assert.ok(approxeq(+swapAmount, +offerstLunaAmount, 2));

    bLunaBalanceBeforeSwap = await querier.balance_bluna(testState.wallets.a.key.accAddress);
    await mustPass(testState.converter.swap(testState.wallets.a, +swapAmount, stlunaContractAddress));
    bLunaBalanceAfterSwap = await querier.balance_bluna(testState.wallets.a.key.accAddress);
    assert.strictEqual(bLunaBalanceAfterSwap - bLunaBalanceBeforeSwap, +returnbLunaAmount);

    // I want to swap 10 bluna to stluna. I should get the same amount as simulation tells
    returnstLunaAmount = await simulation_query(testState.lcdClient.config.URL, converterContractAddress, blunaContractAddress, swapAmount);

    // check reverse simulation query
    // what amount of bLuna should I provide to get returnstLunaAmount above?
    offerbLunaAmount = await reverse_simulation_query(testState.lcdClient.config.URL, converterContractAddress, stlunaContractAddress, returnstLunaAmount);
    assert.ok(approxeq(+swapAmount, +offerbLunaAmount, 3));

    stLunaBalanceBeforeSwap = await querier.balance_stluna(testState.wallets.b.key.accAddress);
    await mustPass(testState.converter.swap(testState.wallets.b, +swapAmount, blunaContractAddress));
    stLunaBalanceAfterSwap = await querier.balance_stluna(testState.wallets.b.key.accAddress);
    assert.strictEqual(stLunaBalanceAfterSwap - stLunaBalanceBeforeSwap, +returnstLunaAmount);

}

main()
    .then(() => console.log('done'))
    .catch(console.log)