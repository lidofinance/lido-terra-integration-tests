import {floateq, mustPass} from "../helper/flow/must";
import {send_transaction} from "../helper/flow/execution";
import {MsgSend} from "@terra-money/terra.js";
import {TestStateLocalTerra} from "./common_localterra";
import {makeRestStoreQuery} from "../helper/basset_queryhelper";
import {emptyBlockWithFixedGas} from "../helper/flow/gas-station";
import {defaultSleepTime, sleep, TestStateLocalTestNet} from "./common_localtestnet";

export default async function main(contracts?: Record<string, number>) {
    const testState = new TestStateLocalTestNet(contracts)
    await testState.init()

    let stLunaBondAmount = 20_000_000_000;
    let bLunaBondAmount = 20_000_000_000;

    await mustPass(testState.basset.bond_for_stluna(testState.wallets.a, stLunaBondAmount))
    await mustPass(testState.basset.bond(testState.wallets.b, bLunaBondAmount))

    await mustPass(testState.basset.bond_for_stluna(testState.wallets.a, stLunaBondAmount))
    await mustPass(testState.basset.bond(testState.wallets.b, bLunaBondAmount))

    await sleep(defaultSleepTime)
    await mustPass(testState.basset.update_global_index(testState.wallets.ownerWallet));

    await sleep(defaultSleepTime)
    await mustPass(testState.basset.update_global_index(testState.wallets.ownerWallet));

    await sleep(defaultSleepTime)

    await mustPass(send_transaction(testState.wallets.ownerWallet, [
        new MsgSend(testState.wallets.ownerWallet.key.accAddress, testState.basset.contractInfo["lido_terra_rewards_dispatcher"].contractAddress, "1000000ukrw,1000000usdr,1000000umnt,10000000000000uusd"),
    ]));

    await sleep(defaultSleepTime)
    await mustPass(testState.basset.update_global_index(testState.wallets.ownerWallet));

    await sleep(defaultSleepTime)

    let state = await makeRestStoreQuery(
        testState.basset.contractInfo["lido_terra_hub"].contractAddress,
        {state: {}},
        testState.lcdClient.config.URL
    ).then((r) => r);

    let result = await testState.basset.update_global_index_with_result(testState.wallets.ownerWallet);

    const stLunaRewardsRegex = /stluna_rewards","value":"([\d]+)/gm;
    const bLunaRewardsRegex = /bluna_rewards","value":"([\d]+)/gm;
    const swapFeeRegex = /"swap_fee","value":"([\d]+)/gm;


    let stLunaRewards = parseInt(stLunaRewardsRegex.exec(result.raw_log)[1]); // in uluna
    let bLunaRewards = parseInt(bLunaRewardsRegex.exec(result.raw_log)[1]); // in uusd
    let swapFee = parseInt(swapFeeRegex.exec(result.raw_log)[1]) // for some reason swap fee in localtestnet are huge, we cannot ignore them

    const blunaRewardWithSwapFee = bLunaRewards + swapFee
    let uusdExhangeRate = +(await testState.lcdClient.oracle.exchangeRate("uusd")).amount

    // check that bLuna/stLuna rewards (in uusd) ratio is the same as bLuna/stLuna bond ratio with some accuracy due to fees
    // stLuna rewards are rebonded to validators and bLuna rewards are available as rewards for bLuna holders
    if (!floateq(blunaRewardWithSwapFee / (stLunaRewards * uusdExhangeRate), (state.total_bond_bluna_amount / state.total_bond_stluna_amount), 0.02)) {
        throw new Error(`invalid rewards distribution: stLunaRewards=${stLunaRewards * uusdExhangeRate}, 
                                                       blunaRewardWithSwapFee=${blunaRewardWithSwapFee}, 
                                                       stLunaBonded=${state.total_bond_stluna_amount}, 
                                                       bLunaBonded=${state.total_bond_bluna_amount},
                                                       bluna/stLuna rewards ratio = ${blunaRewardWithSwapFee / (stLunaRewards * uusdExhangeRate)},
                                                       blunaBonded/stLunaBonded ratio = ${(state.total_bond_bluna_amount / state.total_bond_stluna_amount)}`);
    }

    await sleep(defaultSleepTime)

    const accruedRewards = await makeRestStoreQuery(
        testState.basset.contractInfo["lido_terra_reward"].contractAddress,
        {accrued_rewards: {address: testState.wallets.b.key.accAddress}},
        testState.lcdClient.config.URL
    ).then((r) => r.rewards);
    if (accruedRewards <= 0) {
        throw new Error("accruedRewards must be more than zero");
    }
}


if (require.main === module) {
    main()
        .then(() => console.log("done"))
        .catch(console.log);
}
