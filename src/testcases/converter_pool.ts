import * as fs from 'fs'
import { floateq as floateq, mustPass } from "../helper/flow/must";
import { emptyBlockWithFixedGas } from "../helper/flow/gas-station";
import {get_expected_sum_from_requests} from "./common_localterra";
import AnchorbAssetQueryHelper, {makeRestStoreQuery} from "../helper/basset_queryhelper";
import * as assert from "assert";
import {disconnectValidator, TestStateLocalTestNet, vals} from "./common_localtestnet";
import {makeContractStoreQuery} from "../mantle-querier/common";


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

    let stLunaBondAmount = 20_000_000_000;
    let bLunaBondAmount = 20_000_000_000;

    await mustPass(testState.basset.bond_for_stluna(testState.wallets.a, stLunaBondAmount))
    await mustPass(testState.basset.bond(testState.wallets.b, bLunaBondAmount))

    await mustPass(emptyBlockWithFixedGas(testState.lcdClient, testState.gasStation, 10));
    await mustPass(testState.basset.update_global_index(testState.wallets.ownerWallet));

    // want to swap 10 stluna to bluna. I should get the same amount as simulation tells
    let swapAmount = "10000000";
    let returnbLunaAmount = await simulation_query(testState.lcdClient.config.URL, converterContractAddress, stlunaContractAddress, swapAmount);
    let bLunaBalanceBeforeSwap = await querier.balance_bluna(testState.wallets.a.key.accAddress);
    await mustPass(testState.converter.swap(testState.wallets.a, +swapAmount, stlunaContractAddress));
    let bLunaBalanceAfterSwap = await querier.balance_bluna(testState.wallets.a.key.accAddress);
    assert.strictEqual(bLunaBalanceAfterSwap - bLunaBalanceBeforeSwap, +returnbLunaAmount);

    // want to swap 10 bluna to stluna. I should get the same amount as simulation tells
    let returnstLunaAmount = await simulation_query(testState.lcdClient.config.URL, converterContractAddress, blunaContractAddress, swapAmount);
    let stLunaBalanceBeforeSwap = await querier.balance_stluna(testState.wallets.b.key.accAddress);
    await mustPass(testState.converter.swap(testState.wallets.b, +swapAmount, blunaContractAddress));
    let stLunaBalanceAfterSwap = await querier.balance_stluna(testState.wallets.b.key.accAddress);
    assert.strictEqual(stLunaBalanceAfterSwap - stLunaBalanceBeforeSwap, +returnstLunaAmount);


    //slashing happens
    await disconnectValidator("terradnode1")
    await testState.waitForJailed("terradnode1")

    await mustPass(emptyBlockWithFixedGas(testState.lcdClient, testState.gasStation, 20))
    // await mustPass(testState.basset.update_global_index(testState.wallets.ownerWallet));

    await mustPass(testState.basset.slashing(testState.wallets.a))
    await mustPass(testState.basset.slashing(testState.wallets.b))

    console.log("KEKKEKEKE", await querier.bluna_exchange_rate());

    // I want to swap 10 stluna to bluna again. I should get the same amount as simulation tells
    returnbLunaAmount = await simulation_query(testState.lcdClient.config.URL, converterContractAddress, stlunaContractAddress, swapAmount);
    bLunaBalanceBeforeSwap = await querier.balance_bluna(testState.wallets.a.key.accAddress);
    await mustPass(testState.converter.swap(testState.wallets.a, +swapAmount, stlunaContractAddress));
    bLunaBalanceAfterSwap = await querier.balance_bluna(testState.wallets.a.key.accAddress);
    assert.strictEqual(bLunaBalanceAfterSwap - bLunaBalanceBeforeSwap, +returnbLunaAmount);

    // I want to swap 10 bluna to stluna. I should get the same amount as simulation tells
    returnstLunaAmount = await simulation_query(testState.lcdClient.config.URL, converterContractAddress, blunaContractAddress, swapAmount);
    stLunaBalanceBeforeSwap = await querier.balance_stluna(testState.wallets.b.key.accAddress);
    await mustPass(testState.converter.swap(testState.wallets.b, +swapAmount, blunaContractAddress));
    stLunaBalanceAfterSwap = await querier.balance_stluna(testState.wallets.b.key.accAddress);
    assert.strictEqual(stLunaBalanceAfterSwap - stLunaBalanceBeforeSwap, +returnstLunaAmount);

}

main()
    .then(() => console.log('done'))
    .catch(console.log)