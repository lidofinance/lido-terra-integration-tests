import { Coin, Coins, Dec, Int, MnemonicKey, MsgExecuteContract, MsgSend, StdFee, Validator, Wallet } from "@terra-money/terra.js";
import * as path from 'path'
import * as fs from 'fs'
import { mustFail, mustPass } from "../helper/flow/must";
import { getRecord } from "../helper/flow/record";
import { registerChainOracleVote, registerChainOraclePrevote } from "../helper/oracle/chain-oracle";
import Anchor, { Asset } from "../helper/spawn";
import { MantleState } from "../mantle-querier/MantleState";
import { Testkit } from '../testkit/testkit'
import { execute, send_transaction } from "../helper/flow/execution";
import { emptyBlockWithFixedGas } from "../helper/flow/gas-station";
import { repeat } from '../helper/flow/repeat'
import { unjail } from '../helper/validator-operation/unjail'
import { gql } from "graphql-request";

let mantleState: MantleState

async function main() {
    const testkit = new Testkit("http://localhost:11317")
    const genesis = require('../testkit/genesis.json')

    const aKey = new MnemonicKey()
    const bKey = new MnemonicKey()
    const cKey = new MnemonicKey()
    const owner = new MnemonicKey()

    const validatorAKey = new MnemonicKey()
    const validatorBKey = new MnemonicKey()
    const validatorCKey = new MnemonicKey()
    const validatorDKey = new MnemonicKey()
    const gasStation = new MnemonicKey()

    const response = await testkit.init({
        genesis: genesis,
        accounts: [
            Testkit.walletToAccountRequest('a', aKey),
            Testkit.walletToAccountRequest('b', bKey),
            Testkit.walletToAccountRequest('c', cKey),
            Testkit.walletToAccountRequest('valA', validatorAKey),
            Testkit.walletToAccountRequest('valB', validatorBKey),
            Testkit.walletToAccountRequest('valC', validatorCKey),
            Testkit.walletToAccountRequest('valD', validatorDKey),
            Testkit.walletToAccountRequest('owner', owner),
            Testkit.walletToAccountRequest('gasStation', gasStation),
        ],
        validators: [
            Testkit.validatorInitRequest('valA', new Coin('uluna', new Int(100000000000000)), new Validator.CommissionRates(new Dec(0), new Dec(1), new Dec(0))),
            Testkit.validatorInitRequest('valB', new Coin('uluna', new Int(100000000000000)), new Validator.CommissionRates(new Dec(0), new Dec(1), new Dec(0))),
            Testkit.validatorInitRequest('valC', new Coin('uluna', new Int(100000000000000)), new Validator.CommissionRates(new Dec(0), new Dec(1), new Dec(0))),
            Testkit.validatorInitRequest('valD', new Coin('uluna', new Int(100000000000000)), new Validator.CommissionRates(new Dec(0), new Dec(1), new Dec(0))),
        ],
        auto_inject: {
            validator_rounds: ['valB', 'valC', 'valD', 'valA']
        },
        auto_tx: [
            // fee generator
            Testkit.automaticTxRequest({
                accountName: 'gasStation',
                period: 1,
                startAt: 2,
                msgs: [
                    new MsgSend(
                        gasStation.accAddress,
                        gasStation.accAddress,
                        new Coins([new Coin('uusd', 1)]),
                    )
                ],
                fee: new StdFee(10000000, "1000000uusd"),
            })
        ]
    })

    const validators = response.validators
    const lcd = testkit.deriveLCD()

    // initialize genesis block
    await testkit.inject()

    // register oracle votes
    const validatorNames = ['valA', 'valB', 'valC', 'valD']
    // register votes
    const initialVotes = await Promise.all(validators.map(async validator => testkit.registerAutomaticTx(registerChainOracleVote(
        validator.account_name,
        validator.Msg.delegator_address,
        validator.Msg.validator_address,
        3
    ))))

    // register prevotes
    const initialPrevotes = await Promise.all(validators.map(async validator => testkit.registerAutomaticTx(registerChainOraclePrevote(
        validator.account_name,
        validator.Msg.delegator_address,
        validator.Msg.validator_address,
        2
    ))))

    const a = new Wallet(lcd, aKey)
    const b = new Wallet(lcd, bKey)
    const c = new Wallet(lcd, cKey)

    const valAWallet = new Wallet(lcd, validatorAKey)

        ;;;;;
    // store & instantiate contracts
    ;;;;;
    const ownerWallet = new Wallet(lcd, owner)
    const anchor = new Anchor(ownerWallet);
    await anchor.store_contracts(
        path.resolve(__dirname, "../../anchor-bAsset-contracts/artifacts"),
        path.resolve(__dirname, "../../money-market-contracts/artifacts"),
        path.resolve(__dirname, "../../terraswap/artifacts"),
    );
    await anchor.instantiate();

    // register oracle price feeder
    await testkit.registerAutomaticTx(Testkit.automaticTxRequest({
        accountName: "owner",
        period: 1,
        msgs: [
            new MsgExecuteContract(
                owner.accAddress,
                anchor.moneyMarket.contractInfo["moneymarket_oracle"].contractAddress,
                {
                    feed_price: {
                        prices: [[
                            anchor.bAsset.contractInfo["anchor_basset_token"].contractAddress,
                            "1.000000"
                        ]]
                    }
                },
            )
        ],
        fee: new StdFee(10000000, "1000000uusd")
    }))


    ///////////////// scenario 시작 ////////////////////

    // await testkit.inject(validators[0].validator_address) -> 아무 Tx 없이 지나가는 경우의 테스팅

    await anchor.bAsset.register_validator(ownerWallet, validators[0].validator_address)

    const basset = anchor.bAsset;
    const moneyMarket = anchor.moneyMarket;
    const terraswap = anchor.terraswap;
    ////////////////////////

    // create mantle state
    console.log({
        "bLunaHub": basset.contractInfo["anchor_basset_hub"].contractAddress,
        "bAssetToken": basset.contractInfo["anchor_basset_token"].contractAddress,
        "bAssetReward": basset.contractInfo["anchor_basset_reward"].contractAddress,
        "mmInterest": moneyMarket.contractInfo["moneymarket_interest"].contractAddress,
        "mmOracle": moneyMarket.contractInfo["moneymarket_oracle"].contractAddress,
        "mmMarket": moneyMarket.contractInfo["moneymarket_market"].contractAddress,
        "mmOverseer": moneyMarket.contractInfo["moneymarket_overseer"].contractAddress,
        "mmCustody": moneyMarket.contractInfo["moneymarket_custody"].contractAddress,
        "mmLiquidation": moneyMarket.contractInfo["moneymarket_liquidation"].contractAddress,
        "anchorToken": moneyMarket.contractInfo["anchorToken"].contractAddress,
        "terraswapFactory": terraswap.contractInfo["terraswap_factory"].contractAddress,
        "terraswapPair": "whateva",
    })

    mantleState = new MantleState(
        {
            "bLunaHub": basset.contractInfo["anchor_basset_hub"].contractAddress,
            "bAssetToken": basset.contractInfo["anchor_basset_token"].contractAddress,
            "bAssetReward": basset.contractInfo["anchor_basset_reward"].contractAddress,
            "mmInterest": moneyMarket.contractInfo["moneymarket_interest"].contractAddress,
            "mmOracle": moneyMarket.contractInfo["moneymarket_oracle"].contractAddress,
            "mmMarket": moneyMarket.contractInfo["moneymarket_market"].contractAddress,
            "mmOverseer": moneyMarket.contractInfo["moneymarket_overseer"].contractAddress,
            "mmCustody": moneyMarket.contractInfo["moneymarket_custody"].contractAddress,
            "mmLiquidation": moneyMarket.contractInfo["moneymarket_liquidation"].contractAddress,
            "anchorToken": moneyMarket.contractInfo["anchorToken"].contractAddress,
            "terraswapFactory": terraswap.contractInfo["terraswap_factory"].contractAddress,
            "terraswapPair": "whateva",
        },
        [
            aKey.accAddress,
            bKey.accAddress,
            cKey.accAddress,
        ],
        response.validators.map(val => val.validator_address),
        "http://localhost:1337",
    )
    //block 29
    await mustPass(emptyBlockWithFixedGas(lcd, gasStation))

    //block 30
    await mustPass(emptyBlockWithFixedGas(lcd, gasStation))

    //block 31
    await mustPass(basset.bond(a, 20000000000000, validators[0].validator_address))

    //block 32 - 40
    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 9))

    //block 41~45
    // deregister oracle vote and waste 5 blocks
    const prevotesToClear = initialPrevotes[0]
    const votesToClear = initialVotes[0]

    await testkit.clearAutomaticTx(prevotesToClear.id)
    await testkit.clearAutomaticTx(votesToClear.id)
    await repeat(5, async () => {
        await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 1))
    })

    //block 46 - 50
    // Oracle slashing happen at the block 49
    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 5))

    //block 51 unjail & revive oracle
    // unjail & re-register oracle votes
    await mustPass(unjail(valAWallet))

    const currentBlockHeight = await mantleState.getCurrentBlockHeight()

    // // register vote for valA
    const previousVote2 = await testkit.registerAutomaticTx(registerChainOracleVote(
        validators[0].account_name,
        validators[0].Msg.delegator_address,
        validators[0].Msg.validator_address,
        currentBlockHeight + 2,
    ))

    // register votes
    const previousPrevote2 = await testkit.registerAutomaticTx(registerChainOraclePrevote(
        validators[0].account_name,
        validators[0].Msg.delegator_address,
        validators[0].Msg.validator_address,
        currentBlockHeight + 1
    ))

    //block 52 - 54
    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 3))

    //block 55
    await mustPass(basset.bond(a, 20000000000000, validators[0].validator_address))

    //block 56
    await mustPass(basset.transfer_cw20_token(a, b, 10000000))

    //block 57
    await basset.send_cw20_token(
        a,
        20000000000000,
        { unbond: {} },
        basset.contractInfo["anchor_basset_hub"].contractAddress
    )

    //block 58
    await mustPass(basset.send_cw20_token(
        a,
        1000000,
        { unbond: {} },
        basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    //block 59 - 66
    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 8))

    //block 67
    await mustPass(emptyBlockWithFixedGas(lcd, gasStation))
    //unbond 1

    //block 68 - 89
    //oracle slashing happen at the block 79
    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 22))

    // unjail & re-register oracle votes
    await mustPass(unjail(valAWallet))

    const currentBlockHeight2 = await mantleState.getCurrentBlockHeight()

    // // register vote for valA
    const previousVote = await testkit.registerAutomaticTx(registerChainOracleVote(
        validators[0].account_name,
        validators[0].Msg.delegator_address,
        validators[0].Msg.validator_address,
        currentBlockHeight2 + 2,
    ))

    // register votes
    const previousPrevote = await testkit.registerAutomaticTx(registerChainOraclePrevote(
        validators[0].account_name,
        validators[0].Msg.delegator_address,
        validators[0].Msg.validator_address,
        currentBlockHeight2 + 1
    ))

    //block 91 - 119
    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 29))

    //block 120
    await mustPass(basset.finish(a))

    //block 121
    await mustPass(moneyMarket.deposit_stable(b, 1000000000000))

    //block 122
    const marketAddr = moneyMarket.contractInfo["moneymarket_market"].contractAddress;
    await mustPass(moneyMarket.send_cw20_token(
        b,
        300000000000,
        { redeem_stable: {} },
        marketAddr
    ))

    //block 123
    const custody = moneyMarket.contractInfo["moneymarket_custody"].contractAddress;
    await mustPass(basset.send_cw20_token(
        a,
        3000000000000,
        { deposit_collateral: {} },
        custody
    ))

    //block 124
    await mustPass(moneyMarket.overseer_lock_collateral(a, [[basset.contractInfo["anchor_basset_token"].contractAddress, "2000000000000"]]))

    //block 125
    await mustFail(moneyMarket.overseer_lock_collateral(a, [[basset.contractInfo["anchor_basset_token"].contractAddress, "1500000000000"]]))

    //block 126
    await mustFail(moneyMarket.borrow_stable(a, 1500000000000, undefined))

    //block 127
    await mustPass(moneyMarket.borrow_stable(a, 300000000000, undefined))

    //block 128
    await mustPass(basset.update_global_index(a))

    //block 129
    await mustPass(moneyMarket.execute_epoch_operations(a))

    // block 130
    await mustFail(moneyMarket.send_cw20_token(
        b,
        50000000000000,
        { redeem_stable: {} },
        moneyMarket.contractInfo["moneymarket_market"].contractAddress
    ))

    //block 131
    await mustPass(moneyMarket.deposit_stable(b, 1000000))

    //block 132
    await mustPass(moneyMarket.overseer_unlock_collateral(a, [[basset.contractInfo["anchor_basset_token"].contractAddress, "100000000000"]]))

    //block 133
    await mustFail(moneyMarket.overseer_unlock_collateral(a, [[basset.contractInfo["anchor_basset_token"].contractAddress, "10000000000000"]]))

    //block 134
    await mustPass(moneyMarket.withdraw_collateral(a, 150000000000))

    //block 135
    await mustFail(moneyMarket.withdraw_collateral(a, 990000000000))

    //block 136-149
    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 14))

    console.log("saving state...")
    fs.writeFileSync("4_block149_state.json", JSON.stringify(await mantleState.getState(), null, 2))

    //block 150
    await mustPass(basset.update_global_index(a))

    //block 151
    await mustPass(moneyMarket.execute_epoch_operations(a))

    //block 152
    await mustPass(moneyMarket.borrow_stable(a, 300000000000, undefined))

    //block 153 - 165
    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 13))

    //block 166
    await mustPass(basset.update_global_index(a))

    //block 167
    await mustPass(moneyMarket.execute_epoch_operations(a))

    //block 168
    await mustFail(moneyMarket.overseer_unlock_collateral(a, [[basset.contractInfo["anchor_basset_token"].contractAddress, "30000000000"]]))

    // //block 169
    // // User C trigger liquidation(mustFail)

    // //block 170
    // // change MM oracle price to 0.75

    // //block 171
    // // User C trigger liquidation(mustPass)
    // // fs.writeFileSync("8actions.json", JSON.stringify(getRecord(), null, 2))
    // // fs.writeFileSync("8mantleState.json", JSON.stringify(await mantleState.getState(), null, 2))
}

main()
    .then(() => console.log('done'))
    .then(async () => {
        console.log("saving state...")
        fs.writeFileSync("4_actions.json", JSON.stringify(getRecord(), null, 2))
        fs.writeFileSync("4_state.json", JSON.stringify(await mantleState.getState(), null, 2))
    })
    .catch(console.log)