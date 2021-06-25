import {
  Coin,
  Coins,
  Dec,
  Int, LCDClient,
  MnemonicKey,
  MsgSend,
  StdFee,
  Validator,
  Wallet,
} from "@terra-money/terra.js";
import * as path from "path";
import * as fs from "fs";
import {mustFail, mustPass} from "../helper/flow/must";
import {getRecord} from "../helper/flow/record";
import {
  registerChainOracleVote,
  registerChainOraclePrevote,
} from "../helper/oracle/chain-oracle";
import Anchor from "../helper/spawn";
import {MantleState} from "../mantle-querier/MantleState";
import {Testkit, TestkitInit} from "../testkit/testkit";
import {configureMMOracle} from "../helper/oracle/mm-oracle";
import {setTestParams} from "../parameters/contract-tests-parameteres";
import {makeContractStoreQuery} from "../mantle-querier/common";
import {GraphQLClient} from "graphql-request/dist";
import AnchorbAsset from "../helper/basset_helper";
import MoneyMarket from "../helper/money_market_helper";
import TerraSwap from "../helper/terraswap_helper";
import AnchorToken from "../helper/anchor_token_helper";

let mantleState: MantleState;

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

  constructor() {
    this.keys = {};
    this.validatorKeys = {};
    this.validators = [];
    this.wallets = {};
  }
}

