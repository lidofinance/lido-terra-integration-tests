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


    ///////////////// scenario 시작 ////////////////////

    // await testkit.inject(validators[0].validator_address) -> 아무 Tx 없이 지나가는 경우의 테스팅

    await mustPass(anchor.bAsset.register_validator(ownerWallet, validators[0].validator_address))
    //erase these
    await mustPass(anchor.bAsset.register_validator(ownerWallet, validators[1].validator_address))
    await mustPass(anchor.bAsset.register_validator(ownerWallet, validators[2].validator_address))
    await mustPass(anchor.bAsset.register_validator(ownerWallet, validators[3].validator_address))

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

    //block 32 - 34
    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 3))

    //success test
    //35
    await mustPass(basset.bond(a, 20000000000000, validators[0].validator_address))
    //36
    await mustPass(moneyMarket.liquidation_submit_bid(c, basset.contractInfo["anchor_basset_token"].contractAddress, "0.2", "5000000uusd"))
    //37
    await mustPass(moneyMarket.liquidation_retract_bid(c, basset.contractInfo["anchor_basset_token"].contractAddress, "1000000"))
    //38
    await mustPass(moneyMarket.liquidation_retract_bid(c, basset.contractInfo["anchor_basset_token"].contractAddress))
    //39
    await mustPass(moneyMarket.liquidation_submit_bid(c, basset.contractInfo["anchor_basset_token"].contractAddress, "0.2", "5000000uusd"))
    //40
    await mustPass(basset.send_cw20_token(a, 1000000, {
        execute_bid: {
            liquidator: c.key.accAddress,
            repay_addr: a.key.accAddress,
            fee_addr: a.key.accAddress

        }
    }, moneyMarket.contractInfo["moneymarket_liquidation"].contractAddress))

    //fail test
    //41 
    await mustFail(moneyMarket.liquidation_submit_bid(c, basset.contractInfo["anchor_basset_token"].contractAddress, "0.2", "2000000ukrw"))
    //42
    await mustFail(moneyMarket.liquidation_retract_bid(c, basset.contractInfo["anchor_basset_token"].contractAddress, "1000000"))
    //43
    await mustPass(moneyMarket.liquidation_retract_bid(c, basset.contractInfo["anchor_basset_token"].contractAddress))
    //44
    await mustPass(moneyMarket.liquidation_submit_bid(c, basset.contractInfo["anchor_basset_token"].contractAddress, "0.2", "3000000uusd"))
    //45
    await mustFail(basset.send_cw20_token(a, 1000000, {
        execute_bid: {
            liquidator: b.key.accAddress,
            repay_addr: a.key.accAddress,
            fee_addr: a.key.accAddress
        }
    }, moneyMarket.contractInfo["moneymarket_liquidation"].contractAddress))

    //allowance execute bid test
    //46
    await mustPass(basset.increase_allowance(a, b.key.accAddress, 5000000, 55))
    //47
    await mustPass(basset.send_from_cw20_token(b, a, 1000000, {
        execute_bid: {
            liquidator: c.key.accAddress,
            repay_addr: b.key.accAddress,
            fee_addr: b.key.accAddress
        }
    }, moneyMarket.contractInfo["moneymarket_liquidation"].contractAddress))
    //48-57
    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 10))
    //58 should fail as allowance expired
    await mustFail(basset.send_from_cw20_token(b, a, 1000000, {
        execute_bid: {
            liquidator: c.key.accAddress,
            repay_addr: a.key.accAddress,
            fee_addr: a.key.accAddress
        }
    }, moneyMarket.contractInfo["moneymarket_liquidation"].contractAddress))

    //change oracle price and test execute bid
    //change oracle price to 0.5(previously 1)
    //60
    await testkit.clearAutomaticTx(previousOracleFeed.id)
    const previousOracleFeed2 = await testkit.registerAutomaticTx(configureMMOracle(
        owner,
        anchor.moneyMarket.contractInfo["moneymarket_oracle"].contractAddress,
        anchor.bAsset.contractInfo["anchor_basset_token"].contractAddress,
        0.5
    ))
    //need to pass at least one block
    //61
    await mustPass(emptyBlockWithFixedGas(lcd, gasStation))

    //allowance testing
    //62
    await mustPass(basset.increase_allowance(a, b.key.accAddress, 5000000, 90))
    //63
    await mustPass(basset.send_from_cw20_token(b, a, 1000000, {
        execute_bid: {
            liquidator: c.key.accAddress,
            repay_addr: a.key.accAddress,
            fee_addr: a.key.accAddress
        }
    }, moneyMarket.contractInfo["moneymarket_liquidation"].contractAddress))
    // normal testing
    //64
    await mustPass(basset.send_cw20_token(a, 1000000, {
        execute_bid: {
            liquidator: c.key.accAddress,
            repay_addr: a.key.accAddress,
            fee_addr: a.key.accAddress
        }
    }, moneyMarket.contractInfo["moneymarket_liquidation"].contractAddress))
}

main()
    .then(() => console.log('done'))
    .then(async () => {
        console.log("saving state...")
        fs.writeFileSync("liquidationpricechange_actions.json", JSON.stringify(getRecord(), null, 2))
        fs.writeFileSync("liquidationpricechange_state.json", JSON.stringify(await mantleState.getState(), null, 2))
    })
    .catch(console.log)