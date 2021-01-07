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

    // no allowance fail test
    //32
    await mustFail(basset.transfer_from_cw20_token(b, a, c, 1000))
    //33
    await mustFail(basset.send_from_cw20_token(b, a, 9999, { unbond: {} }, basset.contractInfo["anchor_basset_hub"].contractAddress))
    //34
    await mustFail(basset.burn_from_cw20_token(b, a, 1))

    // not enough allowance amount fail test
    //35
    await mustPass(basset.increase_allowance(a, b.key.accAddress, 1000, 50))
    //36
    await mustFail(basset.transfer_from_cw20_token(b, a, c, 1001))
    //37
    await mustFail(basset.send_from_cw20_token(b, a, 1001, { unbond: {} }, basset.contractInfo["anchor_basset_hub"].contractAddress))
    //38
    await mustFail(basset.burn_from_cw20_token(b, a, 1001))

    // other account allowance test
    //39
    await mustPass(basset.increase_allowance(c, a.key.accAddress, 100000000, 100))
    //40
    await mustFail(basset.transfer_from_cw20_token(b, c, a, 100))
    //41
    await mustFail(basset.send_from_cw20_token(b, c, 100, { unbond: {} }, basset.contractInfo["anchor_basset_hub"].contractAddress))
    //42
    await mustFail(basset.burn_from_cw20_token(b, c, 100))


    // expired fail test
    //43 - 52
    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 10))
    //53
    await mustFail(basset.transfer_from_cw20_token(b, a, c, 100))
    //54
    await mustFail(basset.send_from_cw20_token(b, a, 100, { unbond: {} }, basset.contractInfo["anchor_basset_hub"].contractAddress))
    //55
    await mustFail(basset.burn_from_cw20_token(b, a, 100))



    //basic cases end//

    //allowance test
    //owner - wallet have bLuna, spender - user get allowance
    //42
    // await mustPass(basset.increase_allowance(a, b.key.accAddress, 100000000000000, 100))
    // await mustPass(basset.burn_from_cw20_token(b, a, 100000))
    // await mustPass(basset.transfer_from_cw20_token(b, a, c, 77777))
    // //43
    // //await mustPass(basset.transfer_from_cw20_token(b, a, c, 1))
    // //44
    // //await mustPass(basset.burn_from_cw20_token(b, a, 1))
    // //45

    // await mustPass(basset.send_from_cw20_token(b, a, 9999, { unbond: {} }, basset.contractInfo["anchor_basset_hub"].contractAddress))
    // //46
    // //erase these
    // await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 37))
    // await mustPass(basset.finish(b))

    // await mustPass(basset.decrease_allowance(a, b.key.accAddress, 333, 777))
    // //block 47
    // //await mustPass(basset.bank_send(a, basset.contractInfo["anchor_basset_hub"].contractAddress, new Coins("10000000000000uluna")))
    // //block 48
    // await mustPass(emptyBlockWithFixedGas(lcd, gasStation))

    //allowance testing
    //await musFail

}

main()
    .then(() => console.log('done'))
    .then(async () => {
        console.log("saving state...")
        fs.writeFileSync("cw20fail_actions.json", JSON.stringify(getRecord(), null, 2))
        fs.writeFileSync("cw20fail_state.json", JSON.stringify(await mantleState.getState(), null, 2))
    })
    .catch(console.log)