import * as fs from "fs";
import { mustPass } from "../helper/flow/must";
import { getRecord } from "../helper/flow/record";
import { MantleState } from "../mantle-querier/MantleState";
import {TestState} from "./common";
import {makeContractStoreQuery} from "../mantle-querier/common";
import {GraphQLClient} from "graphql-request";

let mantleState: MantleState;

async function main() {
    const testState = new TestState();
    mantleState = await testState.getMantleState();
    const mantleClient = new GraphQLClient(testState.testkit.deriveMantle());

    let bondAmount = 20_000_000_000_000;

    await mustPass(testState.basset.bond_for_stluna(testState.wallets.a, bondAmount))

    await mustPass(testState.basset.update_global_index(testState.wallets.a))

    await mustPass(testState.basset.send_cw20_token(
        testState.basset.contractInfo["anchor_basset_token_stluna"].contractAddress,
        testState.wallets.a,
        bondAmount,
        {unbond: {}},
        testState.basset.contractInfo["anchor_basset_hub"].contractAddress
    ));

    const stLunaBalance = await makeContractStoreQuery(
        testState.basset.contractInfo["anchor_basset_token_stluna"].contractAddress,
        { balance: { address: testState.wallets.a.key.accAddress } },
        mantleClient
    ).then((r) => r.balance);

    if (stLunaBalance > 0) {
        throw new Error("stLuna balance must be zero")
    }

    let currentBlockTime = new Date(await mantleState.getCurrentBlockTime());
    let withdrawableUnbonded = await makeContractStoreQuery(
        testState.basset.contractInfo["anchor_basset_hub"].contractAddress,
        { withdrawable_unbonded: { address: testState.wallets.a.key.accAddress, block_time: currentBlockTime.getTime()} },
        mantleClient
    ).then((r) => r.withdrawable);
    if (withdrawableUnbonded <= bondAmount) {
        throw new Error("withdrawableUnbonded must be more than bond amount")
    }
}

main()
    .then(() => console.log("done"))
    .then(async () => {
        console.log("saving state...");
        fs.writeFileSync(
            "rewards_st_luna.json",
            JSON.stringify(getRecord(), null, 2)
        );
        fs.writeFileSync(
            "rewards_st_luna.json",
            JSON.stringify(await mantleState.getState(), null, 2)
        );
    })
.catch(console.log);
