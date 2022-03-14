import {floateq, mustPass} from "../helper/flow/must";
import {send_transaction} from "../helper/flow/execution";
import {MsgSend} from "@terra-money/terra.js";
import {TestStateLocalTerra} from "./common_localterra";
import {makeRestStoreQuery} from "../helper/basset_queryhelper";
import {emptyBlockWithFixedGas} from "../helper/flow/gas-station";
import {checkRewardDistribution, defaultSleepTime, sleep, TestStateLocalTestNet} from "./common_localtestnet";

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

    await mustPass(checkRewardDistribution(testState))


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
