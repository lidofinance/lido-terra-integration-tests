import * as fs from "fs";
import {mustPass} from "../helper/flow/must";
import {getRecord} from "../helper/flow/record";
import {MantleState} from "../mantle-querier/MantleState";
import {TestState} from "./common";
import {makeContractStoreQuery} from "../mantle-querier/common";
import {GraphQLClient} from "graphql-request";
import {emptyBlockWithFixedGas} from "../helper/flow/gas-station";

let mantleState: MantleState;

async function getStLunaBalance(testState, mantleClient, address) {
    return await makeContractStoreQuery(
        testState.basset.contractInfo["anchor_basset_token_stluna"].contractAddress,
        {balance: {address: address}},
        mantleClient
    ).then((r) => r.balance)
}

async function getHubState(testState, mantleClient) {
    return await makeContractStoreQuery(
        testState.basset.contractInfo["anchor_basset_hub"].contractAddress,
        { state: {}},
        mantleClient
    ).then((r) => r);
}

async function main() {
    const testState = new TestState();
    mantleState = await testState.getMantleState();
    const mantleClient = new GraphQLClient(testState.testkit.deriveMantle());

    let bondAmount = 20_000_000_000_000;

    await mustPass(testState.basset.bond_for_stluna(testState.wallets.a, bondAmount))
    let balanceA = await getStLunaBalance(testState, mantleClient, testState.wallets.a.key.accAddress)
    if (balanceA != bondAmount) {
        throw new Error("invalid stLuna balance")
    }

    await mustPass(testState.basset.update_global_index(testState.wallets.a))

    balanceA = await getStLunaBalance(testState, mantleClient, testState.wallets.a.key.accAddress)
    if (balanceA < bondAmount) {
        throw new Error("invalid stLuna balance")
    }

    await mustPass(testState.basset.bond_for_stluna(testState.wallets.b, bondAmount))

    let balanceB = await getStLunaBalance(testState, mantleClient, testState.wallets.b.key.accAddress)
    if (balanceB >= bondAmount) {
        throw new Error(`invalid stLuna balance: ${balanceB} > ${bondAmount}`)
    }

    await mustPass(testState.basset.update_global_index(testState.wallets.a))

    await mustPass(testState.basset.send_cw20_token(
        testState.basset.contractInfo["anchor_basset_token_stluna"].contractAddress,
        testState.wallets.a,
        bondAmount,
        {unbond: {}},
        testState.basset.contractInfo["anchor_basset_hub"].contractAddress
    ));

    const stLunaBalance = await getStLunaBalance(testState, mantleClient, testState.wallets.a.key.accAddress);
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

    await mustPass(emptyBlockWithFixedGas(testState.lcdClient, testState.gasStation, 50));

    await mustPass(testState.basset.update_global_index(testState.wallets.a))

    await mustPass(testState.basset.send_cw20_token(
        testState.basset.contractInfo["anchor_basset_token_stluna"].contractAddress,
        testState.wallets.b,
        balanceB,
        {unbond: {}},
        testState.basset.contractInfo["anchor_basset_hub"].contractAddress
    ));

    const stLunaBalanceB = await getStLunaBalance(testState, mantleClient, testState.wallets.b.key.accAddress);
    if (stLunaBalanceB > 0) {
        throw new Error("stLuna balance must be zero")
    }

    currentBlockTime = new Date(await mantleState.getCurrentBlockTime());
    withdrawableUnbonded = await makeContractStoreQuery(
        testState.basset.contractInfo["anchor_basset_hub"].contractAddress,
        { withdrawable_unbonded: { address: testState.wallets.b.key.accAddress, block_time: currentBlockTime.getTime()} },
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
