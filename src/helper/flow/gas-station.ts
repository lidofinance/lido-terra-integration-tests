import { Key, LCDClient, MsgSend, Wallet } from "@terra-money/terra.js";
import { send_transaction } from "./execution";

export const emptyBlockWithFixedGas = (
  lcd: LCDClient,
  key: Key,
  howMany?: number
) =>
  new Array(howMany || 1).fill(true).reduce(
    (t, f) =>
      t.then(() => {
        return send_transaction(new Wallet(lcd, key), [
          new MsgSend(key.accAddress, key.accAddress, "1uluna"),
        ]);
      }),
    Promise.resolve()
  );
