import {
    Coin,
    Coins,
    Dec,
    Int,
    MnemonicKey,
    MsgExecuteContract,
    MsgSend,
    StdFee,
    Validator,
    Wallet,
} from "@terra-money/terra.js";
import * as path from "path";
import * as fs from "fs";
import { mustFail, mustPass } from "../helper/flow/must";
import { getRecord } from "../helper/flow/record";
import {
    registerChainOracleVote,
    registerChainOraclePrevote,
} from "../helper/oracle/chain-oracle";
import Anchor, { Asset } from "../helper/spawn";
import { MantleState } from "../mantle-querier/MantleState";
import { Testkit } from "../testkit/testkit";
import { execute, send_transaction } from "../helper/flow/execution";
import { emptyBlockWithFixedGas } from "../helper/flow/gas-station";
import { repeat } from "../helper/flow/repeat";
import { unjail } from "../helper/validator-operation/unjail";
import { gql } from "graphql-request";
import { configureMMOracle } from "../helper/oracle/mm-oracle";
import { setTestParams } from "../parameters/contract-tests-parameteres";

let mantleState: MantleState;

async function main() {
    const testkit = new Testkit("http://localhost:11317");
    const genesis = require("../testkit/genesis.json");

    const aKey = new MnemonicKey();
    const bKey = new MnemonicKey();
    const cKey = new MnemonicKey();
    const owner = new MnemonicKey();

    const valKeys = new Array(26).fill(true).map(() => new MnemonicKey())
    const validatorAKey = new MnemonicKey();
    const validatorBKey = new MnemonicKey();
    const validatorCKey = new MnemonicKey();
    const validatorDKey = new MnemonicKey();
    const gasStation = new MnemonicKey();

    const response = await testkit.init({
        genesis: genesis,
        accounts: [
            ...valKeys.map((k, i) => Testkit.walletToAccountRequest(`val${i}`, k)),
            Testkit.walletToAccountRequest("owner", owner),
            Testkit.walletToAccountRequest("gasStation", gasStation),
            Testkit.walletToAccountRequest("a", aKey),
            Testkit.walletToAccountRequest("b", bKey),
            Testkit.walletToAccountRequest("c", cKey),
        ],
        validators: valKeys.map((_, i) => Testkit.validatorInitRequest(
            `val${i}`,
            new Coin("uluna", new Int(1000000000000)),
            new Validator.CommissionRates(new Dec(0), new Dec(1), new Dec(0))
        )),
        auto_inject: {
            validator_rounds: valKeys.map((_, i) => `val${(i + 1) % 26}`)
        },
        auto_tx: [
            // fee generator
            Testkit.automaticTxRequest({
                accountName: "gasStation",
                period: 1,
                startAt: 2,
                msgs: [
                    new MsgSend(
                        gasStation.accAddress,
                        gasStation.accAddress,
                        new Coins([new Coin("uusd", 1)])
                    ),
                ],
                fee: new StdFee(10000000, "1000000uusd"),
            }),
        ],
    });

    console.log(testkit.deriveMantle())

    const validators = response.validators;
    const lcd = testkit.deriveLCD();

    // initialize genesis block
    await testkit.inject();

    // register oracle votes
    // const validatorNames = ["valA", "valB", "valC", "valD", "valE", "valF", "valG", "valH", "valI", "valJ", "valK", "valL", "valM", "valN", "valO", "valP", "valQ", "valR", "valS", "valT", "valU", "valV", "valW", "valX", "valY", "valZ"];
    // register votes
    const initialVotes = await Promise.all(
        validators.map(async (validator) =>
            testkit.registerAutomaticTx(
                registerChainOracleVote(
                    validator.account_name,
                    validator.Msg.delegator_address,
                    validator.Msg.validator_address,
                    3
                )
            )
        )
    );

    // register prevotes
    const initialPrevotes = await Promise.all(
        validators.map(async (validator) =>
            testkit.registerAutomaticTx(
                registerChainOraclePrevote(
                    validator.account_name,
                    validator.Msg.delegator_address,
                    validator.Msg.validator_address,
                    2
                )
            )
        )
    );

    const a = new Wallet(lcd, aKey);
    const b = new Wallet(lcd, bKey);
    const c = new Wallet(lcd, cKey);

    const valAWallet = new Wallet(lcd, valKeys[0]);

    // store & instantiate contracts
    const ownerWallet = new Wallet(lcd, owner);
    const anchor = new Anchor(ownerWallet);
    await anchor.store_contracts(
        path.resolve(__dirname, "../../anchor-bAsset-contracts/artifacts"),
        path.resolve(__dirname, "../../money-market-contracts/artifacts"),
        path.resolve(__dirname, "../../terraswap/artifacts"),
        path.resolve(__dirname, "../../anchor-token-contracts/artifacts")
    );

    const fixedFeeForInit = new StdFee(6000000, "2000000uusd");
    await anchor.instantiate(
        fixedFeeForInit,
        setTestParams(validators[0].validator_address, a.key.accAddress),
        [validators[0]]
    );

    // register oracle price feeder
    const previousOracleFeed = await testkit.registerAutomaticTx(
        configureMMOracle(
            owner,
            anchor.moneyMarket.contractInfo["moneymarket_oracle"].contractAddress,
            anchor.bAsset.contractInfo["anchor_basset_token"].contractAddress,
            1.0
        )
    );

    ///////////////// scenario 시작 ////////////////////

    // await testkit.inject(validators[0].validator_address) -> 아무 Tx 없이 지나가는 경우의 테스팅

    for (var i = 1; i < 25; i++) {
        await mustPass(
            anchor.bAsset.add_validator(
                ownerWallet,
                validators[i].validator_address
            )
        );
    }


    const basset = anchor.bAsset;
    const moneyMarket = anchor.moneyMarket;
    const terraswap = anchor.terraswap;
    const anc = anchor.ANC;
    ////////////////////////

    // create mantle state
    console.log({
        bLunaHub: basset.contractInfo["anchor_basset_hub"].contractAddress,
        bAssetToken: basset.contractInfo["anchor_basset_token"].contractAddress,
        bAssetReward: basset.contractInfo["anchor_basset_reward"].contractAddress,
        bAssetAirdrop:
            basset.contractInfo["anchor_airdrop_registry"].contractAddress,
        mmInterest:
            moneyMarket.contractInfo["moneymarket_interest_model"].contractAddress,
        mmOracle: moneyMarket.contractInfo["moneymarket_oracle"].contractAddress,
        mmMarket: moneyMarket.contractInfo["moneymarket_market"].contractAddress,
        mmOverseer:
            moneyMarket.contractInfo["moneymarket_overseer"].contractAddress,
        mmCustody:
            moneyMarket.contractInfo["moneymarket_custody_bluna"].contractAddress,
        mmLiquidation:
            moneyMarket.contractInfo["moneymarket_liquidation"].contractAddress,
        mmdistribution:
            moneyMarket.contractInfo["moneymarket_distribution_model"]
                .contractAddress,
        anchorToken: moneyMarket.contractInfo["anchorToken"].contractAddress,
        terraswapFactory:
            terraswap.contractInfo["terraswap_factory"].contractAddress,
        terraswapPair: "whateva",
        gov: anc.contractInfo["gov"].contractAddress,
        faucet: anc.contractInfo["faucet"].contractAddress,
        collector: anc.contractInfo["collector"].contractAddress,
        community: anc.contractInfo["community"].contractAddress,
        staking: anc.contractInfo["staking"].contractAddress,
        token: anc.contractInfo["token"].contractAddress,
        airdrop: anc.contractInfo["airdrop"].contractAddress,
    });

    mantleState = new MantleState(
        {
            bLunaHub: basset.contractInfo["anchor_basset_hub"].contractAddress,
            bAssetToken: basset.contractInfo["anchor_basset_token"].contractAddress,
            stLunaToken: basset.contractInfo["anchor_basset_token_stluna"].contractAddress,
            bAssetReward: basset.contractInfo["anchor_basset_reward"].contractAddress,
            bAssetAirdrop:
                basset.contractInfo["anchor_airdrop_registry"].contractAddress,
            mmInterest:
                moneyMarket.contractInfo["moneymarket_interest_model"].contractAddress,
            mmOracle: moneyMarket.contractInfo["moneymarket_oracle"].contractAddress,
            mmMarket: moneyMarket.contractInfo["moneymarket_market"].contractAddress,
            mmOverseer:
                moneyMarket.contractInfo["moneymarket_overseer"].contractAddress,
            mmCustody:
                moneyMarket.contractInfo["moneymarket_custody_bluna"].contractAddress,
            mmLiquidation:
                moneyMarket.contractInfo["moneymarket_liquidation"].contractAddress,
            mmdistribution:
                moneyMarket.contractInfo["moneymarket_distribution_model"]
                    .contractAddress,
            anchorToken: moneyMarket.contractInfo["anchorToken"].contractAddress,
            terraswapFactory:
                terraswap.contractInfo["terraswap_factory"].contractAddress,
            terraswapPair: "whateva",
            gov: anc.contractInfo["gov"].contractAddress,
            faucet: anc.contractInfo["faucet"].contractAddress,
            collector: anc.contractInfo["collector"].contractAddress,
            community: anc.contractInfo["community"].contractAddress,
            staking: anc.contractInfo["staking"].contractAddress,
            token: anc.contractInfo["token"].contractAddress,
            airdrop: anc.contractInfo["airdrop"].contractAddress,
        },
        [aKey.accAddress, bKey.accAddress, cKey.accAddress],
        response.validators.map((val) => val.validator_address),
        testkit.deriveMantle()
    );
    //block 67
    await mustPass(emptyBlockWithFixedGas(lcd, gasStation))

    //block 68
    await mustPass(emptyBlockWithFixedGas(lcd, gasStation))

    //block 81 - 85
    // deregister oracle vote and waste 5 blocks
    const prevotesToClear = initialPrevotes[0]
    const votesToClear = initialVotes[0]

    await testkit.clearAutomaticTx(prevotesToClear.id)
    await testkit.clearAutomaticTx(votesToClear.id)
    await repeat(5, async () => {
        await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 1))
    })

    //block 86 - 90
    // Oracle slashing happen at the block 89
    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 5))

    //block 91 unjail & revive oracle
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

    //block 92 - 94
    //bond
    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 3))
    for (var j = 0; j < 3; j++) {
        for (var i = 0; i < 25; i++) {
            await mustPass(basset.bond(a, 2000000))
        }
    }

    for (var j = 0; j < 3; j++) {
        for (var i = 0; i < 25; i++) {
            await mustPass(basset.bond(b, 2000000))
        }
    }

    for (var j = 0; j < 3; j++) {
        for (var i = 0; i < 25; i++) {
            await mustPass(basset.bond(c, 2000000))
        }
    }

    //block 95
    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 50))

    await mustPass(basset.update_global_index(a))

    for (var j = 0; j < 3; j++) {
        for (var i = 0; i < 25; i++) {
            await basset.send_cw20_token(
                basset.contractInfo["anchor_basset_token"].contractAddress,
                a,
                1000000,
                { unbond: {} },
                basset.contractInfo["anchor_basset_hub"].contractAddress
            )
        }
    }

    for (var j = 0; j < 3; j++) {
        for (var i = 0; i < 25; i++) {
            await basset.send_cw20_token(
                basset.contractInfo["anchor_basset_token"].contractAddress,
                b,
                1000000,
                { unbond: {} },
                basset.contractInfo["anchor_basset_hub"].contractAddress
            )
        }
    }

    for (var j = 0; j < 3; j++) {
        for (var i = 0; i < 25; i++) {
            await basset.send_cw20_token(
                basset.contractInfo["anchor_basset_token"].contractAddress,
                c,
                1000000,
                { unbond: {} },
                basset.contractInfo["anchor_basset_hub"].contractAddress
            )
        }
    }

    //block 99 - 159
    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 10))

    //block 160
    await mustPass(basset.finish(a))
    await mustPass(basset.finish(b))
    await mustPass(basset.finish(c))

    //block 170
    await mustPass(basset.update_global_index(a))

    for (var i = 0; i < 24; i++) {
        await mustPass(basset.remove_validator(ownerWallet, validators[i].validator_address))
        await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 40))
    }

    await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 10))
}

main()
    .then(() => console.log("done"))
    .then(async () => {
        console.log("saving state...");
        fs.writeFileSync(
            "mulvaltest_action.json",
            JSON.stringify(getRecord(), null, 2)
        );
        fs.writeFileSync(
            "mulvaltest_state.json",
            JSON.stringify(await mantleState.getState(), null, 2)
        );
    })
    .catch(console.log);
