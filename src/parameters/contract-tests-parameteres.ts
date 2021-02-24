import { CustomInstantiationParam } from "../helper/spawn";
import { ValAddress } from "@terra-money/terra.js";

export const setTestParams = (
  validator: ValAddress,
  testAccount: string
): CustomInstantiationParam => {
  let testParams: CustomInstantiationParam = {
    testAccount: testAccount,
    basset: {
      epoch_period: 30,
      underlying_coin_denom: "uluna",
      unbonding_period: 211,
      peg_recovery_fee: "0.001",
      er_threshold: "1.0",
      reward_denom: "uusd",
      validator: validator, // for tequila
    },
    overseer: {
      stable_denom: "uusd",
      epoch_period: 12,
      distribution_threshold: "0.00000000951",
      target_deposit_rate: "0.00000001522",
      buffer_distribution_rate: "0.1",
      price_timeframe: 30,
    },
    market: {
      stable_denom: "uusd",
      reserve_factor: "0.05",
    },
    custody: {
      stable_denom: "uusd",
    },
    interest: {
      base_rate: "0.00000000381",
      interest_multiplier: "0.00000004",
    },
    oracle: {
      base_asset: "uusd",
    },
    liquidation: {
      stable_denom: "uusd",
      safe_ratio: "0.8",
      bid_fee: "0.01",
      max_premium_rate: "0.2",
      liquidation_threshold: "200",
      price_timeframe: 60,
    },
  };
  return testParams;
};
