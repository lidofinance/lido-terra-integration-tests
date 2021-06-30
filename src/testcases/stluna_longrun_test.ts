import * as fs from "fs";
import {mustPass} from "../helper/flow/must";
import {getRecord} from "../helper/flow/record";
import {
    registerChainOracleVote,
    registerChainOraclePrevote,
} from "../helper/oracle/chain-oracle";
import {MantleState} from "../mantle-querier/MantleState";
import {emptyBlockWithFixedGas} from "../helper/flow/gas-station";
import {repeat} from "../helper/flow/repeat";
import {unjail} from "../helper/validator-operation/unjail";
import {TestState} from "./common";

let mantleState: MantleState;

async function main() {
    let j;
    let i
    const testState = new TestState()
    mantleState = await testState.getMantleState()
    const stlunaContractAddress = testState.basset.contractInfo.anchor_basset_token_stluna.contractAddress

    //block 67
    await mustPass(emptyBlockWithFixedGas(testState.lcdClient, testState.gasStation))

    //block 68
    await mustPass(emptyBlockWithFixedGas(testState.lcdClient, testState.gasStation))

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
    //bond
    await mustPass(emptyBlockWithFixedGas(testState.lcdClient, testState.gasStation, 3))
    for (j = 0; j < 3; j++) {
        for (i = 0; i < 25; i++) {
            await mustPass(testState.basset.bond_for_stluna(testState.wallets.a, 2000000))
        }
    }

    for (j = 0; j < 3; j++) {
        for (i = 0; i < 25; i++) {
            await mustPass(testState.basset.bond_for_stluna(testState.wallets.b, 2000000))
        }
    }

    for (j = 0; j < 3; j++) {
        for (i = 0; i < 25; i++) {
            await mustPass(testState.basset.bond_for_stluna(testState.wallets.c, 2000000))
        }
    }

    //block 95
    await mustPass(emptyBlockWithFixedGas(testState.lcdClient, testState.gasStation, 50))

    //FIXME
    // await mustPass(testState.basset.update_global_index(a))

    for (j = 0; j < 3; j++) {
        for (i = 0; i < 25; i++) {
            await testState.basset.send_cw20_token(
                stlunaContractAddress,
                testState.wallets.a,
                1000000,
                {unbond: {}},
                testState.basset.contractInfo["anchor_basset_hub"].contractAddress
            )
        }
    }

    for (j = 0; j < 3; j++) {
        for (i = 0; i < 25; i++) {
            await testState.basset.send_cw20_token(
                stlunaContractAddress,
                testState.wallets.b,
                1000000,
                {unbond: {}},
                testState.basset.contractInfo["anchor_basset_hub"].contractAddress
            )
        }
    }

    for (j = 0; j < 3; j++) {
        for (i = 0; i < 25; i++) {
            await testState.basset.send_cw20_token(
                stlunaContractAddress,
                testState.wallets.c,
                1000000,
                {unbond: {}},
                testState.basset.contractInfo["anchor_basset_hub"].contractAddress
            )
        }
    }

    //block 99 - 159
    await mustPass(emptyBlockWithFixedGas(testState.lcdClient, testState.gasStation, 10))

    //block 160
    await mustPass(testState.basset.finish(testState.wallets.a))
    await mustPass(testState.basset.finish(testState.wallets.b))
    await mustPass(testState.basset.finish(testState.wallets.c))

    //block 170
    //FIXME
    // await mustPass(testState.basset.update_global_index(a))

    //FIXME
    // for (var i = 0; i < 5; i++) {
    //     await mustPass(testState.basset.remove_validator(ownerWallet, validators[i].validator_address))
    // }

    await mustPass(emptyBlockWithFixedGas(testState.lcdClient, testState.gasStation, 50))

    //FIXME
    // for (var i = 5; i < 10; i++) {
    //     await mustPass(testState.basset.remove_validator(ownerWallet, validators[i].validator_address))
    // }


    for (i = 15; i < 20; i++) {
        //FIXME
        // await mustPass(testState.basset.remove_validator(ownerWallet, validators[i].validator_address))
        await mustPass(emptyBlockWithFixedGas(testState.lcdClient, testState.gasStation, 50))
    }

    await mustPass(emptyBlockWithFixedGas(testState.lcdClient, testState.gasStation, 50))

    for (i = 20; i < 25; i++) {
        //FIXME
        // await mustPass(testState.basset.remove_validator(ownerWallet, validators[i].validator_address))
        await mustPass(emptyBlockWithFixedGas(testState.lcdClient, testState.gasStation, 50))
    }
}

main()
    .then(() => console.log("done"))
    .then(async () => {
        console.log("saving state...");
        fs.writeFileSync(
            "blunalongruntest_action.json",
            JSON.stringify(getRecord(), null, 2)
        );
        fs.writeFileSync(
            "blunalongruntest_state.json",
            JSON.stringify(await mantleState.getState(), null, 2)
        );
    })
    .catch(console.log);
