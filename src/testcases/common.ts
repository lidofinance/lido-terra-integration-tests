import {AutomaticTxRequest, AutomaticTxResponse, Testkit, TestkitInit} from "../testkit/testkit";
import {Coin, Coins, Dec, Int, LCDClient, MnemonicKey, MsgSend, StdFee, Validator, Wallet} from "@terra-money/terra.js";
import Anchor from "../helper/spawn";
import AnchorbAsset from "../helper/basset_helper";
import MoneyMarket from "../helper/money_market_helper";
import TerraSwap from "../helper/terraswap_helper";
import AnchorToken from "../helper/anchor_token_helper";
import {registerChainOraclePrevote, registerChainOracleVote} from "../helper/oracle/chain-oracle";
import {setTestParams} from "../parameters/contract-tests-parameteres";
import {configureMMOracle} from "../helper/oracle/mm-oracle";
import {MantleState} from "../mantle-querier/MantleState";
import * as path from "path";
import {UnbondRequestsResponse} from "../helper/types/anchor_basset_hub/unbond_requests_response";
import AnchorbAssetQueryHelper from "../helper/basset_queryhelper";

export class TestState {
    testkit: Testkit
    keys: Record<string, MnemonicKey>
    validatorKeys: Record<string, MnemonicKey>
    validators: TestkitInit.Validator[]
    gasStation: MnemonicKey
    lcdClient: LCDClient
    wallets: Record<string, Wallet>
    anchor: Anchor
    basset: AnchorbAsset
    moneyMarket: MoneyMarket
    terraswap: TerraSwap
    anc: AnchorToken
    initialPrevotes: AutomaticTxResponse[]
    initialVotes: AutomaticTxResponse[]
    previousOracleFeed: AutomaticTxResponse


    constructor() {
        this.keys = {};
        this.validatorKeys = {};
        this.validators = [];
        this.wallets = {};
    }

