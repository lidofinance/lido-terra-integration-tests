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
import { configureMMOracle } from "../helper/oracle/mm-oracle";

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
            Testkit.validatorInitRequest('valA', new Coin('uluna', new Int(1000000000000)), new Validator.CommissionRates(new Dec(0), new Dec(1), new Dec(0))),
            Testkit.validatorInitRequest('valB', new Coin('uluna', new Int(1000000000000)), new Validator.CommissionRates(new Dec(0), new Dec(1), new Dec(0))),
            Testkit.validatorInitRequest('valC', new Coin('uluna', new Int(1000000000000)), new Validator.CommissionRates(new Dec(0), new Dec(1), new Dec(0))),
            Testkit.validatorInitRequest('valD', new Coin('uluna', new Int(1000000000000)), new Validator.CommissionRates(new Dec(0), new Dec(1), new Dec(0))),
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
    const previousOracleFeed = await testkit.registerAutomaticTx(configureMMOracle(
        owner,
        anchor.moneyMarket.contractInfo["moneymarket_oracle"].contractAddress,
        anchor.bAsset.contractInfo["anchor_basset_token"].contractAddress,
        1.0000000000
    ))

    ///////////////// scenario starts ////////////////////
    // register four validators
    await anchor.bAsset.register_validator(ownerWallet, validators[0].validator_address)
    await anchor.bAsset.register_validator(ownerWallet, validators[1].validator_address)
    await anchor.bAsset.register_validator(ownerWallet, validators[2].validator_address)
    await anchor.bAsset.register_validator(ownerWallet, validators[3].validator_address)

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
    await mustPass(basset.bond(a, 30000000000000, validators[1].validator_address))


    //block 32 
    await mustPass(basset.bond(b, 10000000000000, validators[2].validator_address))

    //block 33 
    await mustPass(basset.send_cw20_token(a, 15000000000000, { unbond: {} }, basset.contractInfo["anchor_basset_hub"].contractAddress))
    await mustPass(basset.bond(c, 10000000000, validators[0].validator_address))
    //block 34
    await mustPass(basset.update_global_index(a))

    //block 35 - 40
    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 6))

    //block 41~45
    // deregister oracle vote and waste 5 blocks
    const prevotesToClear = initialPrevotes[0]
    const votesToClear = initialVotes[0]

    await testkit.clearAutomaticTx(prevotesToClear.id)
    await testkit.clearAutomaticTx(votesToClear.id)
    await repeat(10, async () => {
        await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 1))
    })

    //block 46 - 50
    // Oracle slashing happen at the block 49
    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 5))

    //block 51
    await mustPass(basset.update_global_index(a))

    await mustPass(basset.bond(a, 10, validators[0].validator_address))

    //block 52 unjail & revive oracle
    // unjail & re-register oracle votes
    await mustPass(unjail(valAWallet))

    const currentBlockHeight = await mantleState.getCurrentBlockHeight()

    // // register vote for valA
    const previousVote = await testkit.registerAutomaticTx(registerChainOracleVote(
        validators[0].account_name,
        validators[0].Msg.delegator_address,
        validators[0].Msg.validator_address,
        currentBlockHeight + 2,
    ))

    // register votes
    const previousPrevote = await testkit.registerAutomaticTx(registerChainOraclePrevote(
        validators[0].account_name,
        validators[0].Msg.delegator_address,
        validators[0].Msg.validator_address,
        currentBlockHeight + 1
    ))

    //block 53 - 54
    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 2))

    await mustPass(basset.bond(a, 10, validators[0].validator_address))

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

    //block 68 - 89
    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 22))

    // block 90
    await mustPass(emptyBlockWithFixedGas(lcd, gasStation))

    //block 91 - 119
    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 29))

    //block 120
    await mustPass(basset.finish(a))

    //block 121
    await mustPass(basset.bond(a, 10000000, validators[2].validator_address))

    //block 122
    await mustPass(basset.bond(a, 10000000, validators[3].validator_address))

    //block 123
    await mustPass(basset.send_cw20_token(
        a,
        15000000,
        { unbond: {} },
        basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    //block 124
    await mustPass(basset.send_cw20_token(
        a,
        15000000,
        { unbond: {} },
        basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    //block 125 - 160
    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 36))

    //block 160  "exchange_rate": "0.980440647482032022",
    await mustPass(basset.finish(a))

    //block 121
    await mustPass(basset.bond(a, 10000000, validators[2].validator_address))

    //block 122
    await mustPass(basset.bond(a, 10000000, validators[3].validator_address))

    //block 123
    await mustPass(basset.send_cw20_token(
        a,
        10000000,
        { unbond: {} },
        basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    //block 124
    await mustPass(basset.send_cw20_token(
        a,
        10000000,
        { unbond: {} },
        basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    await mustPass(basset.send_cw20_token(
        a,
        10,
        { unbond: {} },
        basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    //block 125 - 160
    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 36))

    await mustPass(basset.send_cw20_token(
        a,
        10,
        { unbond: {} },
        basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 36))

    //block 160
    await mustPass(basset.finish(a))

    await mustPass(basset.update_global_index(a))

    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 14))

    await mustPass(basset.update_global_index(a))

    await mustPass(basset.bond(c, 10, validators[2].validator_address))


    await mustPass(basset.bond(a, 10, validators[0].validator_address))

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

    //block 68 - 89
    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 22))

    // block 90
    await mustPass(emptyBlockWithFixedGas(lcd, gasStation))

    //block 91 - 119
    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 29))

    //block 120
    await mustPass(basset.finish(a))

    //block 121
    await mustPass(basset.bond(a, 10000000, validators[2].validator_address))

    //block 122
    await mustPass(basset.bond(a, 10000000, validators[3].validator_address))

    //block 123
    await mustPass(basset.send_cw20_token(
        a,
        15000000,
        { unbond: {} },
        basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    //block 124
    await mustPass(basset.send_cw20_token(
        a,
        15000000,
        { unbond: {} },
        basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    //block 125 - 160
    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 36))

    //block 160  "exchange_rate": "0.980440647482032022",
    await mustPass(basset.finish(a))

    //block 121
    await mustPass(basset.bond(a, 10000000, validators[2].validator_address))

    //block 122
    await mustPass(basset.bond(a, 10000000, validators[3].validator_address))

    //block 123
    await mustPass(basset.send_cw20_token(
        a,
        10000000,
        { unbond: {} },
        basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    //block 124
    await mustPass(basset.send_cw20_token(
        a,
        10000000,
        { unbond: {} },
        basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    await mustPass(basset.send_cw20_token(
        a,
        10,
        { unbond: {} },
        basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    //block 125 - 160
    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 36))

    await mustPass(basset.send_cw20_token(
        a,
        10,
        { unbond: {} },
        basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 36))

    //block 160
    await mustPass(basset.finish(a))

    await mustPass(basset.update_global_index(a))

    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 14))

    await mustPass(basset.update_global_index(a))

    await mustPass(basset.bond(c, 10, validators[2].validator_address))

    await mustPass(basset.bond(a, 10, validators[0].validator_address))

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

    //block 68 - 89
    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 22))

    // block 90
    await mustPass(emptyBlockWithFixedGas(lcd, gasStation))

    //block 91 - 119
    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 29))

    //block 120
    await mustPass(basset.finish(a))

    //block 121
    await mustPass(basset.bond(a, 10000000, validators[2].validator_address))

    //block 122
    await mustPass(basset.bond(a, 10000000, validators[3].validator_address))

    //block 123
    await mustPass(basset.send_cw20_token(
        a,
        15000000,
        { unbond: {} },
        basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    //block 124
    await mustPass(basset.send_cw20_token(
        a,
        15000000,
        { unbond: {} },
        basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    //block 125 - 160
    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 36))

    //block 160  "exchange_rate": "0.980440647482032022",
    await mustPass(basset.finish(a))

    //block 121
    await mustPass(basset.bond(a, 10000000, validators[2].validator_address))

    //block 122
    await mustPass(basset.bond(a, 10000000, validators[3].validator_address))

    //block 123
    await mustPass(basset.send_cw20_token(
        a,
        10000000,
        { unbond: {} },
        basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    //block 124
    await mustPass(basset.send_cw20_token(
        a,
        10000000,
        { unbond: {} },
        basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    await mustPass(basset.send_cw20_token(
        a,
        10,
        { unbond: {} },
        basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    //block 125 - 160
    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 36))

    await mustPass(basset.send_cw20_token(
        a,
        10,
        { unbond: {} },
        basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 36))

    //block 160
    await mustPass(basset.finish(a))

    await mustPass(basset.update_global_index(a))

    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 14))

    await mustPass(basset.update_global_index(a))

    await mustPass(basset.bond(c, 10, validators[2].validator_address))

    await mustPass(basset.bond(a, 10, validators[0].validator_address))

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

    //block 68 - 89
    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 22))

    // block 90
    await mustPass(emptyBlockWithFixedGas(lcd, gasStation))

    //block 91 - 119
    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 29))

    //block 120
    await mustPass(basset.finish(a))

    //block 121
    await mustPass(basset.bond(a, 10000000, validators[2].validator_address))

    //block 122
    await mustPass(basset.bond(a, 10000000, validators[3].validator_address))

    //block 123
    await mustPass(basset.send_cw20_token(
        a,
        15000000,
        { unbond: {} },
        basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    //block 124
    await mustPass(basset.send_cw20_token(
        a,
        15000000,
        { unbond: {} },
        basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    //block 125 - 160
    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 36))

    //block 160  "exchange_rate": "0.980440647482032022",
    await mustPass(basset.finish(a))

    //block 121
    await mustPass(basset.bond(a, 10000000, validators[2].validator_address))

    //block 122
    await mustPass(basset.bond(a, 10000000, validators[3].validator_address))

    //block 123
    await mustPass(basset.send_cw20_token(
        a,
        10000000,
        { unbond: {} },
        basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    //block 124
    await mustPass(basset.send_cw20_token(
        a,
        10000000,
        { unbond: {} },
        basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    await mustPass(basset.send_cw20_token(
        a,
        10,
        { unbond: {} },
        basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    //block 125 - 160
    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 36))

    await mustPass(basset.send_cw20_token(
        a,
        10,
        { unbond: {} },
        basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 36))

    //block 160
    await mustPass(basset.finish(a))

    await mustPass(basset.update_global_index(a))

    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 14))

    await mustPass(basset.update_global_index(a))

    await mustPass(basset.bond(c, 10, validators[2].validator_address))

    await mustPass(basset.bond(a, 10, validators[0].validator_address))

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

    //block 68 - 89
    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 22))

    // block 90
    await mustPass(emptyBlockWithFixedGas(lcd, gasStation))

    //block 91 - 119
    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 29))

    //block 120
    await mustPass(basset.finish(a))

    //block 121
    await mustPass(basset.bond(a, 10000000, validators[2].validator_address))

    //block 122
    await mustPass(basset.bond(a, 10000000, validators[3].validator_address))

    //block 123
    await mustPass(basset.send_cw20_token(
        a,
        15000000,
        { unbond: {} },
        basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    //block 124
    await mustPass(basset.send_cw20_token(
        a,
        15000000,
        { unbond: {} },
        basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    //block 125 - 160
    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 36))

    //block 160  "exchange_rate": "0.980440647482032022",
    await mustPass(basset.finish(a))

    //block 121
    await mustPass(basset.bond(a, 10000000, validators[2].validator_address))

    //block 122
    await mustPass(basset.bond(a, 10000000, validators[3].validator_address))

    //block 123
    await mustPass(basset.send_cw20_token(
        a,
        10000000,
        { unbond: {} },
        basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    //block 124
    await mustPass(basset.send_cw20_token(
        a,
        10000000,
        { unbond: {} },
        basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    await mustPass(basset.send_cw20_token(
        a,
        10,
        { unbond: {} },
        basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    //block 125 - 160
    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 36))

    await mustPass(basset.send_cw20_token(
        a,
        10,
        { unbond: {} },
        basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 36))

    //block 160
    await mustPass(basset.finish(a))

    await mustPass(basset.update_global_index(a))

    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 14))

    await mustPass(basset.update_global_index(a))

    await mustPass(basset.bond(c, 10, validators[2].validator_address))

    await mustPass(basset.bond(a, 10, validators[0].validator_address))

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

    //block 68 - 89
    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 22))

    // block 90
    await mustPass(emptyBlockWithFixedGas(lcd, gasStation))

    //block 91 - 119
    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 29))

    //block 120
    await mustPass(basset.finish(a))

    //block 121
    await mustPass(basset.bond(a, 10000000, validators[2].validator_address))

    //block 122
    await mustPass(basset.bond(a, 10000000, validators[3].validator_address))

    //block 123
    await mustPass(basset.send_cw20_token(
        a,
        15000000,
        { unbond: {} },
        basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    //block 124
    await mustPass(basset.send_cw20_token(
        a,
        15000000,
        { unbond: {} },
        basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    //block 125 - 160
    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 36))

    //block 160  "exchange_rate": "0.980440647482032022",
    await mustPass(basset.finish(a))

    //block 121
    await mustPass(basset.bond(a, 10000000, validators[2].validator_address))

    //block 122
    await mustPass(basset.bond(a, 10000000, validators[3].validator_address))

    //block 123
    await mustPass(basset.send_cw20_token(
        a,
        10000000,
        { unbond: {} },
        basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    //block 124
    await mustPass(basset.send_cw20_token(
        a,
        10000000,
        { unbond: {} },
        basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    await mustPass(basset.send_cw20_token(
        a,
        10,
        { unbond: {} },
        basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    //block 125 - 160
    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 36))

    await mustPass(basset.send_cw20_token(
        a,
        10,
        { unbond: {} },
        basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 36))

    //block 160
    await mustPass(basset.finish(a))

    await mustPass(basset.update_global_index(a))

    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 14))

    await mustPass(basset.update_global_index(a))

    await mustPass(basset.bond(c, 10, validators[2].validator_address))

    await mustPass(basset.bond(a, 10, validators[0].validator_address))

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

    //block 68 - 89
    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 22))

    // block 90
    await mustPass(emptyBlockWithFixedGas(lcd, gasStation))

    //block 91 - 119
    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 29))

    //block 120
    await mustPass(basset.finish(a))

    //block 121
    await mustPass(basset.bond(a, 10000000, validators[2].validator_address))

    //block 122
    await mustPass(basset.bond(a, 10000000, validators[3].validator_address))

    //block 123
    await mustPass(basset.send_cw20_token(
        a,
        15000000,
        { unbond: {} },
        basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    //block 124
    await mustPass(basset.send_cw20_token(
        a,
        15000000,
        { unbond: {} },
        basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    //block 125 - 160
    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 36))

    //block 160  "exchange_rate": "0.980440647482032022",
    await mustPass(basset.finish(a))

    //block 121
    await mustPass(basset.bond(a, 10000000, validators[2].validator_address))

    //block 122
    await mustPass(basset.bond(a, 10000000, validators[3].validator_address))

    //block 123
    await mustPass(basset.send_cw20_token(
        a,
        10000000,
        { unbond: {} },
        basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    //block 124
    await mustPass(basset.send_cw20_token(
        a,
        10000000,
        { unbond: {} },
        basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    await mustPass(basset.send_cw20_token(
        a,
        10,
        { unbond: {} },
        basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    //block 125 - 160
    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 36))

    await mustPass(basset.send_cw20_token(
        a,
        10,
        { unbond: {} },
        basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 36))

    //block 160
    await mustPass(basset.finish(a))

    await mustPass(basset.update_global_index(a))

    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 14))

    await mustPass(basset.update_global_index(a))

    await mustPass(basset.bond(c, 10, validators[2].validator_address))

    await mustPass(basset.bond(a, 10, validators[0].validator_address))

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

    //block 68 - 89
    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 22))

    // block 90
    await mustPass(emptyBlockWithFixedGas(lcd, gasStation))

    //block 91 - 119
    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 29))

    //block 120
    await mustPass(basset.finish(a))

    //block 121
    await mustPass(basset.bond(a, 10000000, validators[2].validator_address))

    //block 122
    await mustPass(basset.bond(a, 10000000, validators[3].validator_address))

    //block 123
    await mustPass(basset.send_cw20_token(
        a,
        15000000,
        { unbond: {} },
        basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    //block 124
    await mustPass(basset.send_cw20_token(
        a,
        15000000,
        { unbond: {} },
        basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    //block 125 - 160
    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 36))

    //block 160  "exchange_rate": "0.980440647482032022",
    await mustPass(basset.finish(a))

    //block 121
    await mustPass(basset.bond(a, 10000000, validators[2].validator_address))

    //block 122
    await mustPass(basset.bond(a, 10000000, validators[3].validator_address))

    //block 123
    await mustPass(basset.send_cw20_token(
        a,
        10000000,
        { unbond: {} },
        basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    //block 124
    await mustPass(basset.send_cw20_token(
        a,
        10000000,
        { unbond: {} },
        basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    await mustPass(basset.send_cw20_token(
        a,
        10,
        { unbond: {} },
        basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    //block 125 - 160
    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 36))

    await mustPass(basset.send_cw20_token(
        a,
        10,
        { unbond: {} },
        basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 36))

    //block 160
    await mustPass(basset.finish(a))

    await mustPass(basset.update_global_index(a))

    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 14))

    await mustPass(basset.update_global_index(a))

    await mustPass(basset.bond(c, 10, validators[2].validator_address))

    await mustPass(basset.bond(a, 10, validators[0].validator_address))

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

    //block 68 - 89
    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 22))

    // block 90
    await mustPass(emptyBlockWithFixedGas(lcd, gasStation))

    //block 91 - 119
    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 29))

    //block 120
    await mustPass(basset.finish(a))

    //block 121
    await mustPass(basset.bond(a, 10000000, validators[2].validator_address))

    //block 122
    await mustPass(basset.bond(a, 10000000, validators[3].validator_address))

    //block 123
    await mustPass(basset.send_cw20_token(
        a,
        15000000,
        { unbond: {} },
        basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    //block 124
    await mustPass(basset.send_cw20_token(
        a,
        15000000,
        { unbond: {} },
        basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    //block 125 - 160
    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 36))

    //block 160  "exchange_rate": "0.980440647482032022",
    await mustPass(basset.finish(a))

    //block 121
    await mustPass(basset.bond(a, 10000000, validators[2].validator_address))

    //block 122
    await mustPass(basset.bond(a, 10000000, validators[3].validator_address))

    //block 123
    await mustPass(basset.send_cw20_token(
        a,
        10000000,
        { unbond: {} },
        basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    //block 124
    await mustPass(basset.send_cw20_token(
        a,
        10000000,
        { unbond: {} },
        basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    await mustPass(basset.send_cw20_token(
        a,
        10,
        { unbond: {} },
        basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    //block 125 - 160
    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 36))

    await mustPass(basset.send_cw20_token(
        a,
        10,
        { unbond: {} },
        basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 36))

    //block 160
    await mustPass(basset.finish(a))

    await mustPass(basset.update_global_index(a))

    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 14))

    await mustPass(basset.update_global_index(a))

    await mustPass(basset.bond(c, 10, validators[2].validator_address))

    await mustPass(basset.bond(a, 10, validators[0].validator_address))

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

    //block 68 - 89
    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 22))

    // block 90
    await mustPass(emptyBlockWithFixedGas(lcd, gasStation))

    //block 91 - 119
    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 29))

    //block 120
    await mustPass(basset.finish(a))

    //block 121
    await mustPass(basset.bond(a, 10000000, validators[2].validator_address))

    //block 122
    await mustPass(basset.bond(a, 10000000, validators[3].validator_address))

    //block 123
    await mustPass(basset.send_cw20_token(
        a,
        15000000,
        { unbond: {} },
        basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    //block 124
    await mustPass(basset.send_cw20_token(
        a,
        15000000,
        { unbond: {} },
        basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    //block 125 - 160
    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 36))

    //block 160  "exchange_rate": "0.980440647482032022",
    await mustPass(basset.finish(a))

    //block 121
    await mustPass(basset.bond(a, 10000000, validators[2].validator_address))

    //block 122
    await mustPass(basset.bond(a, 10000000, validators[3].validator_address))

    //block 123
    await mustPass(basset.send_cw20_token(
        a,
        10000000,
        { unbond: {} },
        basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    //block 124
    await mustPass(basset.send_cw20_token(
        a,
        10000000,
        { unbond: {} },
        basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    await mustPass(basset.send_cw20_token(
        a,
        10,
        { unbond: {} },
        basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    //block 125 - 160
    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 36))

    await mustPass(basset.send_cw20_token(
        a,
        10,
        { unbond: {} },
        basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 36))

    //block 160
    await mustPass(basset.finish(a))

    await mustPass(basset.update_global_index(a))

    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 14))

    await mustPass(basset.update_global_index(a))

    await mustPass(basset.bond(c, 10, validators[2].validator_address))

    await mustPass(basset.bond(a, 10, validators[0].validator_address))

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

    //block 68 - 89
    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 22))

    // block 90
    await mustPass(emptyBlockWithFixedGas(lcd, gasStation))

    //block 91 - 119
    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 29))

    //block 120
    await mustPass(basset.finish(a))

    //block 121
    await mustPass(basset.bond(a, 10000000, validators[2].validator_address))

    //block 122
    await mustPass(basset.bond(a, 10000000, validators[3].validator_address))

    //block 123
    await mustPass(basset.send_cw20_token(
        a,
        15000000,
        { unbond: {} },
        basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    //block 124
    await mustPass(basset.send_cw20_token(
        a,
        15000000,
        { unbond: {} },
        basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    //block 125 - 160
    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 36))

    //block 160  "exchange_rate": "0.980440647482032022",
    await mustPass(basset.finish(a))

    //block 121
    await mustPass(basset.bond(a, 10000000, validators[2].validator_address))

    //block 122
    await mustPass(basset.bond(a, 10000000, validators[3].validator_address))

    //block 123
    await mustPass(basset.send_cw20_token(
        a,
        10000000,
        { unbond: {} },
        basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    //block 124
    await mustPass(basset.send_cw20_token(
        a,
        10000000,
        { unbond: {} },
        basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    await mustPass(basset.send_cw20_token(
        a,
        10,
        { unbond: {} },
        basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    //block 125 - 160
    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 36))

    await mustPass(basset.send_cw20_token(
        a,
        10,
        { unbond: {} },
        basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 36))

    //block 160
    await mustPass(basset.finish(a))

    await mustPass(basset.update_global_index(a))

    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 14))

    await mustPass(basset.update_global_index(a))

    await mustPass(basset.bond(c, 10, validators[2].validator_address))

    await mustPass(basset.bond(a, 10, validators[0].validator_address))

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

    //block 68 - 89
    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 22))

    // block 90
    await mustPass(emptyBlockWithFixedGas(lcd, gasStation))

    //block 91 - 119
    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 29))

    //block 120
    await mustPass(basset.finish(a))

    //block 121
    await mustPass(basset.bond(a, 10000000, validators[2].validator_address))

    //block 122
    await mustPass(basset.bond(a, 10000000, validators[3].validator_address))

    //block 123
    await mustPass(basset.send_cw20_token(
        a,
        15000000,
        { unbond: {} },
        basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    //block 124
    await mustPass(basset.send_cw20_token(
        a,
        15000000,
        { unbond: {} },
        basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    //block 125 - 160
    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 36))

    //block 160  "exchange_rate": "0.980440647482032022",
    await mustPass(basset.finish(a))

    //block 121
    await mustPass(basset.bond(a, 10000000, validators[2].validator_address))

    //block 122
    await mustPass(basset.bond(a, 10000000, validators[3].validator_address))

    //block 123
    await mustPass(basset.send_cw20_token(
        a,
        10000000,
        { unbond: {} },
        basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    //block 124
    await mustPass(basset.send_cw20_token(
        a,
        10000000,
        { unbond: {} },
        basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    await mustPass(basset.send_cw20_token(
        a,
        10,
        { unbond: {} },
        basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    //block 125 - 160
    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 36))

    await mustPass(basset.send_cw20_token(
        a,
        10,
        { unbond: {} },
        basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 36))

    //block 160
    await mustPass(basset.finish(a))

    await mustPass(basset.update_global_index(a))

    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 14))

    await mustPass(basset.update_global_index(a))

    await mustPass(basset.bond(c, 10, validators[2].validator_address))


    await mustPass(basset.bond(a, 10, validators[0].validator_address))

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

    //block 68 - 89
    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 22))

    // block 90
    await mustPass(emptyBlockWithFixedGas(lcd, gasStation))

    //block 91 - 119
    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 29))

    //block 120
    await mustPass(basset.finish(a))

    //block 121
    await mustPass(basset.bond(a, 10000000, validators[2].validator_address))

    //block 122
    await mustPass(basset.bond(a, 10000000, validators[3].validator_address))

    //block 123
    await mustPass(basset.send_cw20_token(
        a,
        15000000,
        { unbond: {} },
        basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    //block 124
    await mustPass(basset.send_cw20_token(
        a,
        15000000,
        { unbond: {} },
        basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    //block 125 - 160
    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 36))

    //block 160  "exchange_rate": "0.980440647482032022",
    await mustPass(basset.finish(a))

    //block 121
    await mustPass(basset.bond(a, 10000000, validators[2].validator_address))

    //block 122
    await mustPass(basset.bond(a, 10000000, validators[3].validator_address))

    //block 123
    await mustPass(basset.send_cw20_token(
        a,
        10000000,
        { unbond: {} },
        basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    //block 124
    await mustPass(basset.send_cw20_token(
        a,
        10000000,
        { unbond: {} },
        basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    await mustPass(basset.send_cw20_token(
        a,
        10,
        { unbond: {} },
        basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    //block 125 - 160
    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 36))

    await mustPass(basset.send_cw20_token(
        a,
        10,
        { unbond: {} },
        basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 36))

    //block 160
    await mustPass(basset.finish(a))

    await mustPass(basset.update_global_index(a))

    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 14))

    await mustPass(basset.update_global_index(a))

    await mustPass(basset.bond(c, 10, validators[2].validator_address))

    await mustPass(basset.bond(a, 10, validators[0].validator_address))

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

    //block 68 - 89
    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 22))

    // block 90
    await mustPass(emptyBlockWithFixedGas(lcd, gasStation))

    //block 91 - 119
    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 29))

    //block 120
    await mustPass(basset.finish(a))

    //block 121
    await mustPass(basset.bond(a, 10000000, validators[2].validator_address))

    //block 122
    await mustPass(basset.bond(a, 10000000, validators[3].validator_address))

    //block 123
    await mustPass(basset.send_cw20_token(
        a,
        15000000,
        { unbond: {} },
        basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    //block 124
    await mustPass(basset.send_cw20_token(
        a,
        15000000,
        { unbond: {} },
        basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    //block 125 - 160
    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 36))

    //block 160  "exchange_rate": "0.980440647482032022",
    await mustPass(basset.finish(a))

    //block 121
    await mustPass(basset.bond(a, 10000000, validators[2].validator_address))

    //block 122
    await mustPass(basset.bond(a, 10000000, validators[3].validator_address))

    //block 123
    await mustPass(basset.send_cw20_token(
        a,
        10000000,
        { unbond: {} },
        basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    //block 124
    await mustPass(basset.send_cw20_token(
        a,
        10000000,
        { unbond: {} },
        basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    await mustPass(basset.send_cw20_token(
        a,
        10,
        { unbond: {} },
        basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    //block 125 - 160
    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 36))

    await mustPass(basset.send_cw20_token(
        a,
        10,
        { unbond: {} },
        basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 36))

    //block 160
    await mustPass(basset.finish(a))

    await mustPass(basset.update_global_index(a))

    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 14))

    await mustPass(basset.update_global_index(a))

    await mustPass(basset.bond(c, 10, validators[2].validator_address))

    await mustPass(basset.bond(a, 10, validators[0].validator_address))

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

    //block 68 - 89
    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 22))

    // block 90
    await mustPass(emptyBlockWithFixedGas(lcd, gasStation))

    //block 91 - 119
    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 29))

    //block 120
    await mustPass(basset.finish(a))

    //block 121
    await mustPass(basset.bond(a, 10000000, validators[2].validator_address))

    //block 122
    await mustPass(basset.bond(a, 10000000, validators[3].validator_address))

    //block 123
    await mustPass(basset.send_cw20_token(
        a,
        15000000,
        { unbond: {} },
        basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    //block 124
    await mustPass(basset.send_cw20_token(
        a,
        15000000,
        { unbond: {} },
        basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    //block 125 - 160
    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 36))

    //block 160  "exchange_rate": "0.980440647482032022",
    await mustPass(basset.finish(a))

    //block 121
    await mustPass(basset.bond(a, 10000000, validators[2].validator_address))

    //block 122
    await mustPass(basset.bond(a, 10000000, validators[3].validator_address))

    //block 123
    await mustPass(basset.send_cw20_token(
        a,
        10000000,
        { unbond: {} },
        basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    //block 124
    await mustPass(basset.send_cw20_token(
        a,
        10000000,
        { unbond: {} },
        basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    await mustPass(basset.send_cw20_token(
        a,
        10,
        { unbond: {} },
        basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    //block 125 - 160
    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 36))

    await mustPass(basset.send_cw20_token(
        a,
        10,
        { unbond: {} },
        basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 36))

    //block 160
    await mustPass(basset.finish(a))

    await mustPass(basset.update_global_index(a))

    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 14))

    await mustPass(basset.update_global_index(a))

    await mustPass(basset.bond(c, 10, validators[2].validator_address))

    await mustPass(basset.bond(a, 10, validators[0].validator_address))

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

    //block 68 - 89
    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 22))

    // block 90
    await mustPass(emptyBlockWithFixedGas(lcd, gasStation))

    //block 91 - 119
    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 29))

    //block 120
    await mustPass(basset.finish(a))

    //block 121
    await mustPass(basset.bond(a, 10000000, validators[2].validator_address))

    //block 122
    await mustPass(basset.bond(a, 10000000, validators[3].validator_address))

    //block 123
    await mustPass(basset.send_cw20_token(
        a,
        15000000,
        { unbond: {} },
        basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    //block 124
    await mustPass(basset.send_cw20_token(
        a,
        15000000,
        { unbond: {} },
        basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    //block 125 - 160
    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 36))

    //block 160  "exchange_rate": "0.980440647482032022",
    await mustPass(basset.finish(a))

    //block 121
    await mustPass(basset.bond(a, 10000000, validators[2].validator_address))

    //block 122
    await mustPass(basset.bond(a, 10000000, validators[3].validator_address))

    //block 123
    await mustPass(basset.send_cw20_token(
        a,
        10000000,
        { unbond: {} },
        basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    //block 124
    await mustPass(basset.send_cw20_token(
        a,
        10000000,
        { unbond: {} },
        basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    await mustPass(basset.send_cw20_token(
        a,
        10,
        { unbond: {} },
        basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    //block 125 - 160
    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 36))

    await mustPass(basset.send_cw20_token(
        a,
        10,
        { unbond: {} },
        basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 36))

    //block 160
    await mustPass(basset.finish(a))

    await mustPass(basset.update_global_index(a))

    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 14))

    await mustPass(basset.update_global_index(a))

    await mustPass(basset.bond(c, 10, validators[2].validator_address))

    await mustPass(basset.bond(a, 10, validators[0].validator_address))

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

    //block 68 - 89
    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 22))

    // block 90
    await mustPass(emptyBlockWithFixedGas(lcd, gasStation))

    //block 91 - 119
    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 29))

    //block 120
    await mustPass(basset.finish(a))

    //block 121
    await mustPass(basset.bond(a, 10000000, validators[2].validator_address))

    //block 122
    await mustPass(basset.bond(a, 10000000, validators[3].validator_address))

    //block 123
    await mustPass(basset.send_cw20_token(
        a,
        15000000,
        { unbond: {} },
        basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    //block 124
    await mustPass(basset.send_cw20_token(
        a,
        15000000,
        { unbond: {} },
        basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    //block 125 - 160
    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 36))

    //block 160  "exchange_rate": "0.980440647482032022",
    await mustPass(basset.finish(a))

    //block 121
    await mustPass(basset.bond(a, 10000000, validators[2].validator_address))

    //block 122
    await mustPass(basset.bond(a, 10000000, validators[3].validator_address))

    //block 123
    await mustPass(basset.send_cw20_token(
        a,
        10000000,
        { unbond: {} },
        basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    //block 124
    await mustPass(basset.send_cw20_token(
        a,
        10000000,
        { unbond: {} },
        basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    await mustPass(basset.send_cw20_token(
        a,
        10,
        { unbond: {} },
        basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    //block 125 - 160
    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 36))

    await mustPass(basset.send_cw20_token(
        a,
        10,
        { unbond: {} },
        basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 36))

    //block 160
    await mustPass(basset.finish(a))

    await mustPass(basset.update_global_index(a))

    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 14))

    await mustPass(basset.update_global_index(a))

    await mustPass(basset.bond(c, 10, validators[2].validator_address))

    await mustPass(basset.bond(a, 10, validators[0].validator_address))

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

    //block 68 - 89
    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 22))

    // block 90
    await mustPass(emptyBlockWithFixedGas(lcd, gasStation))

    //block 91 - 119
    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 29))

    //block 120
    await mustPass(basset.finish(a))

    //block 121
    await mustPass(basset.bond(a, 10000000, validators[2].validator_address))

    //block 122
    await mustPass(basset.bond(a, 10000000, validators[3].validator_address))

    //block 123
    await mustPass(basset.send_cw20_token(
        a,
        15000000,
        { unbond: {} },
        basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    //block 124
    await mustPass(basset.send_cw20_token(
        a,
        15000000,
        { unbond: {} },
        basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    //block 125 - 160
    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 36))

    //block 160  "exchange_rate": "0.980440647482032022",
    await mustPass(basset.finish(a))

    //block 121
    await mustPass(basset.bond(a, 10000000, validators[2].validator_address))

    //block 122
    await mustPass(basset.bond(a, 10000000, validators[3].validator_address))

    //block 123
    await mustPass(basset.send_cw20_token(
        a,
        10000000,
        { unbond: {} },
        basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    //block 124
    await mustPass(basset.send_cw20_token(
        a,
        10000000,
        { unbond: {} },
        basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    await mustPass(basset.send_cw20_token(
        a,
        10,
        { unbond: {} },
        basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    //block 125 - 160
    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 36))

    await mustPass(basset.send_cw20_token(
        a,
        10,
        { unbond: {} },
        basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 36))

    //block 160
    await mustPass(basset.finish(a))

    await mustPass(basset.update_global_index(a))

    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 14))

    await mustPass(basset.update_global_index(a))

    await mustPass(basset.bond(c, 10, validators[2].validator_address))

    await mustPass(basset.bond(a, 10, validators[0].validator_address))

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

    //block 68 - 89
    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 22))

    // block 90
    await mustPass(emptyBlockWithFixedGas(lcd, gasStation))

    //block 91 - 119
    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 29))

    //block 120
    await mustPass(basset.finish(a))

    //block 121
    await mustPass(basset.bond(a, 10000000, validators[2].validator_address))

    //block 122
    await mustPass(basset.bond(a, 10000000, validators[3].validator_address))

    //block 123
    await mustPass(basset.send_cw20_token(
        a,
        15000000,
        { unbond: {} },
        basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    //block 124
    await mustPass(basset.send_cw20_token(
        a,
        15000000,
        { unbond: {} },
        basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    //block 125 - 160
    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 36))

    //block 160  "exchange_rate": "0.980440647482032022",
    await mustPass(basset.finish(a))

    //block 121
    await mustPass(basset.bond(a, 10000000, validators[2].validator_address))

    //block 122
    await mustPass(basset.bond(a, 10000000, validators[3].validator_address))

    //block 123
    await mustPass(basset.send_cw20_token(
        a,
        10000000,
        { unbond: {} },
        basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    //block 124
    await mustPass(basset.send_cw20_token(
        a,
        10000000,
        { unbond: {} },
        basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    await mustPass(basset.send_cw20_token(
        a,
        10,
        { unbond: {} },
        basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    //block 125 - 160
    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 36))

    await mustPass(basset.send_cw20_token(
        a,
        10,
        { unbond: {} },
        basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 36))

    //block 160
    await mustPass(basset.finish(a))

    await mustPass(basset.update_global_index(a))

    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 14))

    await mustPass(basset.update_global_index(a))

    await mustPass(basset.bond(c, 10, validators[2].validator_address))

    await mustPass(basset.bond(a, 10, validators[0].validator_address))

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

    //block 68 - 89
    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 22))

    // block 90
    await mustPass(emptyBlockWithFixedGas(lcd, gasStation))

    //block 91 - 119
    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 29))

    //block 120
    await mustPass(basset.finish(a))

    //block 121
    await mustPass(basset.bond(a, 10000000, validators[2].validator_address))

    //block 122
    await mustPass(basset.bond(a, 10000000, validators[3].validator_address))

    //block 123
    await mustPass(basset.send_cw20_token(
        a,
        15000000,
        { unbond: {} },
        basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    //block 124
    await mustPass(basset.send_cw20_token(
        a,
        15000000,
        { unbond: {} },
        basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    //block 125 - 160
    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 36))

    //block 160  "exchange_rate": "0.980440647482032022",
    await mustPass(basset.finish(a))

    //block 121
    await mustPass(basset.bond(a, 10000000, validators[2].validator_address))

    //block 122
    await mustPass(basset.bond(a, 10000000, validators[3].validator_address))

    //block 123
    await mustPass(basset.send_cw20_token(
        a,
        10000000,
        { unbond: {} },
        basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    //block 124
    await mustPass(basset.send_cw20_token(
        a,
        10000000,
        { unbond: {} },
        basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    await mustPass(basset.send_cw20_token(
        a,
        10,
        { unbond: {} },
        basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    //block 125 - 160
    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 36))

    await mustPass(basset.send_cw20_token(
        a,
        10,
        { unbond: {} },
        basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 36))

    //block 160
    await mustPass(basset.finish(a))

    await mustPass(basset.update_global_index(a))

    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 14))

    await mustPass(basset.update_global_index(a))

    await mustPass(basset.bond(c, 10, validators[2].validator_address))

    await mustPass(basset.bond(a, 10, validators[0].validator_address))

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

    //block 68 - 89
    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 22))

    // block 90
    await mustPass(emptyBlockWithFixedGas(lcd, gasStation))

    //block 91 - 119
    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 29))

    //block 120
    await mustPass(basset.finish(a))

    //block 121
    await mustPass(basset.bond(a, 10000000, validators[2].validator_address))

    //block 122
    await mustPass(basset.bond(a, 10000000, validators[3].validator_address))

    //block 123
    await mustPass(basset.send_cw20_token(
        a,
        15000000,
        { unbond: {} },
        basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    //block 124
    await mustPass(basset.send_cw20_token(
        a,
        15000000,
        { unbond: {} },
        basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    //block 125 - 160
    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 36))

    //block 160  "exchange_rate": "0.980440647482032022",
    await mustPass(basset.finish(a))

    //block 121
    await mustPass(basset.bond(a, 10000000, validators[2].validator_address))

    //block 122
    await mustPass(basset.bond(a, 10000000, validators[3].validator_address))

    //block 123
    await mustPass(basset.send_cw20_token(
        a,
        10000000,
        { unbond: {} },
        basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    //block 124
    await mustPass(basset.send_cw20_token(
        a,
        10000000,
        { unbond: {} },
        basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    await mustPass(basset.send_cw20_token(
        a,
        10,
        { unbond: {} },
        basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    //block 125 - 160
    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 36))

    await mustPass(basset.send_cw20_token(
        a,
        10,
        { unbond: {} },
        basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 36))

    //block 160
    await mustPass(basset.finish(a))

    await mustPass(basset.update_global_index(a))

    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 14))

    await mustPass(basset.update_global_index(a))

    await mustPass(basset.bond(c, 10, validators[2].validator_address))

    await mustPass(basset.bond(a, 10, validators[0].validator_address))

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

    //block 68 - 89
    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 22))

    // block 90
    await mustPass(emptyBlockWithFixedGas(lcd, gasStation))

    //block 91 - 119
    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 29))

    //block 120
    await mustPass(basset.finish(a))

    //block 121
    await mustPass(basset.bond(a, 10000000, validators[2].validator_address))

    //block 122
    await mustPass(basset.bond(a, 10000000, validators[3].validator_address))

    //block 123
    await mustPass(basset.send_cw20_token(
        a,
        15000000,
        { unbond: {} },
        basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    //block 124
    await mustPass(basset.send_cw20_token(
        a,
        15000000,
        { unbond: {} },
        basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    //block 125 - 160
    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 36))

    //block 160  "exchange_rate": "0.980440647482032022",
    await mustPass(basset.finish(a))

    //block 121
    await mustPass(basset.bond(a, 10000000, validators[2].validator_address))

    //block 122
    await mustPass(basset.bond(a, 10000000, validators[3].validator_address))

    //block 123
    await mustPass(basset.send_cw20_token(
        a,
        10000000,
        { unbond: {} },
        basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    //block 124
    await mustPass(basset.send_cw20_token(
        a,
        10000000,
        { unbond: {} },
        basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    await mustPass(basset.send_cw20_token(
        a,
        10,
        { unbond: {} },
        basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    //block 125 - 160
    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 36))

    await mustPass(basset.send_cw20_token(
        a,
        10,
        { unbond: {} },
        basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 36))

    //block 160
    await mustPass(basset.finish(a))

    await mustPass(basset.update_global_index(a))

    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 14))

    await mustPass(basset.update_global_index(a))

    await mustPass(basset.bond(c, 10, validators[2].validator_address))

    await mustPass(basset.bond(a, 10, validators[0].validator_address))

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

    //block 68 - 89
    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 22))

    // block 90
    await mustPass(emptyBlockWithFixedGas(lcd, gasStation))

    //block 91 - 119
    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 29))

    //block 120
    await mustPass(basset.finish(a))

    //block 121
    await mustPass(basset.bond(a, 10000000, validators[2].validator_address))

    //block 122
    await mustPass(basset.bond(a, 10000000, validators[3].validator_address))

    //block 123
    await mustPass(basset.send_cw20_token(
        a,
        15000000,
        { unbond: {} },
        basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    //block 124
    await mustPass(basset.send_cw20_token(
        a,
        15000000,
        { unbond: {} },
        basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    //block 125 - 160
    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 36))

    //block 160  "exchange_rate": "0.980440647482032022",
    await mustPass(basset.finish(a))

    //block 121
    await mustPass(basset.bond(a, 10000000, validators[2].validator_address))

    //block 122
    await mustPass(basset.bond(a, 10000000, validators[3].validator_address))

    //block 123
    await mustPass(basset.send_cw20_token(
        a,
        10000000,
        { unbond: {} },
        basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    //block 124
    await mustPass(basset.send_cw20_token(
        a,
        10000000,
        { unbond: {} },
        basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    await mustPass(basset.send_cw20_token(
        a,
        10,
        { unbond: {} },
        basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    //block 125 - 160
    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 36))

    await mustPass(basset.send_cw20_token(
        a,
        10,
        { unbond: {} },
        basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 36))

    //block 160
    await mustPass(basset.finish(a))

    await mustPass(basset.update_global_index(a))

    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 14))

    await mustPass(basset.update_global_index(a))

    await mustPass(basset.bond(c, 10, validators[2].validator_address))

    await mustPass(basset.bond(a, 10, validators[0].validator_address))

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

    //block 68 - 89
    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 22))

    // block 90
    await mustPass(emptyBlockWithFixedGas(lcd, gasStation))

    //block 91 - 119
    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 29))

    //block 120
    await mustPass(basset.finish(a))

    //block 121
    await mustPass(basset.bond(a, 10000000, validators[2].validator_address))

    //block 122
    await mustPass(basset.bond(a, 10000000, validators[3].validator_address))

    //block 123
    await mustPass(basset.send_cw20_token(
        a,
        15000000,
        { unbond: {} },
        basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    //block 124
    await mustPass(basset.send_cw20_token(
        a,
        15000000,
        { unbond: {} },
        basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    //block 125 - 160
    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 36))

    //block 160  "exchange_rate": "0.980440647482032022",
    await mustPass(basset.finish(a))

    //block 121
    await mustPass(basset.bond(a, 10000000, validators[2].validator_address))

    //block 122
    await mustPass(basset.bond(a, 10000000, validators[3].validator_address))

    //block 123
    await mustPass(basset.send_cw20_token(
        a,
        10000000,
        { unbond: {} },
        basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    //block 124
    await mustPass(basset.send_cw20_token(
        a,
        10000000,
        { unbond: {} },
        basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    await mustPass(basset.send_cw20_token(
        a,
        10,
        { unbond: {} },
        basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    //block 125 - 160
    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 36))

    await mustPass(basset.send_cw20_token(
        a,
        10,
        { unbond: {} },
        basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 36))

    //block 160
    await mustPass(basset.finish(a))

    await mustPass(basset.update_global_index(a))

    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 14))

    await mustPass(basset.update_global_index(a))

    await mustPass(basset.bond(c, 10, validators[2].validator_address))

    await mustPass(basset.bond(a, 10, validators[0].validator_address))

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

    //block 68 - 89
    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 22))

    // block 90
    await mustPass(emptyBlockWithFixedGas(lcd, gasStation))

    //block 91 - 119
    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 29))

    //block 120
    await mustPass(basset.finish(a))

    //block 121
    await mustPass(basset.bond(a, 10000000, validators[2].validator_address))

    //block 122
    await mustPass(basset.bond(a, 10000000, validators[3].validator_address))

    //block 123
    await mustPass(basset.send_cw20_token(
        a,
        15000000,
        { unbond: {} },
        basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    //block 124
    await mustPass(basset.send_cw20_token(
        a,
        15000000,
        { unbond: {} },
        basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    //block 125 - 160
    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 36))

    //block 160  "exchange_rate": "0.980440647482032022",
    await mustPass(basset.finish(a))

    //block 121
    await mustPass(basset.bond(a, 10000000, validators[2].validator_address))

    //block 122
    await mustPass(basset.bond(a, 10000000, validators[3].validator_address))

    //block 123
    await mustPass(basset.send_cw20_token(
        a,
        10000000,
        { unbond: {} },
        basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    //block 124
    await mustPass(basset.send_cw20_token(
        a,
        10000000,
        { unbond: {} },
        basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    await mustPass(basset.send_cw20_token(
        a,
        10,
        { unbond: {} },
        basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    //block 125 - 160
    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 36))

    await mustPass(basset.send_cw20_token(
        a,
        10,
        { unbond: {} },
        basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 36))

    //block 160
    await mustPass(basset.finish(a))

    await mustPass(basset.update_global_index(a))

    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 14))

    await mustPass(basset.update_global_index(a))

    await mustPass(basset.bond(c, 10, validators[2].validator_address))

    await mustPass(basset.bond(a, 10, validators[0].validator_address))

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

    //block 68 - 89
    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 22))

    // block 90
    await mustPass(emptyBlockWithFixedGas(lcd, gasStation))

    //block 91 - 119
    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 29))

    //block 120
    await mustPass(basset.finish(a))

    //block 121
    await mustPass(basset.bond(a, 10000000, validators[2].validator_address))

    //block 122
    await mustPass(basset.bond(a, 10000000, validators[3].validator_address))

    //block 123
    await mustPass(basset.send_cw20_token(
        a,
        15000000,
        { unbond: {} },
        basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    //block 124
    await mustPass(basset.send_cw20_token(
        a,
        15000000,
        { unbond: {} },
        basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    //block 125 - 160
    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 36))

    //block 160  "exchange_rate": "0.980440647482032022",
    await mustPass(basset.finish(a))

    //block 121
    await mustPass(basset.bond(a, 10000000, validators[2].validator_address))

    //block 122
    await mustPass(basset.bond(a, 10000000, validators[3].validator_address))

    //block 123
    await mustPass(basset.send_cw20_token(
        a,
        10000000,
        { unbond: {} },
        basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    //block 124
    await mustPass(basset.send_cw20_token(
        a,
        10000000,
        { unbond: {} },
        basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    await mustPass(basset.send_cw20_token(
        a,
        10,
        { unbond: {} },
        basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    //block 125 - 160
    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 36))

    await mustPass(basset.send_cw20_token(
        a,
        10,
        { unbond: {} },
        basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 36))

    //block 160
    await mustPass(basset.finish(a))

    await mustPass(basset.update_global_index(a))

    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 14))

    await mustPass(basset.update_global_index(a))

    await mustPass(basset.bond(c, 10, validators[2].validator_address))

    await mustPass(basset.bond(a, 10, validators[0].validator_address))

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

    //block 68 - 89
    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 22))

    // block 90
    await mustPass(emptyBlockWithFixedGas(lcd, gasStation))

    //block 91 - 119
    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 29))

    //block 120
    await mustPass(basset.finish(a))

    //block 121
    await mustPass(basset.bond(a, 10000000, validators[2].validator_address))

    //block 122
    await mustPass(basset.bond(a, 10000000, validators[3].validator_address))

    //block 123
    await mustPass(basset.send_cw20_token(
        a,
        15000000,
        { unbond: {} },
        basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    //block 124
    await mustPass(basset.send_cw20_token(
        a,
        15000000,
        { unbond: {} },
        basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    //block 125 - 160
    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 36))

    //block 160  "exchange_rate": "0.980440647482032022",
    await mustPass(basset.finish(a))

    //block 121
    await mustPass(basset.bond(a, 10000000, validators[2].validator_address))

    //block 122
    await mustPass(basset.bond(a, 10000000, validators[3].validator_address))

    //block 123
    await mustPass(basset.send_cw20_token(
        a,
        10000000,
        { unbond: {} },
        basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    //block 124
    await mustPass(basset.send_cw20_token(
        a,
        10000000,
        { unbond: {} },
        basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    await mustPass(basset.send_cw20_token(
        a,
        10,
        { unbond: {} },
        basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    //block 125 - 160
    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 36))

    await mustPass(basset.send_cw20_token(
        a,
        10,
        { unbond: {} },
        basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 36))

    //block 160
    await mustPass(basset.finish(a))

    await mustPass(basset.update_global_index(a))

    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 14))

    await mustPass(basset.update_global_index(a))

    await mustPass(basset.bond(c, 10, validators[2].validator_address))

    await mustPass(basset.bond(a, 10, validators[0].validator_address))

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

    //block 68 - 89
    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 22))

    // block 90
    await mustPass(emptyBlockWithFixedGas(lcd, gasStation))

    //block 91 - 119
    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 29))

    //block 120
    await mustPass(basset.finish(a))

    //block 121
    await mustPass(basset.bond(a, 10000000, validators[2].validator_address))

    //block 122
    await mustPass(basset.bond(a, 10000000, validators[3].validator_address))

    //block 123
    await mustPass(basset.send_cw20_token(
        a,
        15000000,
        { unbond: {} },
        basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    //block 124
    await mustPass(basset.send_cw20_token(
        a,
        15000000,
        { unbond: {} },
        basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    //block 125 - 160
    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 36))

    //block 160  "exchange_rate": "0.980440647482032022",
    await mustPass(basset.finish(a))

    //block 121
    await mustPass(basset.bond(a, 10000000, validators[2].validator_address))

    //block 122
    await mustPass(basset.bond(a, 10000000, validators[3].validator_address))

    //block 123
    await mustPass(basset.send_cw20_token(
        a,
        10000000,
        { unbond: {} },
        basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    //block 124
    await mustPass(basset.send_cw20_token(
        a,
        10000000,
        { unbond: {} },
        basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    await mustPass(basset.send_cw20_token(
        a,
        10,
        { unbond: {} },
        basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    //block 125 - 160
    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 36))

    await mustPass(basset.send_cw20_token(
        a,
        10,
        { unbond: {} },
        basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 36))

    //block 160
    await mustPass(basset.finish(a))

    await mustPass(basset.update_global_index(a))

    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 14))

    await mustPass(basset.update_global_index(a))

    await mustPass(basset.bond(c, 10, validators[2].validator_address))

    await mustPass(basset.bond(a, 10, validators[0].validator_address))

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

    //block 68 - 89
    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 22))

    // block 90
    await mustPass(emptyBlockWithFixedGas(lcd, gasStation))

    //block 91 - 119
    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 29))

    //block 120
    await mustPass(basset.finish(a))

    //block 121
    await mustPass(basset.bond(a, 10000000, validators[2].validator_address))

    //block 122
    await mustPass(basset.bond(a, 10000000, validators[3].validator_address))

    //block 123
    await mustPass(basset.send_cw20_token(
        a,
        15000000,
        { unbond: {} },
        basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    //block 124
    await mustPass(basset.send_cw20_token(
        a,
        15000000,
        { unbond: {} },
        basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    //block 125 - 160
    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 36))

    //block 160  "exchange_rate": "0.980440647482032022",
    await mustPass(basset.finish(a))

    //block 121
    await mustPass(basset.bond(a, 10000000, validators[2].validator_address))

    //block 122
    await mustPass(basset.bond(a, 10000000, validators[3].validator_address))

    //block 123
    await mustPass(basset.send_cw20_token(
        a,
        10000000,
        { unbond: {} },
        basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    //block 124
    await mustPass(basset.send_cw20_token(
        a,
        10000000,
        { unbond: {} },
        basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    await mustPass(basset.send_cw20_token(
        a,
        10,
        { unbond: {} },
        basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    //block 125 - 160
    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 36))

    await mustPass(basset.send_cw20_token(
        a,
        10,
        { unbond: {} },
        basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 36))

    //block 160
    await mustPass(basset.finish(a))

    await mustPass(basset.update_global_index(a))

    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 14))

    await mustPass(basset.update_global_index(a))

    await mustPass(basset.bond(c, 10, validators[2].validator_address))

    await mustPass(basset.bond(a, 10, validators[0].validator_address))

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

    //block 68 - 89
    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 22))

    // block 90
    await mustPass(emptyBlockWithFixedGas(lcd, gasStation))

    //block 91 - 119
    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 29))

    //block 120
    await mustPass(basset.finish(a))

    //block 121
    await mustPass(basset.bond(a, 10000000, validators[2].validator_address))

    //block 122
    await mustPass(basset.bond(a, 10000000, validators[3].validator_address))

    //block 123
    await mustPass(basset.send_cw20_token(
        a,
        15000000,
        { unbond: {} },
        basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    //block 124
    await mustPass(basset.send_cw20_token(
        a,
        15000000,
        { unbond: {} },
        basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    //block 125 - 160
    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 36))

    //block 160  "exchange_rate": "0.980440647482032022",
    await mustPass(basset.finish(a))

    //block 121
    await mustPass(basset.bond(a, 10000000, validators[2].validator_address))

    //block 122
    await mustPass(basset.bond(a, 10000000, validators[3].validator_address))

    //block 123
    await mustPass(basset.send_cw20_token(
        a,
        10000000,
        { unbond: {} },
        basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    //block 124
    await mustPass(basset.send_cw20_token(
        a,
        10000000,
        { unbond: {} },
        basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    await mustPass(basset.send_cw20_token(
        a,
        10,
        { unbond: {} },
        basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    //block 125 - 160
    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 36))

    await mustPass(basset.send_cw20_token(
        a,
        10,
        { unbond: {} },
        basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 36))

    //block 160
    await mustPass(basset.finish(a))

    await mustPass(basset.update_global_index(a))

    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 14))

    await mustPass(basset.update_global_index(a))

    await mustPass(basset.bond(c, 10, validators[2].validator_address))

    await mustPass(basset.bond(a, 10, validators[0].validator_address))

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

    //block 68 - 89
    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 22))

    // block 90
    await mustPass(emptyBlockWithFixedGas(lcd, gasStation))

    //block 91 - 119
    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 29))

    //block 120
    await mustPass(basset.finish(a))

    //block 121
    await mustPass(basset.bond(a, 10000000, validators[2].validator_address))

    //block 122
    await mustPass(basset.bond(a, 10000000, validators[3].validator_address))

    //block 123
    await mustPass(basset.send_cw20_token(
        a,
        15000000,
        { unbond: {} },
        basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    //block 124
    await mustPass(basset.send_cw20_token(
        a,
        15000000,
        { unbond: {} },
        basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    //block 125 - 160
    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 36))

    //block 160  "exchange_rate": "0.980440647482032022",
    await mustPass(basset.finish(a))

    //block 121
    await mustPass(basset.bond(a, 10000000, validators[2].validator_address))

    //block 122
    await mustPass(basset.bond(a, 10000000, validators[3].validator_address))

    //block 123
    await mustPass(basset.send_cw20_token(
        a,
        10000000,
        { unbond: {} },
        basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    //block 124
    await mustPass(basset.send_cw20_token(
        a,
        10000000,
        { unbond: {} },
        basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    await mustPass(basset.send_cw20_token(
        a,
        10,
        { unbond: {} },
        basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    //block 125 - 160
    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 36))

    await mustPass(basset.send_cw20_token(
        a,
        10,
        { unbond: {} },
        basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 36))

    //block 160
    await mustPass(basset.finish(a))

    await mustPass(basset.update_global_index(a))

    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 14))

    await mustPass(basset.update_global_index(a))

    await mustPass(basset.bond(c, 10, validators[2].validator_address))

    await mustPass(basset.bond(a, 10, validators[0].validator_address))

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

    //block 68 - 89
    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 22))

    // block 90
    await mustPass(emptyBlockWithFixedGas(lcd, gasStation))

    //block 91 - 119
    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 29))

    //block 120
    await mustPass(basset.finish(a))

    //block 121
    await mustPass(basset.bond(a, 10000000, validators[2].validator_address))

    //block 122
    await mustPass(basset.bond(a, 10000000, validators[3].validator_address))

    //block 123
    await mustPass(basset.send_cw20_token(
        a,
        15000000,
        { unbond: {} },
        basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    //block 124
    await mustPass(basset.send_cw20_token(
        a,
        15000000,
        { unbond: {} },
        basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    //block 125 - 160
    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 36))

    //block 160  "exchange_rate": "0.980440647482032022",
    await mustPass(basset.finish(a))

    //block 121
    await mustPass(basset.bond(a, 10000000, validators[2].validator_address))

    //block 122
    await mustPass(basset.bond(a, 10000000, validators[3].validator_address))

    //block 123
    await mustPass(basset.send_cw20_token(
        a,
        10000000,
        { unbond: {} },
        basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    //block 124
    await mustPass(basset.send_cw20_token(
        a,
        10000000,
        { unbond: {} },
        basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    await mustPass(basset.send_cw20_token(
        a,
        10,
        { unbond: {} },
        basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    //block 125 - 160
    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 36))

    await mustPass(basset.send_cw20_token(
        a,
        10,
        { unbond: {} },
        basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 36))

    //block 160
    await mustPass(basset.finish(a))

    await mustPass(basset.update_global_index(a))

    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 14))

    await mustPass(basset.update_global_index(a))

    await mustPass(basset.bond(c, 10, validators[2].validator_address))

    await mustPass(basset.bond(a, 10, validators[0].validator_address))

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

    //block 68 - 89
    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 22))

    // block 90
    await mustPass(emptyBlockWithFixedGas(lcd, gasStation))

    //block 91 - 119
    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 29))

    //block 120
    await mustPass(basset.finish(a))

    //block 121
    await mustPass(basset.bond(a, 10000000, validators[2].validator_address))

    //block 122
    await mustPass(basset.bond(a, 10000000, validators[3].validator_address))

    //block 123
    await mustPass(basset.send_cw20_token(
        a,
        15000000,
        { unbond: {} },
        basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    //block 124
    await mustPass(basset.send_cw20_token(
        a,
        15000000,
        { unbond: {} },
        basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    //block 125 - 160
    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 36))

    //block 160  "exchange_rate": "0.980440647482032022",
    await mustPass(basset.finish(a))

    //block 121
    await mustPass(basset.bond(a, 10000000, validators[2].validator_address))

    //block 122
    await mustPass(basset.bond(a, 10000000, validators[3].validator_address))

    //block 123
    await mustPass(basset.send_cw20_token(
        a,
        10000000,
        { unbond: {} },
        basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    //block 124
    await mustPass(basset.send_cw20_token(
        a,
        10000000,
        { unbond: {} },
        basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    await mustPass(basset.send_cw20_token(
        a,
        10,
        { unbond: {} },
        basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    //block 125 - 160
    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 36))

    await mustPass(basset.send_cw20_token(
        a,
        10,
        { unbond: {} },
        basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 36))

    //block 160
    await mustPass(basset.finish(a))

    await mustPass(basset.update_global_index(a))

    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 14))

    await mustPass(basset.update_global_index(a))

    await mustPass(basset.bond(c, 10, validators[2].validator_address))

    await mustPass(basset.bond(a, 10, validators[0].validator_address))

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

    //block 68 - 89
    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 22))

    // block 90
    await mustPass(emptyBlockWithFixedGas(lcd, gasStation))

    //block 91 - 119
    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 29))

    //block 120
    await mustPass(basset.finish(a))

    //block 121
    await mustPass(basset.bond(a, 10000000, validators[2].validator_address))

    //block 122
    await mustPass(basset.bond(a, 10000000, validators[3].validator_address))

    //block 123
    await mustPass(basset.send_cw20_token(
        a,
        15000000,
        { unbond: {} },
        basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    //block 124
    await mustPass(basset.send_cw20_token(
        a,
        15000000,
        { unbond: {} },
        basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    //block 125 - 160
    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 36))

    //block 160  "exchange_rate": "0.980440647482032022",
    await mustPass(basset.finish(a))

    //block 121
    await mustPass(basset.bond(a, 10000000, validators[2].validator_address))

    //block 122
    await mustPass(basset.bond(a, 10000000, validators[3].validator_address))

    //block 123
    await mustPass(basset.send_cw20_token(
        a,
        10000000,
        { unbond: {} },
        basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    //block 124
    await mustPass(basset.send_cw20_token(
        a,
        10000000,
        { unbond: {} },
        basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    await mustPass(basset.send_cw20_token(
        a,
        10,
        { unbond: {} },
        basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    //block 125 - 160
    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 36))

    await mustPass(basset.send_cw20_token(
        a,
        10,
        { unbond: {} },
        basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 36))

    //block 160
    await mustPass(basset.finish(a))

    await mustPass(basset.update_global_index(a))

    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 14))

    await mustPass(basset.update_global_index(a))

    await mustPass(basset.bond(c, 10, validators[2].validator_address))

    await mustPass(basset.bond(a, 10, validators[0].validator_address))

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

    //block 68 - 89
    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 22))

    // block 90
    await mustPass(emptyBlockWithFixedGas(lcd, gasStation))

    //block 91 - 119
    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 29))

    //block 120
    await mustPass(basset.finish(a))

    //block 121
    await mustPass(basset.bond(a, 10000000, validators[2].validator_address))

    //block 122
    await mustPass(basset.bond(a, 10000000, validators[3].validator_address))

    //block 123
    await mustPass(basset.send_cw20_token(
        a,
        15000000,
        { unbond: {} },
        basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    //block 124
    await mustPass(basset.send_cw20_token(
        a,
        15000000,
        { unbond: {} },
        basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    //block 125 - 160
    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 36))

    //block 160  "exchange_rate": "0.980440647482032022",
    await mustPass(basset.finish(a))

    //block 121
    await mustPass(basset.bond(a, 10000000, validators[2].validator_address))

    //block 122
    await mustPass(basset.bond(a, 10000000, validators[3].validator_address))

    //block 123
    await mustPass(basset.send_cw20_token(
        a,
        10000000,
        { unbond: {} },
        basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    //block 124
    await mustPass(basset.send_cw20_token(
        a,
        10000000,
        { unbond: {} },
        basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    await mustPass(basset.send_cw20_token(
        a,
        10,
        { unbond: {} },
        basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    //block 125 - 160
    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 36))

    await mustPass(basset.send_cw20_token(
        a,
        10,
        { unbond: {} },
        basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 36))

    //block 160
    await mustPass(basset.finish(a))

    await mustPass(basset.update_global_index(a))

    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 14))

    await mustPass(basset.update_global_index(a))

    await mustPass(basset.bond(c, 10, validators[2].validator_address))

    await mustPass(basset.bond(a, 10, validators[0].validator_address))

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

    //block 68 - 89
    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 22))

    // block 90
    await mustPass(emptyBlockWithFixedGas(lcd, gasStation))

    //block 91 - 119
    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 29))

    //block 120
    await mustPass(basset.finish(a))

    //block 121
    await mustPass(basset.bond(a, 10000000, validators[2].validator_address))

    //block 122
    await mustPass(basset.bond(a, 10000000, validators[3].validator_address))

    //block 123
    await mustPass(basset.send_cw20_token(
        a,
        15000000,
        { unbond: {} },
        basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    //block 124
    await mustPass(basset.send_cw20_token(
        a,
        15000000,
        { unbond: {} },
        basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    //block 125 - 160
    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 36))

    //block 160  "exchange_rate": "0.980440647482032022",
    await mustPass(basset.finish(a))

    //block 121
    await mustPass(basset.bond(a, 10000000, validators[2].validator_address))

    //block 122
    await mustPass(basset.bond(a, 10000000, validators[3].validator_address))

    //block 123
    await mustPass(basset.send_cw20_token(
        a,
        10000000,
        { unbond: {} },
        basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    //block 124
    await mustPass(basset.send_cw20_token(
        a,
        10000000,
        { unbond: {} },
        basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    await mustPass(basset.send_cw20_token(
        a,
        10,
        { unbond: {} },
        basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    //block 125 - 160
    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 36))

    await mustPass(basset.send_cw20_token(
        a,
        10,
        { unbond: {} },
        basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 36))

    //block 160
    await mustPass(basset.finish(a))

    await mustPass(basset.update_global_index(a))

    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 14))

    await mustPass(basset.update_global_index(a))

    await mustPass(basset.bond(c, 10, validators[2].validator_address))

    await mustPass(basset.bond(a, 10, validators[0].validator_address))

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

    //block 68 - 89
    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 22))

    // block 90
    await mustPass(emptyBlockWithFixedGas(lcd, gasStation))

    //block 91 - 119
    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 29))

    //block 120
    await mustPass(basset.finish(a))

    //block 121
    await mustPass(basset.bond(a, 10000000, validators[2].validator_address))

    //block 122
    await mustPass(basset.bond(a, 10000000, validators[3].validator_address))

    //block 123
    await mustPass(basset.send_cw20_token(
        a,
        15000000,
        { unbond: {} },
        basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    //block 124
    await mustPass(basset.send_cw20_token(
        a,
        15000000,
        { unbond: {} },
        basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    //block 125 - 160
    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 36))

    //block 160  "exchange_rate": "0.980440647482032022",
    await mustPass(basset.finish(a))

    //block 121
    await mustPass(basset.bond(a, 10000000, validators[2].validator_address))

    //block 122
    await mustPass(basset.bond(a, 10000000, validators[3].validator_address))

    //block 123
    await mustPass(basset.send_cw20_token(
        a,
        10000000,
        { unbond: {} },
        basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    //block 124
    await mustPass(basset.send_cw20_token(
        a,
        10000000,
        { unbond: {} },
        basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    await mustPass(basset.send_cw20_token(
        a,
        10,
        { unbond: {} },
        basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    //block 125 - 160
    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 36))

    await mustPass(basset.send_cw20_token(
        a,
        10,
        { unbond: {} },
        basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 36))

    //block 160
    await mustPass(basset.finish(a))

    await mustPass(basset.update_global_index(a))

    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 14))

    await mustPass(basset.update_global_index(a))

    await mustPass(basset.bond(c, 10, validators[2].validator_address))

    await mustPass(basset.bond(a, 10, validators[0].validator_address))

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

    //block 68 - 89
    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 22))

    // block 90
    await mustPass(emptyBlockWithFixedGas(lcd, gasStation))

    //block 91 - 119
    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 29))

    //block 120
    await mustPass(basset.finish(a))

    //block 121
    await mustPass(basset.bond(a, 10000000, validators[2].validator_address))

    //block 122
    await mustPass(basset.bond(a, 10000000, validators[3].validator_address))

    //block 123
    await mustPass(basset.send_cw20_token(
        a,
        15000000,
        { unbond: {} },
        basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    //block 124
    await mustPass(basset.send_cw20_token(
        a,
        15000000,
        { unbond: {} },
        basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    //block 125 - 160
    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 36))

    //block 160  "exchange_rate": "0.980440647482032022",
    await mustPass(basset.finish(a))

    //block 121
    await mustPass(basset.bond(a, 10000000, validators[2].validator_address))

    //block 122
    await mustPass(basset.bond(a, 10000000, validators[3].validator_address))

    //block 123
    await mustPass(basset.send_cw20_token(
        a,
        10000000,
        { unbond: {} },
        basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    //block 124
    await mustPass(basset.send_cw20_token(
        a,
        10000000,
        { unbond: {} },
        basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    await mustPass(basset.send_cw20_token(
        a,
        10,
        { unbond: {} },
        basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    //block 125 - 160
    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 36))

    await mustPass(basset.send_cw20_token(
        a,
        10,
        { unbond: {} },
        basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 36))

    //block 160
    await mustPass(basset.finish(a))

    await mustPass(basset.update_global_index(a))

    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 14))

    await mustPass(basset.update_global_index(a))

    await mustPass(basset.bond(c, 10, validators[2].validator_address))

    await mustPass(basset.bond(a, 10, validators[0].validator_address))

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

    //block 68 - 89
    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 22))

    // block 90
    await mustPass(emptyBlockWithFixedGas(lcd, gasStation))

    //block 91 - 119
    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 29))

    //block 120
    await mustPass(basset.finish(a))

    //block 121
    await mustPass(basset.bond(a, 10000000, validators[2].validator_address))

    //block 122
    await mustPass(basset.bond(a, 10000000, validators[3].validator_address))

    //block 123
    await mustPass(basset.send_cw20_token(
        a,
        15000000,
        { unbond: {} },
        basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    //block 124
    await mustPass(basset.send_cw20_token(
        a,
        15000000,
        { unbond: {} },
        basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    //block 125 - 160
    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 36))

    //block 160  "exchange_rate": "0.980440647482032022",
    await mustPass(basset.finish(a))

    //block 121
    await mustPass(basset.bond(a, 10000000, validators[2].validator_address))

    //block 122
    await mustPass(basset.bond(a, 10000000, validators[3].validator_address))

    //block 123
    await mustPass(basset.send_cw20_token(
        a,
        10000000,
        { unbond: {} },
        basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    //block 124
    await mustPass(basset.send_cw20_token(
        a,
        10000000,
        { unbond: {} },
        basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    await mustPass(basset.send_cw20_token(
        a,
        10,
        { unbond: {} },
        basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    //block 125 - 160
    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 36))

    await mustPass(basset.send_cw20_token(
        a,
        10,
        { unbond: {} },
        basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 36))

    //block 160
    await mustPass(basset.finish(a))

    await mustPass(basset.update_global_index(a))

    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 14))

    await mustPass(basset.update_global_index(a))

    await mustPass(basset.bond(c, 10, validators[2].validator_address))

    await mustPass(basset.bond(a, 10, validators[0].validator_address))

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

    //block 68 - 89
    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 22))

    // block 90
    await mustPass(emptyBlockWithFixedGas(lcd, gasStation))

    //block 91 - 119
    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 29))

    //block 120
    await mustPass(basset.finish(a))

    //block 121
    await mustPass(basset.bond(a, 10000000, validators[2].validator_address))

    //block 122
    await mustPass(basset.bond(a, 10000000, validators[3].validator_address))

    //block 123
    await mustPass(basset.send_cw20_token(
        a,
        15000000,
        { unbond: {} },
        basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    //block 124
    await mustPass(basset.send_cw20_token(
        a,
        15000000,
        { unbond: {} },
        basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    //block 125 - 160
    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 36))

    //block 160  "exchange_rate": "0.980440647482032022",
    await mustPass(basset.finish(a))

    //block 121
    await mustPass(basset.bond(a, 10000000, validators[2].validator_address))

    //block 122
    await mustPass(basset.bond(a, 10000000, validators[3].validator_address))

    //block 123
    await mustPass(basset.send_cw20_token(
        a,
        10000000,
        { unbond: {} },
        basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    //block 124
    await mustPass(basset.send_cw20_token(
        a,
        10000000,
        { unbond: {} },
        basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    await mustPass(basset.send_cw20_token(
        a,
        10,
        { unbond: {} },
        basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    //block 125 - 160
    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 36))

    await mustPass(basset.send_cw20_token(
        a,
        10,
        { unbond: {} },
        basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 36))

    //block 160
    await mustPass(basset.finish(a))

    await mustPass(basset.update_global_index(a))

    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 14))

    await mustPass(basset.update_global_index(a))

    await mustPass(basset.bond(c, 10, validators[2].validator_address))


}

main()
    .then(() => console.log('done'))
    .then(async () => {
        console.log("saving state...")
        fs.writeFileSync("mulval_actions.json", JSON.stringify(getRecord(), null, 2))
        fs.writeFileSync("mulval_state.json", JSON.stringify(await mantleState.getState(), null, 2))
    })
    .catch(console.log)