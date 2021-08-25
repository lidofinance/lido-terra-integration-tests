import { MsgAggregateExchangeRateVote, StdFee } from "@terra-money/terra.js";
import { Testkit } from "../../testkit/testkit";

export const defaultOraclePrice =
  "1200.000000000000000000ukrw,1.000000000000000000uusd,0.750000000000000000usdr,2400.000000000000000000umnt";
const salt = "abcd";

export const registerChainOraclePrevote = (
  validatorName: string,
  delegatorAddress: string,
  validatorAddress: string,
  startAt: number = 0,
  oraclePrice: string = defaultOraclePrice
) => {
  const vote = new MsgAggregateExchangeRateVote(
    oraclePrice,
    salt,
    delegatorAddress,
    validatorAddress
  );
  const prevote = vote.getPrevote();

  return Testkit.automaticTxRequest({
    accountName: validatorName,
    period: 1,
    startAt: startAt,
    msgs: [prevote],
    fee: new StdFee(10000000, "1000000uusd"),
  });
};

export const registerChainOracleVote = (
  validatorName: string,
  delegatorAddress: string,
  validatorAddress: string,
  startAt: number = 0,
  oraclePrice: string = defaultOraclePrice
) => {
  const vote = new MsgAggregateExchangeRateVote(
    oraclePrice,
    salt,
    delegatorAddress,
    validatorAddress
  );

  return Testkit.automaticTxRequest({
    accountName: validatorName,
    period: 1,
    startAt: startAt,
    msgs: [vote],
    fee: new StdFee(10000000, "1000000uusd"),
  });
};