    async getMantleState(): Promise<MantleState> {
        this.testkit = new Testkit("http://localhost:11317");
        const genesis = require("../testkit/genesis.json");

        this.keys.aKey = new MnemonicKey();
        this.keys.bKey = new MnemonicKey();
        this.keys.cKey = new MnemonicKey();
        this.keys.dKey = new MnemonicKey();
        this.keys.lidoKey = new MnemonicKey();
        this.keys.owner = new MnemonicKey();

        this.validatorKeys.validatorAKey = new MnemonicKey();
        this.validatorKeys.validatorBKey = new MnemonicKey();
        this.validatorKeys.validatorCKey = new MnemonicKey();
        this.validatorKeys.validatorDKey = new MnemonicKey();
        this.gasStation = new MnemonicKey();

        const response = await this.testkit.init({
            genesis: genesis,
            accounts: [
                Testkit.walletToAccountRequest("a", this.keys.aKey),
                Testkit.walletToAccountRequest("b", this.keys.bKey),
                Testkit.walletToAccountRequest("c", this.keys.cKey),
                Testkit.walletToAccountRequest("d", this.keys.dKey),
                Testkit.walletToAccountRequest("lido_fee", this.keys.lidoKey),
                Testkit.walletToAccountRequest("valA", this.validatorKeys.validatorAKey),
                Testkit.walletToAccountRequest("valB", this.validatorKeys.validatorBKey),
                Testkit.walletToAccountRequest("valC", this.validatorKeys.validatorCKey),
                Testkit.walletToAccountRequest("valD", this.validatorKeys.validatorDKey),
                Testkit.walletToAccountRequest("owner", this.keys.owner),
                Testkit.walletToAccountRequest("gasStation", this.gasStation),
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
                            this.gasStation.accAddress,
                            this.gasStation.accAddress,
                            new Coins([new Coin("uusd", 1)])
                        ),
                    ],
                    fee: new StdFee(10000000, "1000000uusd"),
                }),
            ],
        });

        console.log(this.testkit.deriveMantle())

        this.validators = response.validators;
        this.lcdClient = this.testkit.deriveLCD();

        // initialize genesis block
        await this.testkit.inject();

        // register oracle votes
        const validatorNames = ["valA", "valB", "valC", "valD"];
        // register votes
        this.initialVotes = await Promise.all(
            this.validators.map(async (validator) =>
                this.testkit.registerAutomaticTx(
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
        this.initialPrevotes = await Promise.all(
            this.validators.map(async (validator) =>
                this.testkit.registerAutomaticTx(
                    registerChainOraclePrevote(
                        validator.account_name,
                        validator.Msg.delegator_address,
                        validator.Msg.validator_address,
                        2
                    )
                )
            )
        );
        this.wallets.a = new Wallet(this.lcdClient, this.keys.aKey);
        this.wallets.b = new Wallet(this.lcdClient, this.keys.bKey);
        this.wallets.c = new Wallet(this.lcdClient, this.keys.cKey);

        this.wallets.valAWallet = new Wallet(this.lcdClient, this.validatorKeys.validatorAKey);

        this.wallets.lido_fee = new Wallet(this.lcdClient, this.keys.lidoKey);

        // store & instantiate contracts
        this.wallets.ownerWallet = new Wallet(this.lcdClient, this.keys.owner);
        this.anchor = new Anchor(this.wallets.ownerWallet);
        await this.anchor.store_contracts(
            path.resolve(__dirname, "../../anchor-bAsset-contracts/artifacts"),
            path.resolve(__dirname, "../../money-market-contracts/artifacts"),
            path.resolve(__dirname, "../../terraswap/artifacts"),
            path.resolve(__dirname, "../../anchor-token-contracts/artifacts")
        );

        const fixedFeeForInit = new StdFee(6000000, "2000000uusd");
        await this.anchor.instantiate(
            fixedFeeForInit,
            setTestParams(
                this.validators[0].validator_address,
                this.wallets.a.key.accAddress,
                this.wallets.lido_fee.key.accAddress,
            ),
            this.validators
        );

        // register oracle price feeder
        this.previousOracleFeed = await this.testkit.registerAutomaticTx(
            configureMMOracle(
                this.keys.owner,
                this.anchor.moneyMarket.contractInfo["moneymarket_oracle"].contractAddress,
                this.anchor.bAsset.contractInfo["anchor_basset_token"].contractAddress,
                1.0
            )
        );


        this.basset = this.anchor.bAsset;
        this.moneyMarket = this.anchor.moneyMarket;
        this.terraswap = this.anchor.terraswap;
        this.anc = this.anchor.ANC;
        ////////////////////////

        // create mantle state
        console.log({
            bLunaHub: this.basset.contractInfo["anchor_basset_hub"].contractAddress,
            bAssetToken: this.basset.contractInfo["anchor_basset_token"].contractAddress,
            bAssetReward: this.basset.contractInfo["anchor_basset_reward"].contractAddress,
            bAssetAirdrop:
                this.basset.contractInfo["anchor_airdrop_registry"].contractAddress,
            mmInterest:
                this.moneyMarket.contractInfo["moneymarket_interest_model"].contractAddress,
            mmOracle: this.moneyMarket.contractInfo["moneymarket_oracle"].contractAddress,
            mmMarket: this.moneyMarket.contractInfo["moneymarket_market"].contractAddress,
            mmOverseer:
                this.moneyMarket.contractInfo["moneymarket_overseer"].contractAddress,
            mmCustody:
                this.moneyMarket.contractInfo["moneymarket_custody_bluna"].contractAddress,
            mmLiquidation:
                this.moneyMarket.contractInfo["moneymarket_liquidation"].contractAddress,
            mmdistribution:
                this.moneyMarket.contractInfo["moneymarket_distribution_model"]
                    .contractAddress,
            anchorToken: this.moneyMarket.contractInfo["anchorToken"].contractAddress,
            terraswapFactory:
                this.terraswap.contractInfo["terraswap_factory"].contractAddress,
            terraswapPair: "whateva",
            gov: this.anc.contractInfo["gov"].contractAddress,
            faucet: this.anc.contractInfo["faucet"].contractAddress,
            collector: this.anc.contractInfo["collector"].contractAddress,
            community: this.anc.contractInfo["community"].contractAddress,
            staking: this.anc.contractInfo["staking"].contractAddress,
            token: this.anc.contractInfo["token"].contractAddress,
            airdrop: this.anc.contractInfo["airdrop"].contractAddress,
        });

        const mantleState = new MantleState(
            {
                bLunaHub: this.basset.contractInfo["anchor_basset_hub"].contractAddress,
                bAssetToken: this.basset.contractInfo["anchor_basset_token"].contractAddress,
                bAssetReward: this.basset.contractInfo["anchor_basset_reward"].contractAddress,
                bAssetAirdrop:
                    this.basset.contractInfo["anchor_airdrop_registry"].contractAddress,
                mmInterest:
                    this.moneyMarket.contractInfo["moneymarket_interest_model"].contractAddress,
                mmOracle: this.moneyMarket.contractInfo["moneymarket_oracle"].contractAddress,
                mmMarket: this.moneyMarket.contractInfo["moneymarket_market"].contractAddress,
                mmOverseer:
                    this.moneyMarket.contractInfo["moneymarket_overseer"].contractAddress,
                mmCustody:
                    this.moneyMarket.contractInfo["moneymarket_custody_bluna"].contractAddress,
                mmLiquidation:
                    this.moneyMarket.contractInfo["moneymarket_liquidation"].contractAddress,
                mmdistribution:
                    this.moneyMarket.contractInfo["moneymarket_distribution_model"]
                        .contractAddress,
                anchorToken: this.moneyMarket.contractInfo["anchorToken"].contractAddress,
                terraswapFactory:
                    this.terraswap.contractInfo["terraswap_factory"].contractAddress,
                terraswapPair: "whateva",
                gov: this.anc.contractInfo["gov"].contractAddress,
                faucet: this.anc.contractInfo["faucet"].contractAddress,
                collector: this.anc.contractInfo["collector"].contractAddress,
                community: this.anc.contractInfo["community"].contractAddress,
                staking: this.anc.contractInfo["staking"].contractAddress,
                token: this.anc.contractInfo["token"].contractAddress,
                airdrop: this.anc.contractInfo["airdrop"].contractAddress,
            },
            [this.keys.aKey.accAddress, this.keys.bKey.accAddress, this.keys.cKey.accAddress],
            response.validators.map((val) => val.validator_address),
            this.testkit.deriveMantle()
        );

        return mantleState
    }
}



export const get_expected_sum_from_requests = async (querier: AnchorbAssetQueryHelper, reqs: UnbondRequestsResponse): Promise<number> => {
    return reqs.requests.reduce(async (acc, [batchid, amount]) => {
        const acc_sum = await acc;
        const h = await querier.all_history(1, batchid - 1);
        if (h.history.length == 0) {
            // probably this request is not in UnboundHistory yet
            return acc_sum
        } else if (!h.history[0].released) {
            // unbond batch is not released yet
            return acc_sum
        }
        else {
            return Number(h.history[0].withdraw_rate) * Number(amount) + acc_sum;
        }
    }, Promise.resolve(0))
}