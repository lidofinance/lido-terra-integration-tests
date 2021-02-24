import {
  BlockTxBroadcastResult,
  Coins,
  Msg,
  MsgExecuteContract,
  MsgInstantiateContract,
  StdFee,
  Wallet,
} from "@terra-money/terra.js";
import { gql } from "graphql-request";
import { MantleState } from "../../mantle-querier/MantleState";
import { makeRecord } from "./record";

export async function instantiate(
  sender: Wallet,
  codeId: number,
  initMsg: object,
  tokens?: Coins,
  fee?: StdFee
): ReturnType<typeof send_transaction> {
  console.error(`instantiate ${codeId} w/ ${JSON.stringify(initMsg)}`);
  return await send_transaction(
    sender,
    [
      new MsgInstantiateContract(
        sender.key.accAddress,
        codeId,
        initMsg,
        tokens
      ),
    ],
    fee
  );
}

export async function execute(
  sender: Wallet,
  contract: string,
  executeMsg: object,
  tokens?: Coins,
  fee?: StdFee
): ReturnType<typeof send_transaction> {
  console.error(`execute ${contract} w/ ${JSON.stringify(executeMsg)}`);
  return await send_transaction(
    sender,
    [
      new MsgExecuteContract(
        sender.key.accAddress,
        contract,
        executeMsg,
        tokens
      ),
    ],
    fee
  );
}

// const mantleStateForBlockResponse = new MantleState(
//   null,
//   [],
//   [],
//   "http://localhost:1337"
// );

export async function send_transaction(
  sender: Wallet,
  msgs: Msg[],
  fee: StdFee = new StdFee(10000000, "1000000uusd")
): Promise<BlockTxBroadcastResult> {
  return Promise.resolve()
    .then(() =>
      sender.createAndSignTx({
        msgs,
        gasAdjustment: 1.4,
        fee: fee,
      })
    )
    .then((tx) => sender.lcd.tx.broadcast(tx))
    .then(async (result) => {
      console.log(result);
      console.error(result.txhash);
      // await mantleStateForBlockResponse
      //   .query(
      //     gql`
      //       query {
      //         BlockState {
      //           ResponseDeliverTx {
      //             GasWanted
      //           }
      //         }
      //       }
      //     `,
      //     {}
      //   )
      await Promise.resolve();
      // .then((r) =>
      //   r.BlockState.ResponseDeliverTx.reduce(
      //     (p: any, c: { GasWanted: any }) => p + +c.GasWanted,
      //     0
      //   )
      // )
      // .then(gas => makeRecord(msgs, gas))
      // .catch((e) => {
      //   console.error(e)
      //   // noop if mantle couldn't be connected
      // })
      // .then(() => new Promise(resolve => setTimeout(resolve, 1000)))

      return result;
    });
}
