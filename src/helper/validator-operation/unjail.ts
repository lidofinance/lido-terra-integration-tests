import { MsgUnjail, Wallet, StdFee } from "@terra-money/terra.js";
import { send_transaction } from "../flow/execution";

export const unjail = async (valWallet: Wallet) => {
  return send_transaction(valWallet, [new MsgUnjail(valWallet.key.valAddress)]);
};
