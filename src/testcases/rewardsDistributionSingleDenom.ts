import * as fs from "fs";
import { mustPass } from "../helper/flow/must";
import { getRecord } from "../helper/flow/record";
import { MantleState } from "../mantle-querier/MantleState";
import {TestState} from "./common";
import {makeBalanceQuery, makeContractStoreQuery} from "../mantle-querier/common";
import {GraphQLClient} from "graphql-request";
import {emptyBlockWithFixedGas} from "../helper/flow/gas-station";
import {send_transaction} from "../helper/flow/execution";
import {MsgSend} from "@terra-money/terra.js";

let mantleState: MantleState;

function approxeq(a, b, e) {
    return Math.abs(a - b) < e;
}

async function main() {
    const testState = new TestState();
    mantleState = await testState.getMantleState();
    const mantleClient = new GraphQLClient(testState.testkit.deriveMantle());

    let stLunaBondAmount = 20000000000000;
    let bLunaBondAmount = 10000000000000;

    await mustPass(testState.basset.bond_for_stluna(testState.wallets.a, stLunaBondAmount))
    await mustPass(testState.basset.bond(testState.wallets.b, bLunaBondAmount))

    let result = await testState.basset.update_global_index_with_result(testState.wallets.ownerWallet);

    const stLunaRewardsRegex = /stluna_rewards_amount","value":"([\d]+)"/gm;
    const bLunaRewardsRegex = /bluna_rewards_amount","value":"([\d]+)"/gm;

    let stLunaRewards = parseInt(stLunaRewardsRegex.exec(result.raw_log)[1]);
    let bLunaRewards = parseInt(bLunaRewardsRegex.exec(result.raw_log)[1]);

    if (!approxeq(bLunaRewards / stLunaRewards, bLunaBondAmount / stLunaBondAmount, 0.05)) {
        throw new Error(`invalid rewards distribution: stLunaRewards=${stLunaRewards}, bLunaRewards=${bLunaRewards}, stLunaBonded=${stLunaBondAmount}, bLunaBonded=${bLunaBondAmount}`);
    }

    const accruedRewards = await makeContractStoreQuery(
        testState.basset.contractInfo["anchor_basset_reward"].contractAddress,
        { accrued_rewards: { address: testState.wallets.b.key.accAddress } },
        mantleClient
    ).then((r) => r.rewards);
    if (accruedRewards <= 0) {
        throw new Error("accruedRewards must be more than zero");
    }
}

main()
    .then(() => console.log("done"))
    .then(async () => {
        console.log("saving state...");
        fs.writeFileSync(
            "rewards.json",
            JSON.stringify(getRecord(), null, 2)
        );
        fs.writeFileSync(
            "rewards.json",
            JSON.stringify(await mantleState.getState(), null, 2)
        );
    })
// .catch(console.log);
