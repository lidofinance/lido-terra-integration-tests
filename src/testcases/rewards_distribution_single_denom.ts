import { mustPass, floateq} from "../helper/flow/must";
import {emptyBlockWithFixedGas} from "../helper/flow/gas-station";
import {TestStateLocalTerra} from "./common_localterra";
import AnchorbAssetQueryHelper, {makeRestStoreQuery} from "../helper/basset_queryhelper";
import {send_transaction} from "../helper/flow/execution";
import {MsgSend} from "@terra-money/terra.js";

function approxeq(a, b, e) {
    return Math.abs(a - b) <= e;
}

async function getLunaBalance(testState: TestStateLocalTerra, address) {
    let balance = await testState.lcdClient.bank.balance(address);
    return balance.get("uluna").amount
}


async function main() {
    const testState = new TestStateLocalTerra()
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
        new MsgSend(testState.wallets.ownerWallet.key.accAddress, testState.basset.contractInfo["anchor_basset_rewards_dispatcher"].contractAddress, "10000000000000uusd"),
    ]));

    await mustPass(emptyBlockWithFixedGas(testState.lcdClient, testState.gasStation, 5));
    await mustPass(testState.basset.update_global_index(testState.wallets.ownerWallet));

    await mustPass(emptyBlockWithFixedGas(testState.lcdClient, testState.gasStation, 5));

    let state = await makeRestStoreQuery(
        testState.basset.contractInfo["anchor_basset_hub"].contractAddress,
        { state: {} },
        testState.lcdClient.config.URL
    ).then((r) => r);

    let result = await testState.basset.update_global_index_with_result(testState.wallets.ownerWallet);

    const stLunaRewardsRegex = /stluna_rewards","value":"([\d]+)/gm;
    const bLunaRewardsRegex = /bluna_rewards","value":"([\d]+)/gm;

    let stLunaRewards = parseInt(stLunaRewardsRegex.exec(result.raw_log)[1]); // in uluna
    let bLunaRewards = parseInt(bLunaRewardsRegex.exec(result.raw_log)[1]); // in uusd

    let uusdExhangeRate = +(await testState.lcdClient.oracle.exchangeRate("uusd")).amount

    // check that bLuna/stLuna rewards (in uusd) ratio is the same as bLuna/stLuna bond ratio with some accuracy due to fees
    // stLuna rewards are rebonded to validators and bLuna rewards are available as rewards for bLuna holders
    if (!floateq(bLunaRewards / (stLunaRewards * uusdExhangeRate), (state.total_bond_bluna_amount / state.total_bond_stluna_amount), 0.003)) {
        throw new Error(`invalid rewards distribution: stLunaRewards=${stLunaRewards * uusdExhangeRate}, 
                                                       bLunaRewards=${bLunaRewards}, 
                                                       stLunaBonded=${state.total_bond_stluna_amount}, 
                                                       bLunaBonded=${state.total_bond_bluna_amount},
                                                       bluna/stLuna rewards ratio = ${bLunaRewards / (stLunaRewards * uusdExhangeRate)},
                                                       blunaBonded/stLunaBonded ratio = ${(state.total_bond_bluna_amount / state.total_bond_stluna_amount)}`);
    }

    const accruedRewards = await makeRestStoreQuery(
        testState.basset.contractInfo["anchor_basset_reward"].contractAddress,
        { accrued_rewards: { address: testState.wallets.b.key.accAddress } },
        testState.lcdClient.config.URL
    ).then((r) => r.rewards);
    if (accruedRewards <= 0) {
        throw new Error("accruedRewards must be more than zero");
    }

    //withdraw stLuna
    await mustPass(testState.basset.send_cw20_token(
        testState.basset.contractInfo["anchor_basset_token_stluna"].contractAddress,
        testState.wallets.a,
        stLunaBondAmount,
        {unbond: {}},
        testState.basset.contractInfo["anchor_basset_hub"].contractAddress
    ));

    const stLunaBalance = await querier.balance_stluna(testState.wallets.a.key.accAddress);
    if (stLunaBalance > 0) {
        throw new Error("stLuna balance must be zero")
    }

    await mustPass(emptyBlockWithFixedGas(testState.lcdClient, testState.gasStation, 5));

    let withdrawableUnbondedStLuna = await makeRestStoreQuery(
        testState.basset.contractInfo["anchor_basset_hub"].contractAddress,
        { withdrawable_unbonded: { address: testState.wallets.a.key.accAddress} },
        testState.lcdClient.config.URL
    ).then((r) => r.withdrawable);
    if (withdrawableUnbondedStLuna <= stLunaBondAmount) {
        throw new Error("withdrawableUnbonded must be more than bond amount")
    }


    //withdraw bLuna
    await mustPass(emptyBlockWithFixedGas(testState.lcdClient, testState.gasStation, 5));
    await mustPass(testState.basset.send_cw20_token(
        testState.basset.contractInfo["anchor_basset_token"].contractAddress,
        testState.wallets.b,
        bLunaBondAmount,
        {unbond: {}},
        testState.basset.contractInfo["anchor_basset_hub"].contractAddress
    ));

    await mustPass(emptyBlockWithFixedGas(testState.lcdClient, testState.gasStation, 5));

    let withdrawableUnbondedBLuna = await makeRestStoreQuery(
        testState.basset.contractInfo["anchor_basset_hub"].contractAddress,
        { withdrawable_unbonded: { address: testState.wallets.b.key.accAddress} },
        testState.lcdClient.config.URL
    ).then((r) => r.withdrawable);
    if (withdrawableUnbondedBLuna != bLunaBondAmount) {
        throw new Error("withdrawableUnbonded is not equal to bonded amount")
    }

    await mustPass(emptyBlockWithFixedGas(testState.lcdClient, testState.gasStation, 5));

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
    if (!approxeq(Number(BigInt(+lunaBalanceAfterWithdraw) - BigInt(+lunaBalanceBeforeWithdraw)), withdrawableUnbondedStLuna, 3)) {
        throw new Error(`withdraw amount is not equal to withdrawableUnbonded: 
                                    ${BigInt(+lunaBalanceAfterWithdraw) - BigInt(+lunaBalanceBeforeWithdraw)} != ${withdrawableUnbondedStLuna}`)
    }
}

main()
    .then(() => console.log("done"))
.catch(console.log);
