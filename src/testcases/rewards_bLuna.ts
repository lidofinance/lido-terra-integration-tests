import * as fs from "fs";
import { mustPass } from "../helper/flow/must";
import { getRecord } from "../helper/flow/record";
import { MantleState } from "../mantle-querier/MantleState";
import {TestState} from "./common";
import {makeBalanceQuery, makeContractStoreQuery} from "../mantle-querier/common";
import {GraphQLClient} from "graphql-request";
import {emptyBlockWithFixedGas} from "../helper/flow/gas-station";

let mantleState: MantleState;

function approxeq(a, b, e) {
    return Math.abs(a - b) <= e;
}

async function getLunaBalance(testState, mantleClient, address) {
    let balance = await makeBalanceQuery(address, mantleClient);
    for (let i = 0; i < balance.Response.Result.length; i++) {
        if (balance.Response.Result[i].Denom == "uluna") {
            return balance.Response.Result[i].Amount
        }
    }
    return null
}

async function main() {
    const testState = new TestState();
    mantleState = await testState.getMantleState();
    const mantleClient = new GraphQLClient(testState.testkit.deriveMantle());

    let bondAmount = 20_000_000_000_000;

    await mustPass(testState.basset.bond(testState.wallets.a, bondAmount))
    await mustPass(testState.basset.bond(testState.wallets.b, bondAmount))

    await mustPass(testState.basset.update_global_index(testState.wallets.a))

    await mustPass(testState.basset.send_cw20_token(
        testState.basset.contractInfo["anchor_basset_token"].contractAddress,
        testState.wallets.a,
        bondAmount,
        {unbond: {}},
        testState.basset.contractInfo["anchor_basset_hub"].contractAddress
    ));

    const bLunaBalance = await makeContractStoreQuery(
        testState.basset.contractInfo["anchor_basset_token"].contractAddress,
        { balance: { address: testState.wallets.a.key.accAddress } },
        mantleClient
    ).then((r) => r.balance);

    if (bLunaBalance > 0) {
        throw new Error("bLuna balance must be zero")
    }

    let accruedRewards = await makeContractStoreQuery(
        testState.basset.contractInfo["anchor_basset_reward"].contractAddress,
        { accrued_rewards: { address: testState.wallets.a.key.accAddress } },
        mantleClient
    ).then((r) => r.rewards);
    if (accruedRewards <= 0) {
        throw new Error("accruedRewards must be more than zero");
    }

    await mustPass(emptyBlockWithFixedGas(testState.lcdClient, testState.gasStation, 50));

    let currentBlockTime = new Date(await mantleState.getCurrentBlockTime());
    let withdrawableUnbonded = await makeContractStoreQuery(
        testState.basset.contractInfo["anchor_basset_hub"].contractAddress,
        { withdrawable_unbonded: { address: testState.wallets.a.key.accAddress, block_time: currentBlockTime.getTime()} },
        mantleClient
    ).then((r) => r.withdrawable);
    if (withdrawableUnbonded != bondAmount) {
        throw new Error("withdrawableUnbonded is not equal to bonded amount")
    }

    let lunaBalanceBeforeWithdraw = await getLunaBalance(testState, mantleClient, testState.wallets.a.key.accAddress);
    await mustPass(testState.basset.finish(testState.wallets.a));
    let lunaBalanceAfterWithdraw = await getLunaBalance(testState, mantleClient, testState.wallets.a.key.accAddress);
    // we lose 1-2 uluna because of Decimal logic
    if (!approxeq(Number(BigInt(lunaBalanceAfterWithdraw) - BigInt(lunaBalanceBeforeWithdraw)), withdrawableUnbonded, 2)) {
        throw new Error(`withdraw amount is not equal to withdrawableUnboned: 
                                    ${BigInt(lunaBalanceAfterWithdraw) - BigInt(lunaBalanceBeforeWithdraw)} != ${withdrawableUnbonded}`)
    }

    await mustPass(emptyBlockWithFixedGas(testState.lcdClient, testState.gasStation, 50));

    await mustPass(testState.basset.update_global_index(testState.wallets.a))

    await mustPass(testState.basset.send_cw20_token(
        testState.basset.contractInfo["anchor_basset_token"].contractAddress,
        testState.wallets.b,
        bondAmount,
        {unbond: {}},
        testState.basset.contractInfo["anchor_basset_hub"].contractAddress
    ));

    accruedRewards = await makeContractStoreQuery(
        testState.basset.contractInfo["anchor_basset_reward"].contractAddress,
        { accrued_rewards: { address: testState.wallets.b.key.accAddress } },
        mantleClient
    ).then((r) => r.rewards);
    if (accruedRewards <= 0) {
        throw new Error("accruedRewards must be more than zero");
    }

    currentBlockTime = new Date(await mantleState.getCurrentBlockTime());
    withdrawableUnbonded = await makeContractStoreQuery(
        testState.basset.contractInfo["anchor_basset_hub"].contractAddress,
        { withdrawable_unbonded: { address: testState.wallets.b.key.accAddress, block_time: currentBlockTime.getTime()} },
        mantleClient
    ).then((r) => r.withdrawable);
    if (withdrawableUnbonded != bondAmount) {
        throw new Error(`withdrawableUnbonded is not equal to bonded amount: ${withdrawableUnbonded} != ${bondAmount}`)
    }

    await mustPass(emptyBlockWithFixedGas(testState.lcdClient, testState.gasStation, 50));

    lunaBalanceBeforeWithdraw = await getLunaBalance(testState, mantleClient, testState.wallets.b.key.accAddress);
    await mustPass(testState.basset.finish(testState.wallets.b));
    lunaBalanceAfterWithdraw = await getLunaBalance(testState, mantleClient, testState.wallets.b.key.accAddress);
    // we lose 1-2 uluna because of Decimal logic
    if (!approxeq(Number(BigInt(lunaBalanceAfterWithdraw) - BigInt(lunaBalanceBeforeWithdraw)), withdrawableUnbonded, 2)) {
        throw new Error(`withdraw amount is not equal to withdrawableUnboned: 
                                    ${BigInt(lunaBalanceAfterWithdraw) - BigInt(lunaBalanceBeforeWithdraw)} != ${withdrawableUnbonded}`)
    }

}

main()
    .then(() => console.log("done"))
    .then(async () => {
        console.log("saving state...");
        fs.writeFileSync(
            "rewards_bluna.json",
            JSON.stringify(getRecord(), null, 2)
        );
        fs.writeFileSync(
            "rewards_bluna.json",
            JSON.stringify(await mantleState.getState(), null, 2)
        );
    })
.catch(console.log);
