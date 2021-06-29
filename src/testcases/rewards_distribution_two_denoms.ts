import * as fs from "fs";
import { mustPass } from "../helper/flow/must";
import { getRecord } from "../helper/flow/record";
import { MantleState } from "../mantle-querier/MantleState";
import {TestState} from "./common";
import {makeContractStoreQuery, makeQuery} from "../mantle-querier/common";
import {gql, GraphQLClient} from "graphql-request";
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

    let stLunaBondAmount = 10000000000000;
    let bLunaBondAmount = 20000000000000;

    await mustPass(testState.basset.bond_for_stluna(testState.wallets.a, stLunaBondAmount))
    await mustPass(testState.basset.bond(testState.wallets.b, bLunaBondAmount))

    await mustPass(send_transaction(testState.wallets.ownerWallet, [
        new MsgSend(testState.wallets.ownerWallet.key.accAddress, testState.basset.contractInfo["anchor_basset_rewards_dispatcher"].contractAddress, "1000000uluna"),
    ]));

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

    // check that bLuna/stLuna rewards (in uusd) ratio is the same as bLuna/stLuna bond ration with some accuracy due to fees
    // stLuna rewards is rebonded to validators and bLunaRewards is available as rewards for bLuna holders
    if (!approxeq(bLunaRewards / (stLunaRewards * uusdExhangeRate), bLunaBondAmount / stLunaBondAmount, 0.05)) {
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
            "rewards_distribution_2_denoms.json",
            JSON.stringify(getRecord(), null, 2)
        );
        fs.writeFileSync(
            "rewards_distribution_2_denoms.json",
            JSON.stringify(await mantleState.getState(), null, 2)
        );
    })
// .catch(console.log);
