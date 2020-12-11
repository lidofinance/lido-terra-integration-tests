import { Coin, Coins, LocalTerra } from "@terra-money/terra.js";
import basset from "./helper/basset_helper";
import Anchor, { Asset } from "./helper/spawn";

const terra = new LocalTerra();
const a = terra.wallets.test9;
const b = terra.wallets.test3;
const c = terra.wallets.test2;

const validatorA = "terravaloper1dcegyrekltswvyy0xy69ydgxn9x8x32zdy3ua5";

async function main() {
  const anchor = new Anchor();
  await anchor.store_contracts();
  await anchor.instantiate();

  const basset = anchor.bAsset;
  const moneyMarket = anchor.moneyMarket;
  const terraswap = anchor.terraswap;

  // block 11
  await basset.bond(a, 20000000, validatorA);

  //block 13
  //TODO: height should be changed
  await basset.increase_allowance(
    a,
    terraswap.contractInfo["terraswap_pair"].contractAddress,
    100000,
    140000
  );

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
  await terraswap.provide_liquidity(a, [asset1, asset2]);

  //block19
  await basset.bond(a, 20000000, validatorA);

  //block 29
  await basset.transfer_cw20_token(a, b, 10);

  //block 30
  await basset.update_global_index(a);

  //block 30
  await basset.send_cw20_token(
    a,
    20000000,
    "eyJ1bmJvbmQiOnt9fQ==",
    basset.contractInfo["anchor_basset_token"].contractAddress
  );

  //block 40
  await basset.send_cw20_token(
    a,
    1,
    "eyJ1bmJvbmQiOnt9fQ==",
    basset.contractInfo["anchor_basset_token"].contractAddress
  );

  //block 80
  await basset.finish(a);

  //block 81
  await moneyMarket.deposit_stable(b, 1000000);

  //block 82
  const marketAddr =
    moneyMarket.contractInfo["moneymarket_market"].contractAddress;
  await terraswap.send_cw20_token(
    b,
    30000,
    "eyJSZWRlZW1TdGFibGUiOnt9fQ==",
    marketAddr
  );

  //block 83
  const custody =
    moneyMarket.contractInfo["moneymarket_custody"].contractAddress;
  await basset.send_cw20_token(
    a,
    3000000,
    "eyJEZXBvc2l0Q29sbGF0ZXJhbCI6e319",
    custody
  );

  //block 84
  await moneyMarket.overseer_lock_collateral(a, [[a, 2000000]]);

  //block 85
  await moneyMarket.overseer_lock_collateral(a, [[a, 1500000]]);

  //block 86
  await moneyMarket.borrow_stable(a, 1500000);

  //block 87
  await moneyMarket.borrow_stable(a, 500000);

  //block 88
  await terraswap.send_cw20_token(
    b,
    500000,
    "eyJSZWRlZW1TdGFibGUiOnt9fQ==",
    marketAddr
  );

  //block 89
  await moneyMarket.deposit_stable(a, 1);

  //block 90
  await moneyMarket.overseer_unlock_collateral(a, [[a, 100000]]);

  //block 91
  await moneyMarket.overseer_unlock_collateral(a, [[a, 1000000]]);

  //block 92
  await moneyMarket.withdraw_collateral(a, 150000);

  //block 93
  await moneyMarket.withdraw_collateral(a, 990000);

  //block 94
  await basset.update_global_index(a);

  //block 111
  await moneyMarket.execute_epoch_operations(a);

  //block 112
  await moneyMarket.repay_stable(a, 400000);

  //block 113
  await basset.update_global_index(a);

  //block 114
  await moneyMarket.execute_epoch_operations(a);

  //block 115
  await moneyMarket.overseer_unlock_collateral(a, [[a, 840000]]);

  //block 116
  await moneyMarket.liquidation(c, a.key.accAddress);

  //block 118
  await moneyMarket.liquidation(b, a.key.accAddress);
}

async function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main();
