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

  ///////////////// scenario 시작 ////////////////////

  // await testkit.inject(validators[0].validator_address) -> 아무 Tx 없이 지나가는 경우의 테스팅

  // await mustPass(
  //   anchor.bAsset.register_validator(
  //     ownerWallet,
  //     validators[0].validator_address
  //   )
  // );
  // //erase these
  // await mustPass(
  //   anchor.bAsset.register_validator(
  //     ownerWallet,
  //     validators[1].validator_address
  //   )
  // );
  // await mustPass(
  //   anchor.bAsset.register_validator(
  //     ownerWallet,
  //     validators[2].validator_address
  //   )
  // );
  // await mustPass(
  //   anchor.bAsset.register_validator(
  //     ownerWallet,
  //     validators[3].validator_address
  //   )
  // );

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
  //block 67
  await mustPass(emptyBlockWithFixedGas(lcd, gasStation))

  //block 68
  await mustPass(emptyBlockWithFixedGas(lcd, gasStation))

  //block 69
  await mustPass(basset.bond(a, 20000000000000, validators[0].validator_address))

  //block 70
  await mustPass(basset.bond(a, 333333333333, validators[1].validator_address))

  //block 71
  await mustPass(basset.bond(a, 333333333333, validators[2].validator_address))

  //block 72
  await mustPass(basset.bond(a, 333333333333, validators[3].validator_address))

  //block 73
  //FIX
  // await mustPass(basset.remove_validator(ownerWallet, validators[0].validator_address))

  //block 74 - 80
  await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 7))

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
  await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 3))

  //block 95
  await mustPass(basset.bond(a, 20000000000000, validators[0].validator_address))

  //block 96
  await mustPass(basset.transfer_cw20_token(a, b, 10000000))

  //block 97
  await basset.send_cw20_token(
    a,
    333333333333,
    { unbond: {} },
    basset.contractInfo["anchor_basset_hub"].contractAddress
  )

  //block 98
  await mustPass(basset.send_cw20_token(
    a,
    333333333333,
    { unbond: {} },
    basset.contractInfo["anchor_basset_hub"].contractAddress
  ))

  //block 99 - 159
  await mustPass(emptyBlockWithFixedGas(lcd, gasStation, 51))

  //block 159
  await mustPass(basset.send_cw20_token(
    a,
    333333333333,
    { unbond: {} },
    basset.contractInfo["anchor_basset_hub"].contractAddress
  ))

  //block 160
  await mustPass(basset.finish(a))

  //block 161
  await mustPass(moneyMarket.deposit_stable(b, 1000000000000))

  //block 162
  const marketAddr = moneyMarket.contractInfo["moneymarket_market"].contractAddress;
  await mustPass(moneyMarket.send_cw20_token(
    b,
    300000000000,
    { redeem_stable: {} },
    marketAddr
  ))

  //block 163
  const custody = moneyMarket.contractInfo["moneymarket_custody_bluna"].contractAddress;
  await mustPass(basset.send_cw20_token(
    a,
    3000000000000,
    { deposit_collateral: {} },
    custody
  ))

  //block 164
  await mustFail(basset.send_cw20_token(
    a,
    300000000000000,
    { deposit_collateral: {} },
    custody
  ))

  //block 165
  await mustFail(moneyMarket.custody_lock_collateral(a, a.key.accAddress, "100"))

  //block 166
  await mustPass(moneyMarket.overseer_lock_collateral(
    a, [[basset.contractInfo["anchor_basset_token"].contractAddress, "2000000000000"]])
  )

  //block 167
  await mustFail(moneyMarket.overseer_lock_collateral(
    a, [[basset.contractInfo["anchor_basset_token"].contractAddress, "1500000000000"]])
  )

  //block 168
  await mustFail(moneyMarket.borrow_stable(a, 1500000000000, undefined))

  //block 169
  await mustPass(moneyMarket.borrow_stable(a, 500000000000, undefined))

  //block 170
  //FIX
  // await mustPass(basset.update_global_index(a))

  //block 171
  await mustPass(moneyMarket.market_claim_rewards(a))

}

main()
  .then(() => console.log("done"))
  .then(async () => {
    console.log("saving state...");
    fs.writeFileSync(
      "scenario1_action.json",
      JSON.stringify(getRecord(), null, 2)
    );
    fs.writeFileSync(
      "scenario1_state.json",
      JSON.stringify(await mantleState.getState(), null, 2)
    );
  })
  .catch(console.log);