async function getTestState() : Promise<TestState> {
  const state = new TestState();

  state.testkit = new Testkit("http://localhost:11317");
  const genesis = require("../testkit/genesis.json");

  state.keys.aKey = new MnemonicKey();
  state.keys.bKey = new MnemonicKey();
  state.keys.cKey = new MnemonicKey();
  state.keys.owner = new MnemonicKey();

  state.validatorKeys.validatorAKey = new MnemonicKey();
  state.validatorKeys.validatorBKey = new MnemonicKey();
  state.validatorKeys.validatorCKey = new MnemonicKey();
  state.validatorKeys.validatorDKey = new MnemonicKey();
  state.gasStation = new MnemonicKey();

  const response = await state.testkit.init({
    genesis: genesis,
    accounts: [
      Testkit.walletToAccountRequest("a", state.keys.aKey),
      Testkit.walletToAccountRequest("b", state.keys.bKey),
      Testkit.walletToAccountRequest("c", state.keys.cKey),
      Testkit.walletToAccountRequest("valA", state.validatorKeys.validatorAKey),
      Testkit.walletToAccountRequest("valB", state.validatorKeys.validatorBKey),
      Testkit.walletToAccountRequest("valC", state.validatorKeys.validatorCKey),
      Testkit.walletToAccountRequest("valD", state.validatorKeys.validatorDKey),
      Testkit.walletToAccountRequest("owner", state.keys.owner),
      Testkit.walletToAccountRequest("gasStation", state.gasStation),
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
            state.gasStation.accAddress,
            state.gasStation.accAddress,
            new Coins([new Coin("uusd", 1)])
          ),
        ],
        fee: new StdFee(10000000, "1000000uusd"),
      }),
    ],
  });

  console.log(state.testkit.deriveMantle())

  state.validators = response.validators;
  state.lcdClient = state.testkit.deriveLCD();

  // initialize genesis block
  await state.testkit.inject();

  // register oracle votes
  const validatorNames = ["valA", "valB", "valC", "valD"];
  // register votes
  const initialVotes = await Promise.all(
    state.validators.map(async (validator) =>
      state.testkit.registerAutomaticTx(
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
    state.validators.map(async (validator) =>
      state.testkit.registerAutomaticTx(
        registerChainOraclePrevote(
          validator.account_name,
          validator.Msg.delegator_address,
          validator.Msg.validator_address,
          2
        )
      )
    )
  );
  state.wallets.a = new Wallet(state.lcdClient, state.keys.aKey);
  state.wallets.b = new Wallet(state.lcdClient, state.keys.bKey);
  state.wallets.c = new Wallet(state.lcdClient, state.keys.cKey);

  state.wallets.valAWallet = new Wallet(state.lcdClient, state.validatorKeys.validatorAKey);

  // store & instantiate contracts
  state.wallets.ownerWallet = new Wallet(state.lcdClient, state.keys.owner);
  state.anchor = new Anchor(state.wallets.ownerWallet);
  await state.anchor.store_contracts(
    path.resolve(__dirname, "../../anchor-bAsset-contracts/artifacts"),
    path.resolve(__dirname, "../../money-market-contracts/artifacts"),
    path.resolve(__dirname, "../../terraswap/artifacts"),
    path.resolve(__dirname, "../../anchor-token-contracts/artifacts")
  );

  const fixedFeeForInit = new StdFee(6000000, "2000000uusd");
  await state.anchor.instantiate(
    fixedFeeForInit,
    setTestParams(state.validators[0].validator_address, state.wallets.a.key.accAddress),
    state.validators,
  );

  // register oracle price feeder
  const previousOracleFeed = await state.testkit.registerAutomaticTx(
    configureMMOracle(
      state.keys.owner,
      state.anchor.moneyMarket.contractInfo["moneymarket_oracle"].contractAddress,
      state.anchor.bAsset.contractInfo["anchor_basset_token"].contractAddress,
      1.0
    )
  );


  state.basset = state.anchor.bAsset;
  state.moneyMarket = state.anchor.moneyMarket;
  state.terraswap = state.anchor.terraswap;
  state.anc = state.anchor.ANC;
  ////////////////////////

  // create mantle state
  console.log({
    bLunaHub: state.basset.contractInfo["anchor_basset_hub"].contractAddress,
    bAssetToken: state.basset.contractInfo["anchor_basset_token"].contractAddress,
    bAssetReward: state.basset.contractInfo["anchor_basset_reward"].contractAddress,
    bAssetAirdrop:
    state.basset.contractInfo["anchor_airdrop_registry"].contractAddress,
    mmInterest:
    state.moneyMarket.contractInfo["moneymarket_interest_model"].contractAddress,
    mmOracle: state.moneyMarket.contractInfo["moneymarket_oracle"].contractAddress,
    mmMarket: state.moneyMarket.contractInfo["moneymarket_market"].contractAddress,
    mmOverseer:
    state.moneyMarket.contractInfo["moneymarket_overseer"].contractAddress,
    mmCustody:
    state.moneyMarket.contractInfo["moneymarket_custody_bluna"].contractAddress,
    mmLiquidation:
    state.moneyMarket.contractInfo["moneymarket_liquidation"].contractAddress,
    mmdistribution:
    state.moneyMarket.contractInfo["moneymarket_distribution_model"]
      .contractAddress,
    anchorToken: state.moneyMarket.contractInfo["anchorToken"].contractAddress,
    terraswapFactory:
    state.terraswap.contractInfo["terraswap_factory"].contractAddress,
    terraswapPair: "whateva",
    gov: state.anc.contractInfo["gov"].contractAddress,
    faucet: state.anc.contractInfo["faucet"].contractAddress,
    collector: state.anc.contractInfo["collector"].contractAddress,
    community: state.anc.contractInfo["community"].contractAddress,
    staking: state.anc.contractInfo["staking"].contractAddress,
    token: state.anc.contractInfo["token"].contractAddress,
    airdrop: state.anc.contractInfo["airdrop"].contractAddress,
  });

  mantleState = new MantleState(
    {
      bLunaHub: state.basset.contractInfo["anchor_basset_hub"].contractAddress,
      bAssetToken: state.basset.contractInfo["anchor_basset_token"].contractAddress,
      bAssetReward: state.basset.contractInfo["anchor_basset_reward"].contractAddress,
      bAssetAirdrop:
      state.basset.contractInfo["anchor_airdrop_registry"].contractAddress,
      mmInterest:
      state.moneyMarket.contractInfo["moneymarket_interest_model"].contractAddress,
      mmOracle: state.moneyMarket.contractInfo["moneymarket_oracle"].contractAddress,
      mmMarket: state.moneyMarket.contractInfo["moneymarket_market"].contractAddress,
      mmOverseer:
      state.moneyMarket.contractInfo["moneymarket_overseer"].contractAddress,
      mmCustody:
      state.moneyMarket.contractInfo["moneymarket_custody_bluna"].contractAddress,
      mmLiquidation:
      state.moneyMarket.contractInfo["moneymarket_liquidation"].contractAddress,
      mmdistribution:
      state.moneyMarket.contractInfo["moneymarket_distribution_model"]
        .contractAddress,
      anchorToken: state.moneyMarket.contractInfo["anchorToken"].contractAddress,
      terraswapFactory:
      state.terraswap.contractInfo["terraswap_factory"].contractAddress,
      terraswapPair: "whateva",
      gov: state.anc.contractInfo["gov"].contractAddress,
      faucet: state.anc.contractInfo["faucet"].contractAddress,
      collector: state.anc.contractInfo["collector"].contractAddress,
      community: state.anc.contractInfo["community"].contractAddress,
      staking: state.anc.contractInfo["staking"].contractAddress,
      token: state.anc.contractInfo["token"].contractAddress,
      airdrop: state.anc.contractInfo["airdrop"].contractAddress,
    },
    [state.keys.aKey.accAddress, state.keys.bKey.accAddress, state.keys.cKey.accAddress],
    response.validators.map((val) => val.validator_address),
    state.testkit.deriveMantle()
  );

  return state;
}

async function main() {
  const testState = await getTestState();

  const addedValidatorKey = new MnemonicKey();
  await mustPass(testState.basset.add_validator(testState.wallets.ownerWallet, addedValidatorKey.accAddress))

  const mantleClient = new GraphQLClient(testState.testkit.deriveMantle());
  const registeredValidators = await makeContractStoreQuery(
    testState.basset.contractInfo.validators_registry.contractAddress,
    {get_validators_for_delegation: {}},
    mantleClient
  );

  if (!registeredValidators.some(e => e.address === addedValidatorKey.accAddress)) {
    throw new Error("Could not find the registered validator");
  }
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
