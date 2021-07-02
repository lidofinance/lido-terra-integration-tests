import * as fs from "fs";
import { mustPass } from "../helper/flow/must";
import { getRecord } from "../helper/flow/record";
import {
    registerChainOracleVote,
    registerChainOraclePrevote,
} from "../helper/oracle/chain-oracle";
import { MantleState } from "../mantle-querier/MantleState";
import { emptyBlockWithFixedGas } from "../helper/flow/gas-station";
import { repeat } from "../helper/flow/repeat";
import { unjail } from "../helper/validator-operation/unjail";
import {TestState} from "./common";

let mantleState: MantleState;

async function main() {
    const testState = new TestState()
    mantleState = await testState.getMantleState()
    //block 67
    await mustPass(emptyBlockWithFixedGas(testState.lcdClient, testState.gasStation))

    //block 68
    await mustPass(emptyBlockWithFixedGas(testState.lcdClient, testState.gasStation))

    //block 69
    await mustPass(testState.basset.bond(testState.wallets.a, 20000000000000))

    //block 70
    await mustPass(testState.basset.bond(testState.wallets.a, 333333333333))

    //block 71
    await mustPass(testState.basset.bond(testState.wallets.a, 333333333333))

    //block 72
    await mustPass(testState.basset.bond(testState.wallets.a, 333333333333))

    //block 73
    await mustPass(testState.basset.remove_validator(testState.wallets.ownerWallet, testState.validators[1].validator_address))

    //block 74 - 80
    await mustPass(emptyBlockWithFixedGas(testState.lcdClient, testState.gasStation, 7))

    //block 81 - 85
    // deregister oracle vote and waste 5 blocks
    const prevotesToClear = testState.initialPrevotes[0]
    const votesToClear = testState.initialVotes[0]

    await testState.testkit.clearAutomaticTx(prevotesToClear.id)
    await testState.testkit.clearAutomaticTx(votesToClear.id)
    await repeat(5, async () => {
        await mustPass(emptyBlockWithFixedGas(testState.lcdClient, testState.gasStation, 1))
    })

    //block 86 - 90
    // Oracle slashing happen at the block 89
    await mustPass(emptyBlockWithFixedGas(testState.lcdClient, testState.gasStation, 5))

    //block 91 unjail & revive oracle
    // unjail & re-register oracle votes
    await mustPass(unjail(testState.wallets.valAWallet))

    const currentBlockHeight = await mantleState.getCurrentBlockHeight()

    // // register vote for valA
    const previousVote = await testState.testkit.registerAutomaticTx(registerChainOracleVote(
        testState.validators[0].account_name,
        testState.validators[0].Msg.delegator_address,
        testState.validators[0].Msg.validator_address,
        currentBlockHeight + 2,
    ))

    // register votes
    const previousPrevote = await testState.testkit.registerAutomaticTx(registerChainOraclePrevote(
        testState.validators[0].account_name,
        testState.validators[0].Msg.delegator_address,
        testState.validators[0].Msg.validator_address,
        currentBlockHeight + 1
    ))

    //block 92 - 94
    await mustPass(emptyBlockWithFixedGas(testState.lcdClient, testState.gasStation, 3))

    //block 95
    await mustPass(testState.basset.bond(testState.wallets.a, 20000000000000))
    await mustPass(testState.basset.bond(testState.wallets.b, 20000000000000))
    await mustPass(testState.basset.bond(testState.wallets.c, 20000000000000))

    //block 97
    await testState.basset.send_cw20_token(
        testState.basset.contractInfo["anchor_basset_token"].contractAddress,
        testState.wallets.a,
        333333333333,
        { unbond: {} },
        testState.basset.contractInfo["anchor_basset_hub"].contractAddress
    )

    //block 98
    await mustPass(testState.basset.send_cw20_token(
        testState.basset.contractInfo["anchor_basset_token"].contractAddress,
        testState.wallets.a,
        333333333333,
        { unbond: {} },
        testState.basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    //block 99 - 159
    await mustPass(emptyBlockWithFixedGas(testState.lcdClient, testState.gasStation, 51))

    //block 159
    await mustPass(testState.basset.send_cw20_token(
        testState.basset.contractInfo["anchor_basset_token"].contractAddress,
        testState.wallets.a,
        333333333333,
        { unbond: {} },
        testState.basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    //block 160
    await mustPass(testState.basset.finish(testState.wallets.a))

    //block 161
    await mustPass(testState.moneyMarket.deposit_stable(testState.wallets.b, 10000000000000))

    //block 163
    const custody = testState.moneyMarket.contractInfo["moneymarket_custody_bluna"].contractAddress;
    await mustPass(testState.basset.send_cw20_token(
        testState.basset.contractInfo["anchor_basset_token"].contractAddress,
        testState.wallets.a,
        3000000000000,
        { deposit_collateral: {} },
        custody
    ))

    await mustPass(testState.basset.send_cw20_token(
        testState.basset.contractInfo["anchor_basset_token"].contractAddress,
        testState.wallets.b,
        3000000000000,
        { deposit_collateral: {} },
        custody
    ))

    await mustPass(testState.basset.send_cw20_token(
        testState.basset.contractInfo["anchor_basset_token"].contractAddress,
        testState.wallets.c,
        3000000000000,
        { deposit_collateral: {} },
        custody
    ))


    //block 166
    await mustPass(testState.moneyMarket.overseer_lock_collateral(
        testState.wallets.a, [[testState.basset.contractInfo["anchor_basset_token"].contractAddress, "2000000000000"]])
    )
    await mustPass(testState.moneyMarket.overseer_lock_collateral(
        testState.wallets.b, [[testState.basset.contractInfo["anchor_basset_token"].contractAddress, "2000000000000"]])
    )
    await mustPass(testState.moneyMarket.overseer_lock_collateral(
        testState.wallets.c, [[testState.basset.contractInfo["anchor_basset_token"].contractAddress, "2000000000000"]])
    )

    return
    //block 169
    await mustPass(testState.moneyMarket.borrow_stable(testState.wallets.a, 100000000000, undefined))

    //block 170
    await mustPass(testState.basset.update_global_index(testState.wallets.a))

    await mustPass(testState.moneyMarket.execute_epoch_operations(testState.wallets.a))

    // faster
    await testState.testkit.clearAllAutomaticTxs()

    //block 171
    await mustPass(emptyBlockWithFixedGas(testState.lcdClient, testState.gasStation, 200))

    await mustPass(testState.moneyMarket.market_claim_rewards(testState.wallets.a))
}

main()
    .then(() => console.log("done"))
    .then(async () => {
        console.log("saving state...");
        fs.writeFileSync(
            "autotxexit_action.json",
            JSON.stringify(getRecord(), null, 2)
        );
        fs.writeFileSync(
            "autotxexit_state.json",
            JSON.stringify(await mantleState.getState(), null, 2)
        );
    })
    .catch(console.log);
