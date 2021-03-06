import {mustPass, floateq} from "../helper/flow/must";
import {emptyBlockWithFixedGas} from "../helper/flow/gas-station";
import {TestStateLocalTerra} from "./common_localterra";
import AnchorbAssetQueryHelper, {makeRestStoreQuery} from "../helper/basset_queryhelper";
import {send_transaction} from "../helper/flow/execution";
import {MsgSend} from "@terra-money/terra.js";
import {checkRewardDistribution, defaultSleepTime, sleep, TestStateLocalTestNet} from "./common_localtestnet";
import * as fs from "fs";


function approxeq(a, b, e) {
    return Math.abs(a - b) <= e;
}

async function getLunaBalance(testState: TestStateLocalTestNet, address) {
    let balance = await testState.lcdClient.bank.balance(address);
    return balance[0].get("uluna").amount
}

const emptyBlocks = 10

export default async function main(contracts?: Record<string, number>) {
    const testState = new TestStateLocalTestNet(contracts)
    await testState.init()
    const querier = new AnchorbAssetQueryHelper(
        testState.lcdClient,
        testState.basset,
    )

    let stLunaBondAmount = 20_000_000_000;
    let bLunaBondAmount = 20_000_000_000;

    await mustPass(testState.basset.bond_for_stluna(testState.wallets.a, stLunaBondAmount))
    await mustPass(testState.basset.bond(testState.wallets.b, bLunaBondAmount))

    // let's pretened we've got a huge rewards amount somehow
    await mustPass(send_transaction(testState.wallets.ownerWallet, [
        new MsgSend(testState.wallets.ownerWallet.key.accAddress, testState.basset.contractInfo["lido_terra_rewards_dispatcher"].contractAddress, "10000000000000uusd"),
    ]));

    await mustPass(testState.basset.update_global_index(testState.wallets.ownerWallet));


    await mustPass(checkRewardDistribution(testState))

    const accruedRewards = await makeRestStoreQuery(
        testState.basset.contractInfo["lido_terra_reward"].contractAddress,
        {accrued_rewards: {address: testState.wallets.b.key.accAddress}},
        testState.lcdClient.config.URL
    ).then((r) => r.rewards);
    if (accruedRewards <= 0) {
        throw new Error("accruedRewards must be more than zero");
    }

    //withdraw stLuna
    await mustPass(testState.basset.send_cw20_token(
        testState.basset.contractInfo["lido_terra_token_stluna"].contractAddress,
        testState.wallets.a,
        stLunaBondAmount,
        {unbond: {}},
        testState.basset.contractInfo["lido_terra_hub"].contractAddress
    ));

    const stLunaBalance = await querier.balance_stluna(testState.wallets.a.key.accAddress);
    if (stLunaBalance > 0) {
        throw new Error("stLuna balance must be zero")
    }

    await sleep(defaultSleepTime)

    let withdrawableUnbondedStLuna = await makeRestStoreQuery(
        testState.basset.contractInfo["lido_terra_hub"].contractAddress,
        {withdrawable_unbonded: {address: testState.wallets.a.key.accAddress}},
        testState.lcdClient.config.URL
    ).then((r) => r.withdrawable);
    if (withdrawableUnbondedStLuna <= stLunaBondAmount) {
        throw new Error("withdrawableUnbonded must be more than bond amount")
    }


    //withdraw bLuna
    await sleep(defaultSleepTime)
    await mustPass(testState.basset.send_cw20_token(
        testState.basset.contractInfo["lido_terra_token"].contractAddress,
        testState.wallets.b,
        bLunaBondAmount,
        {unbond: {}},
        testState.basset.contractInfo["lido_terra_hub"].contractAddress
    ));

    await sleep(defaultSleepTime)

    let withdrawableUnbondedBLuna = await makeRestStoreQuery(
        testState.basset.contractInfo["lido_terra_hub"].contractAddress,
        {withdrawable_unbonded: {address: testState.wallets.b.key.accAddress}},
        testState.lcdClient.config.URL
    ).then((r) => r.withdrawable);
    if (withdrawableUnbondedBLuna != bLunaBondAmount) {
        throw new Error(`withdrawableUnbonded(${withdrawableUnbondedBLuna}) is not equal to bonded(${bLunaBondAmount}) amount`)
    }

    await sleep(defaultSleepTime)

    let lunaBalanceBeforeWithdrawB = await getLunaBalance(testState, testState.wallets.b.key.accAddress);
    await mustPass(testState.basset.finish(testState.wallets.b));
    let lunaBalanceAfterWithdrawB = await getLunaBalance(testState, testState.wallets.b.key.accAddress);
    // we lose 1-2 uluna because of Decimal logic
    if (BigInt(+lunaBalanceAfterWithdrawB) - BigInt(+lunaBalanceBeforeWithdrawB) != BigInt(withdrawableUnbondedBLuna)) {
        throw new Error(`withdraw amount is not equal to withdrawableUnboned: 
                                    ${BigInt(+lunaBalanceAfterWithdrawB) - BigInt(+lunaBalanceBeforeWithdrawB)} != ${withdrawableUnbondedBLuna}`)
    }

    let lunaBalanceBeforeWithdraw = await getLunaBalance(testState, testState.wallets.a.key.accAddress);
    await mustPass(testState.basset.finish(testState.wallets.a));
    let lunaBalanceAfterWithdraw = await getLunaBalance(testState, testState.wallets.a.key.accAddress);
    // we lose 1-2 uluna because of Decimal logic
    console.log(lunaBalanceAfterWithdraw, lunaBalanceBeforeWithdraw)
    if (!approxeq(Number(BigInt(+lunaBalanceAfterWithdraw) - BigInt(+lunaBalanceBeforeWithdraw)), withdrawableUnbondedStLuna, 3)) {
        throw new Error(`withdraw amount is not equal to withdrawableUnbonded: 
                                    ${BigInt(+lunaBalanceAfterWithdraw) - BigInt(+lunaBalanceBeforeWithdraw)} != ${withdrawableUnbondedStLuna}`)
    }
}


if (require.main === module) {
    main()
        .then(() => console.log("done"))
        .catch(console.log);
}
