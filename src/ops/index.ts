import { LCDClient, MnemonicKey, Wallet } from "@terra-money/terra.js";
import { anchor } from "./ops";
import { updatebLunaParams } from './update-params'

const args = process.argv.slice(2)

// create lcd client
const lcd = new LCDClient({ URL: args[0], chainID: args[1] })

// create an owner key, from imported argv
const owner = new MnemonicKey({ mnemonic: args[2] })
const ownerWallet = new Wallet(lcd, owner)

// check block info
Promise.resolve()
    .then(() => ownerWallet.lcd.tendermint.blockInfo().then(console.log))

// run store_code, instantiate, print contract addresses to stdout
    .then(() => anchor(ownerWallet)
        .then(contracts => console.log(contracts))
        .catch(console.error)
    )
