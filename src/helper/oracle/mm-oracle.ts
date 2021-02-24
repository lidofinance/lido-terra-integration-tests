import { Testkit } from "../../testkit/testkit";
import { MsgExecuteContract, StdFee, Key } from "@terra-money/terra.js";

export const configureMMOracle = (
  owner: Key,
  oracleContractAddress: string,
  bAssetTokenContractAddress: string,
  price: number
) => {
  return Testkit.automaticTxRequest({
    accountName: "owner",
    period: 1,
    msgs: [
      new MsgExecuteContract(owner.accAddress, oracleContractAddress, {
        feed_price: {
          prices: [[bAssetTokenContractAddress, price.toFixed(18)]],
        },
      }),
    ],
    fee: new StdFee(10000000, "1000000uusd"),
  });
};
