import * as fs from "fs";
import { mustPass } from "../helper/flow/must";
import { getRecord } from "../helper/flow/record";
import { MantleState } from "../mantle-querier/MantleState";
import {TestState} from "./common";
import {makeBalanceQuery, makeContractStoreQuery, makeQuery} from "../mantle-querier/common";
import {gql, GraphQLClient} from "graphql-request";
import {emptyBlockWithFixedGas} from "../helper/flow/gas-station";

let mantleState: MantleState;

function approxeq(a, b, e) {
    return Math.abs(a - b) <= e;
}

async function getStLunaBalance(testState, mantleClient, address) {
    return await makeContractStoreQuery(
        testState.basset.contractInfo["anchor_basset_token_stluna"].contractAddress,
        {balance: {address: address}},
        mantleClient
    ).then((r) => r.balance)
}

async function getLunaBalance(testState, mantleClient, address) {
    let balance = await makeBalanceQuery(address, mantleClient);
    console.log(JSON.stringify(balance));
    for (let i = 0; i < balance.Response.Result.length; i++) {
        if (balance.Response.Result[i].Denom == "uluna") {
            return balance.Response.Result[i].Amount
        }
    }
    return null
}

async function main() {
    const oraclePrice = "1200.000000000000000000ukrw,15.000000000000000000uusd,0.750000000000000000usdr,2400.000000000000000000umnt";
    const testState = new TestState(oraclePrice);
    mantleState = await testState.getMantleState();
    const mantleClient = new GraphQLClient(testState.testkit.deriveMantle());

    let stLunaBondAmount = 20_000_000_000_000;
    let bLunaBondAmount = 10_000_000_000_000;

    await mustPass(testState.basset.bond_for_stluna(testState.wallets.a, stLunaBondAmount))
    await mustPass(testState.basset.bond(testState.wallets.b, bLunaBondAmount))

    let result = await testState.basset.update_global_index_with_result(testState.wallets.ownerWallet);

    const stLunaRewardsRegex = /stluna_rewards_amount","value":"([\d]+)"/gm;
    const bLunaRewardsRegex = /bluna_rewards_amount","value":"([\d]+)"/gm;

    let stLunaRewards = parseInt(stLunaRewardsRegex.exec(result.raw_log)[1]); // in uluna
    let bLunaRewards = parseInt(bLunaRewardsRegex.exec(result.raw_log)[1]); // in uusd

    const oraclePrices = await makeQuery(
        gql`
      query {
        OracleDenomsExchangeRates {
          Result {
            Denom
            Amount
          }
        }
      }
    `,
        {},
        mantleClient
    ).then((r) => r.OracleDenomsExchangeRates.Result);
    let uusdExhangeRate = parseFloat(oraclePrices.find(currency => currency.Denom == "uusd").Amount);

    // check that bLuna/stLuna rewards (in uusd) ratio is the same as bLuna/stLuna bond ratio with some accuracy due to fees
    // stLuna rewards is rebonded to validators and bLunaRewards is available as rewards for bLuna holders
    if (!approxeq(bLunaRewards / (stLunaRewards * uusdExhangeRate), bLunaBondAmount / stLunaBondAmount, 0.05)) {
        console.log(bLunaRewards / (stLunaRewards * uusdExhangeRate));
        console.log(bLunaBondAmount / stLunaBondAmount);
        throw new Error(`invalid rewards distribution: stLunaRewards=${stLunaRewards}, 
                                                        bLunaRewards=${bLunaRewards}, 
                                                        stLunaBonded=${stLunaBondAmount}, 
                                                        bLunaBonded=${bLunaBondAmount}`);
    }

    const accruedRewards = await makeContractStoreQuery(
        testState.basset.contractInfo["anchor_basset_reward"].contractAddress,
        { accrued_rewards: { address: testState.wallets.b.key.accAddress } },
        mantleClient
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

    const stLunaBalance = await getStLunaBalance(testState, mantleClient, testState.wallets.a.key.accAddress);
    if (stLunaBalance > 0) {
        throw new Error("stLuna balance must be zero")
    }

    await mustPass(emptyBlockWithFixedGas(testState.lcdClient, testState.gasStation, 50));

    let currentBlockTime = new Date(await mantleState.getCurrentBlockTime());
    let withdrawableUnbondedStLuna = await makeContractStoreQuery(
        testState.basset.contractInfo["anchor_basset_hub"].contractAddress,
        { withdrawable_unbonded: { address: testState.wallets.a.key.accAddress, block_time: currentBlockTime.getTime()} },
        mantleClient
    ).then((r) => r.withdrawable);
    if (withdrawableUnbondedStLuna <= stLunaBondAmount) {
        throw new Error("withdrawableUnbonded must be more than bond amount")
    }


    //withdraw bLuna
    await mustPass(emptyBlockWithFixedGas(testState.lcdClient, testState.gasStation, 50));
    await mustPass(testState.basset.send_cw20_token(
        testState.basset.contractInfo["anchor_basset_token"].contractAddress,
        testState.wallets.b,
        bLunaBondAmount,
        {unbond: {}},
        testState.basset.contractInfo["anchor_basset_hub"].contractAddress
    ));

    currentBlockTime = new Date(await mantleState.getCurrentBlockTime());
    let withdrawableUnbondedBLuna = await makeContractStoreQuery(
        testState.basset.contractInfo["anchor_basset_hub"].contractAddress,
        { withdrawable_unbonded: { address: testState.wallets.b.key.accAddress, block_time: currentBlockTime.getTime()} },
        mantleClient
    ).then((r) => r.withdrawable);
    if (withdrawableUnbondedBLuna != bLunaBondAmount) {
        throw new Error("withdrawableUnbonded is not equal to bonded amount")
    }

    await mustPass(emptyBlockWithFixedGas(testState.lcdClient, testState.gasStation, 50));

    let lunaBalanceBeforeWithdrawB = await getLunaBalance(testState, mantleClient, testState.wallets.b.key.accAddress);
    await mustPass(testState.basset.finish(testState.wallets.b));
    let lunaBalanceAfterWithdrawB = await getLunaBalance(testState, mantleClient, testState.wallets.b.key.accAddress);
    // we lose 1-2 uluna because of Decimal logic
    if (!approxeq(Number(BigInt(lunaBalanceAfterWithdrawB) - BigInt(lunaBalanceBeforeWithdrawB)), withdrawableUnbondedBLuna, 2)) {
        throw new Error(`withdraw amount is not equal to withdrawableUnboned: 
                                    ${BigInt(lunaBalanceAfterWithdrawB) - BigInt(lunaBalanceBeforeWithdrawB)} != ${withdrawableUnbondedBLuna}`)
    }

    let lunaBalanceBeforeWithdraw = await getLunaBalance(testState, mantleClient, testState.wallets.a.key.accAddress);
    await mustPass(testState.basset.finish(testState.wallets.a));
    let lunaBalanceAfterWithdraw = await getLunaBalance(testState, mantleClient, testState.wallets.a.key.accAddress);
    // we lose 1-2 uluna because of Decimal logic
    if (!approxeq(Number(BigInt(lunaBalanceAfterWithdraw) - BigInt(lunaBalanceBeforeWithdraw)), withdrawableUnbondedStLuna, 2)) {
        throw new Error(`withdraw amount is not equal to withdrawableUnbonded: 
                                    ${BigInt(lunaBalanceAfterWithdraw) - BigInt(lunaBalanceBeforeWithdraw)} != ${withdrawableUnbondedStLuna}`)
    }
}

main()
    .then(() => console.log("done"))
    .then(async () => {
        console.log("saving state...");
        fs.writeFileSync(
            "rewards_distribution_single_denom.json",
            JSON.stringify(getRecord(), null, 2)
        );
        fs.writeFileSync(
            "rewards_distribution_single_denom.json",
            JSON.stringify(await mantleState.getState(), null, 2)
        );
    })
.catch(console.log);
