import { mustPass } from "../helper/flow/must";
import {send_transaction} from "../helper/flow/execution";
import {MsgSend} from "@terra-money/terra.js";
import {TestStateLocalTerra} from "./common_localterra";
import {makeRestStoreQuery} from "../helper/basset_queryhelper";
import {emptyBlockWithFixedGas} from "../helper/flow/gas-station";


function approxeq(a, b, e) {
    return Math.abs(a - b) < e;
}

async function main() {
    const testState = new TestStateLocalTerra()
    await testState.init()

    let stLunaBondAmount = 10_000_000_000_000;
    let bLunaBondAmount = 20_000_000_000;

    await mustPass(testState.basset.bond_for_stluna(testState.wallets.a, stLunaBondAmount))
    await mustPass(testState.basset.bond(testState.wallets.b, bLunaBondAmount))

    await mustPass(send_transaction(testState.wallets.ownerWallet, [
        new MsgSend(testState.wallets.ownerWallet.key.accAddress, testState.basset.contractInfo["anchor_basset_rewards_dispatcher"].contractAddress, "1000000uluna,1000000ukrw,1000000usdr,1000000umnt"),
    ]));

    let result = await testState.basset.update_global_index_with_result(testState.wallets.ownerWallet);

    const stLunaRewardsRegex = /stluna_rewards","value":"([\d]+)/gm;
    const bLunaRewardsRegex = /bluna_rewards","value":"([\d]+)/gm;

    let stLunaRewards = parseInt(stLunaRewardsRegex.exec(result.raw_log)[1]); // in uluna
    let bLunaRewards = parseInt(bLunaRewardsRegex.exec(result.raw_log)[1]); // in uusd

    let uusdExhangeRate = +(await testState.lcdClient.oracle.exchangeRate("uusd")).amount

    // check that bLuna/stLuna rewards (in uusd) ratio is the same as bLuna/stLuna bond ratio with some accuracy due to fees
    // stLuna rewards is rebonded to validators and bLunaRewards is available as rewards for bLuna holders
    if (!approxeq(bLunaRewards / (stLunaRewards * uusdExhangeRate), bLunaBondAmount / stLunaBondAmount, 0.05)) {
        throw new Error(`invalid rewards distribution: stLunaRewards=${stLunaRewards}, 
                                                       bLunaRewards=${bLunaRewards}, 
                                                       stLunaBonded=${stLunaBondAmount}, 
                                                       bLunaBonded=${bLunaBondAmount}`);
    }

    await mustPass(emptyBlockWithFixedGas(testState.lcdClient, testState.gasStation, 5));

    const accruedRewards = await makeRestStoreQuery(
        testState.basset.contractInfo["anchor_basset_reward"].contractAddress,
        { accrued_rewards: { address: testState.wallets.b.key.accAddress } },
        testState.lcdClient.config.URL
    ).then((r) => r.rewards);
    if (accruedRewards <= 0) {
        throw new Error("accruedRewards must be more than zero");
    }
}

main()
    .then(() => console.log("done"))
.catch(console.log);
