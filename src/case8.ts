import { Coin, Coins, Dec, Int, MnemonicKey, MsgExecuteContract, MsgSend, StdFee, Validator, Wallet } from "@terra-money/terra.js";
import * as path from 'path'
import * as fs from 'fs'
import { mustFail, mustPass } from "../helper/flow/must";
import { getRecord } from "../helper/flow/record";
import { registerChainOracleVote } from "../helper/oracle/chain-oracle";
import Anchor, { Asset } from "../helper/spawn";
import { MantleState } from "../mantle-querier/MantleState";
import { Testkit } from '../testkit/testkit'
import { execute, send_transaction } from "../helper/flow/execution";
import { emptyBlockWithFixedGas } from "../helper/flow/gas-station";

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
            Testkit.validatorInitRequest('valA', new Coin('uluna', new Int(1000000)), new Validator.CommissionRates(new Dec(0), new Dec(1), new Dec(0))),
            Testkit.validatorInitRequest('valB', new Coin('uluna', new Int(1000000)), new Validator.CommissionRates(new Dec(0), new Dec(1), new Dec(0))),
            Testkit.validatorInitRequest('valC', new Coin('uluna', new Int(1000000)), new Validator.CommissionRates(new Dec(0), new Dec(1), new Dec(0))),
            Testkit.validatorInitRequest('valD', new Coin('uluna', new Int(1000000)), new Validator.CommissionRates(new Dec(0), new Dec(1), new Dec(0))),
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
    testkit.inject(validators[0].validator_address)

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
        fee: new StdFee(10000000, "100000uusd")
    }))

    await anchor.bAsset.register_validator(ownerWallet, validators[0].validator_address)

    const basset = anchor.bAsset;
    const moneyMarket = anchor.moneyMarket;
    const terraswap = anchor.terraswap;


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

    const mantleState = new MantleState(
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

    // block 11
    await mustPass(basset.bond(a, 20000000, validators[0].validator_address))

    await mustPass(emptyBlockWithFixedGas(lcd, gasStation))

    //block 13
    //TODO: still generate fee

    //block15
    const asset1 = new Asset(
        basset.contractInfo["anchor_basset_token"].contractAddress,
        "uusd",
        "100000"
    );
    const asset2 = new Asset(
        basset.contractInfo["anchor_basset_token"].contractAddress,
        "uusd",
        "100000"
    );
    // TODO: still generate fee

    //block19
    await mustPass(basset.bond(a, 20000000, validators[0].validator_address))

    //block 29
    await mustPass(basset.transfer_cw20_token(a, b, 10))

    //block 30
    // await mustPass(basset.update_global_index(a);)

    //block 30
    await terraswap.send_cw20_token(
        a,
        20000000,
        { redeem_stable: {} },
        moneyMarket.contractInfo["moneymarket_market"].contractAddress
    );

    //block 40
    await mustPass(basset.send_cw20_token(
        a,
        1,
        { unbond: {} },
        basset.contractInfo["anchor_basset_hub"].contractAddress
    ));


    await mustPass(basset.bond(a, 500, validators[0].validator_address))
    await mustPass(basset.bond(a, 500, validators[0].validator_address))
    await mustPass(basset.bond(a, 500, validators[0].validator_address))
    await mustPass(basset.bond(a, 500, validators[0].validator_address))
    await mustPass(basset.bond(a, 500, validators[0].validator_address))
    await mustPass(basset.bond(a, 500, validators[0].validator_address))
    await mustPass(basset.bond(a, 500, validators[0].validator_address))
    await mustPass(basset.bond(a, 500, validators[0].validator_address))
    await mustPass(basset.bond(a, 500, validators[0].validator_address))
    await mustPass(basset.bond(a, 500, validators[0].validator_address))
    await mustPass(basset.bond(a, 500, validators[0].validator_address))
    await mustPass(basset.bond(a, 500, validators[0].validator_address))
    await mustPass(basset.bond(a, 500, validators[0].validator_address))
    await mustPass(basset.bond(a, 500, validators[0].validator_address))
    await mustPass(basset.bond(a, 500, validators[0].validator_address))
    await mustPass(basset.bond(a, 500, validators[0].validator_address))
    await mustPass(basset.bond(a, 500, validators[0].validator_address))
    await mustPass(basset.bond(a, 500, validators[0].validator_address))
    await mustPass(basset.bond(a, 500, validators[0].validator_address))
    await mustPass(basset.bond(a, 500, validators[0].validator_address))
    await mustPass(basset.bond(a, 500, validators[0].validator_address))
    await mustPass(basset.bond(a, 500, validators[0].validator_address))
    await mustPass(basset.bond(a, 500, validators[0].validator_address))
    await mustPass(basset.bond(a, 500, validators[0].validator_address))
    await mustPass(basset.bond(a, 500, validators[0].validator_address))
    await mustPass(basset.bond(a, 500, validators[0].validator_address))
    await mustPass(basset.bond(a, 500, validators[0].validator_address))
    await mustPass(basset.bond(a, 500, validators[0].validator_address))
    await mustPass(basset.bond(a, 500, validators[0].validator_address))
    await mustPass(basset.bond(a, 500, validators[0].validator_address))
    await mustPass(basset.bond(a, 500, validators[0].validator_address))
    await mustPass(basset.bond(a, 500, validators[0].validator_address))
    await mustPass(basset.bond(a, 500, validators[0].validator_address))
    await mustPass(basset.bond(a, 500, validators[0].validator_address))
    await mustPass(basset.bond(a, 500, validators[0].validator_address))
    await mustPass(basset.bond(a, 500, validators[0].validator_address))
    await mustPass(basset.bond(a, 500, validators[0].validator_address))
    await mustPass(basset.bond(a, 500, validators[0].validator_address))
    await mustPass(basset.bond(a, 500, validators[0].validator_address))
    await mustPass(basset.bond(a, 500, validators[0].validator_address))
    await mustPass(basset.bond(a, 500, validators[0].validator_address))
    await mustPass(basset.bond(a, 500, validators[0].validator_address))
    await mustPass(basset.bond(a, 500, validators[0].validator_address))
    await mustPass(basset.bond(a, 500, validators[0].validator_address))
    await mustPass(basset.bond(a, 500, validators[0].validator_address))
    await mustPass(basset.bond(a, 500, validators[0].validator_address))
    await mustPass(basset.bond(a, 500, validators[0].validator_address))
    await mustPass(basset.bond(a, 500, validators[0].validator_address))
    await mustPass(basset.bond(a, 500, validators[0].validator_address))
    await mustPass(basset.bond(a, 500, validators[0].validator_address))
    await mustPass(basset.bond(a, 500, validators[0].validator_address))
    await mustPass(basset.bond(a, 500, validators[0].validator_address))
    await mustPass(basset.bond(a, 500, validators[0].validator_address))
    await mustPass(basset.bond(a, 500, validators[0].validator_address))

    //block 80
    await mustPass(basset.finish(a))

    //block 81
    await mustPass(moneyMarket.deposit_stable(b, 1000000))

    //block 82
    const marketAddr = moneyMarket.contractInfo["moneymarket_market"].contractAddress;
    await mustPass(moneyMarket.send_cw20_token(
        b,
        30000,
        { redeem_stable: {} },
        marketAddr
    ));

    //block 83
    const custody = moneyMarket.contractInfo["moneymarket_custody"].contractAddress;

    await mustPass(basset.send_cw20_token(
        a,
        3000000,
        { deposit_collateral: {} },
        custody
    ))

    //block 84
    await mustPass(moneyMarket.overseer_lock_collateral(a, [[basset.contractInfo["anchor_basset_token"].contractAddress, "2000000"]]))

    //block 85; should fail
    await mustFail(moneyMarket.overseer_lock_collateral(a, [[basset.contractInfo["anchor_basset_token"].contractAddress, "1500000"]]))

    //block 86
    await mustFail(moneyMarket.borrow_stable(a, 1500000, undefined))

    //block 87
    await mustPass(moneyMarket.borrow_stable(a, 500000, undefined))

    //block 88
    await mustPass(basset.update_global_index(a))

    // await mustFail(moneyMarket.execute_epoch_operations(a))

    await mustPass(moneyMarket.send_cw20_token(
        b,
        20000,
        { redeem_stable: {} },
        marketAddr
    ));

    //block 89
    await mustPass(moneyMarket.deposit_stable(a, 1000000))

    //block 90
    await mustPass(moneyMarket.overseer_unlock_collateral(a, [[basset.contractInfo["anchor_basset_token"].contractAddress, "10000"]]))

    //block 91
    await mustFail(moneyMarket.overseer_unlock_collateral(a, [[basset.contractInfo["anchor_basset_token"].contractAddress, "1000000"]]))

    //block 92
    await mustPass(moneyMarket.withdraw_collateral(a, 150000))

    //block 93
    await mustFail(moneyMarket.withdraw_collateral(a, 990000))

    //block 94
    // await mustPass(basset.update_global_index(a);)

    //block 111
    // await mustPass(moneyMarket.execute_epoch_operations(a);)

    //block 112
    await mustPass(moneyMarket.repay_stable(a, 400000))

    //block 113
    // await mustPass(basset.update_global_index(a);)

    //block 114
    // await mustPass(moneyMarket.execute_epoch_operations(a);)

    // //block 115
    // await mustPass(moneyMarket.overseer_unlock_collateral(a, [[a, 840000]]);)

    // //block 116
    // await mustPass(moneyMarket.liquidation(c, a.key.accAddress);)

    // //block 118
    // await mustPass(moneyMarket.liquidation(b, a.key.accAddress);)

    // save action records and gas
    fs.writeFileSync("actions.json", JSON.stringify(getRecord(), null, 2))
    fs.writeFileSync("mantleState.json", JSON.stringify(await mantleState.getState(), null, 2))
}

async function delay(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch(console.log)