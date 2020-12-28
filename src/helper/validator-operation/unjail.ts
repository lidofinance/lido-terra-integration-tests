import { MsgUnjail, Wallet, StdFee } from "@terra-money/terra.js"

export const unjail = async (valWallet: Wallet) => {
    const tx = await valWallet.createAndSignTx({
        msgs: [new MsgUnjail(valWallet.key.valAddress)],
        fee: new StdFee(1000000, "1000000uusd")
    })
    return valWallet.lcd.tx.broadcast(tx)
}