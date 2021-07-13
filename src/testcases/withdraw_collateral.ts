import * as fs from 'fs'
import { mustFail, mustPass } from "../helper/flow/must";
import { getRecord } from "../helper/flow/record";
import { registerChainOracleVote, registerChainOraclePrevote } from "../helper/oracle/chain-oracle";
import { MantleState } from "../mantle-querier/MantleState";
import { emptyBlockWithFixedGas } from "../helper/flow/gas-station";
import { unjail } from '../helper/validator-operation/unjail'
import {TestState} from "./common";

let mantleState: MantleState

async function main() {
    const testState = new TestState()
    mantleState = await testState.getMantleState()
    const blunaContractAddress = testState.basset.contractInfo.anchor_basset_token.contractAddress

    //block 29
    await mustPass(emptyBlockWithFixedGas(testState.lcdClient, testState.gasStation))

    //block 30
    await mustPass(emptyBlockWithFixedGas(testState.lcdClient, testState.gasStation))

    //block 31
    await mustPass(testState.basset.bond(testState.wallets.a, 20000000000000))

    //block 32 - 40
    await mustPass(emptyBlockWithFixedGas(testState.lcdClient, testState.gasStation, 9))

    //block 41~45
    await mustPass(emptyBlockWithFixedGas(testState.lcdClient, testState.gasStation, 5))

    //block 46 - 50
    // Oracle slashing happen at the block 49
    await mustPass(emptyBlockWithFixedGas(testState.lcdClient, testState.gasStation, 5))

    //block 51 unjail & revive oracle
    await mustPass(emptyBlockWithFixedGas(testState.lcdClient, testState.gasStation))
    //await mustPass(unjail(valAWallet))

    //block 52 - 54
    await mustPass(emptyBlockWithFixedGas(testState.lcdClient, testState.gasStation, 3))

    //block 55
    await mustPass(testState.basset.bond(testState.wallets.a, 20000000000000))

    //block 56
    await mustPass(testState.basset.transfer_cw20_token(blunaContractAddress, testState.wallets.a, testState.wallets.b, 10000000))

    //block 57
    await testState.basset.send_cw20_token(
        blunaContractAddress,
        testState.wallets.a,
        20000000000000,
        { unbond: {} },
        testState.basset.contractInfo["anchor_basset_hub"].contractAddress
    )

    //block 58
    await mustPass(testState.basset.send_cw20_token(
        blunaContractAddress,
        testState.wallets.a,
        1000000,
        { unbond: {} },
        testState.basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    //block 59 - 66
    await mustPass(emptyBlockWithFixedGas(testState.lcdClient, testState.gasStation, 8))

    //block 67
    await mustPass(emptyBlockWithFixedGas(testState.lcdClient, testState.gasStation))
    //unbond 1

    //block 68 - 89
    //oracle slashing happen at the block 79
    await mustPass(emptyBlockWithFixedGas(testState.lcdClient, testState.gasStation, 22))

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

    //block 91 - 119
    await mustPass(emptyBlockWithFixedGas(testState.lcdClient, testState.gasStation, 29))

    //block 120
    await mustPass(testState.basset.finish(testState.wallets.a))

    //block 121
    await mustPass(testState.moneyMarket.deposit_stable(testState.wallets.b, 1000000000000))

    console.log(testState.moneyMarket.contractInfo)

    //block 122
    const marketAddr = testState.moneyMarket.contractInfo["moneymarket_market"].contractAddress;
    await mustPass(testState.moneyMarket.send_cw20_token(
        testState.wallets.b,
        300000000000,
        { redeem_stable: {} },
        marketAddr
    ))

    //block 123
    const custody = testState.moneyMarket.contractInfo["moneymarket_custody_bluna"].contractAddress;
    await mustPass(testState.basset.send_cw20_token(
        blunaContractAddress,
        testState.wallets.a,
        3000000000000,
        { deposit_collateral: {} },
        custody
    ))

    //block 124
    await mustPass(testState.moneyMarket.overseer_lock_collateral(
        testState.wallets.a,
        [[testState.basset.contractInfo["anchor_basset_token"].contractAddress, "2000000000000"]]
    ))

    //block 125
    await mustFail(testState.moneyMarket.overseer_lock_collateral(
        testState.wallets.a,
        [[testState.basset.contractInfo["anchor_basset_token"].contractAddress, "1500000000000"]]
    ))

    //block 126
    await mustFail(testState.moneyMarket.borrow_stable(testState.wallets.a, 1500000000000, undefined))

    //block 127
    await mustPass(testState.moneyMarket.borrow_stable(testState.wallets.a, 300000000000, undefined))

    //block 128
    await mustPass(testState.basset.update_global_index(testState.wallets.a))

    //block 129
    await mustPass(testState.moneyMarket.execute_epoch_operations(testState.wallets.a))

    // block 130
    await mustFail(testState.moneyMarket.send_cw20_token(
        testState.wallets.b,
        50000000000000,
        { redeem_stable: {} },
        testState.moneyMarket.contractInfo["moneymarket_market"].contractAddress
    ))

    //block 131
    await mustPass(testState.moneyMarket.deposit_stable(testState.wallets.b, 1000000))

    //block 132
    await mustPass(testState.moneyMarket.overseer_unlock_collateral(
        testState.wallets.a,
        [[testState.basset.contractInfo["anchor_basset_token"].contractAddress, "100000000000"]]
    ))

    //block 133
    await mustFail(testState.moneyMarket.overseer_unlock_collateral(
        testState.wallets.a,
        [[testState.basset.contractInfo["anchor_basset_token"].contractAddress, "10000000000000"]]
    ))

    fs.writeFileSync("beforewithdraw_state.json", JSON.stringify(await mantleState.getState(), null, 2))

    //block 134
    await mustPass(testState.moneyMarket.withdraw_collateral(testState.wallets.a, 150000000000))

    fs.writeFileSync("withdraw_state.json", JSON.stringify(await mantleState.getState(), null, 2))
}

main()
    .then(() => console.log('done'))
    .then(async () => {
        console.log("saving state...")
        fs.writeFileSync("12_actions.json", JSON.stringify(getRecord(), null, 2))
        fs.writeFileSync("12_state.json", JSON.stringify(await mantleState.getState(), null, 2))
    })
    .catch(console.log)