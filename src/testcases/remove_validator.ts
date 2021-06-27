import {
    Coin,
    Coins,
    Dec,
    Int,
    MnemonicKey,
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
import Anchor from "../helper/spawn";
import { MantleState } from "../mantle-querier/MantleState";
import { Testkit } from "../testkit/testkit";
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

    const validatorAKey = new MnemonicKey();
    const validatorBKey = new MnemonicKey();
    const validatorCKey = new MnemonicKey();
    const validatorDKey = new MnemonicKey();
    const gasStation = new MnemonicKey();

    const response = await testkit.init({
        genesis: genesis,
        accounts: [
            Testkit.walletToAccountRequest("a", aKey),
            Testkit.walletToAccountRequest("b", bKey),
            Testkit.walletToAccountRequest("c", cKey),
            Testkit.walletToAccountRequest("valA", validatorAKey),
            Testkit.walletToAccountRequest("valB", validatorBKey),
            Testkit.walletToAccountRequest("valC", validatorCKey),
            Testkit.walletToAccountRequest("valD", validatorDKey),
            Testkit.walletToAccountRequest("owner", owner),
            Testkit.walletToAccountRequest("gasStation", gasStation),
        ],
        validators: [
            Testkit.validatorInitRequest(
                "valA",
                new Coin("uluna", new Int(1000000000000)),
                new Validator.CommissionRates(new Dec(0), new Dec(1), new Dec(0))
            ),
            Testkit.validatorInitRequest(
                "valB",
                new Coin("uluna", new Int(1000000000000)),
                new Validator.CommissionRates(new Dec(0), new Dec(1), new Dec(0))
            ),
            Testkit.validatorInitRequest(
                "valC",
                new Coin("uluna", new Int(1000000000000)),
                new Validator.CommissionRates(new Dec(0), new Dec(1), new Dec(0))
            ),
            Testkit.validatorInitRequest(
                "valD",
                new Coin("uluna", new Int(1000000000000)),
                new Validator.CommissionRates(new Dec(0), new Dec(1), new Dec(0))
            ),
        ],
        auto_inject: {
            validator_rounds: ["valB", "valC", "valD", "valA"],
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
    const validatorNames = ["valA", "valB", "valC", "valD"];
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

    const valAWallet = new Wallet(lcd, validatorAKey);

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
        validators,
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

    // Auth test, validators_registry is only allowed to send redelegate_proxy message.
    await mustFail(basset.redelegate_proxy(ownerWallet, validators[0].validator_address, validators[1].validator_address, 100))

    await mustPass(basset.bond(ownerWallet, 20000000000000))

    await mustPass(basset.remove_validator(ownerWallet, validators[0].validator_address))
}

main()
    .then(() => console.log("done"))
    .then(async () => {
        console.log("saving state...");
        fs.writeFileSync(
            "remove_validator.json",
            JSON.stringify(getRecord(), null, 2)
        );
        fs.writeFileSync(
            "remove_validator.json",
            JSON.stringify(await mantleState.getState(), null, 2)
        );
    })
    .catch(console.log);
