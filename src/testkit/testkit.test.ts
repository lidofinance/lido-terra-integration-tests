import {
  initTestkit,
  validatorInitRequest,
  walletToAccountRequest,
} from "./testkit";
import * as fs from "fs";
import * as path from "path";
import { Coin, Dec, Int, MnemonicKey, Validator } from "@terra-money/terra.js";

const genesis = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, "./genesis.json")).toString()
);

const walletA = new MnemonicKey();
const walletB = new MnemonicKey();
const walletC = new MnemonicKey();

Promise.resolve()
  .then(() =>
    initTestkit({
      genesis,
      accounts: [
        walletToAccountRequest("walletA", walletA),
        walletToAccountRequest("walletB", walletB),
        walletToAccountRequest("walletC", walletC),
      ],
      validators: [
        validatorInitRequest(
          "walletA",
          new Coin("uluna", new Int(1000000000)),
          new Validator.CommissionRates(new Dec(0), new Dec(1), new Dec(0))
        ),
        validatorInitRequest(
          "walletB",
          new Coin("uluna", new Int(1000000000)),
          new Validator.CommissionRates(new Dec(0), new Dec(1), new Dec(0))
        ),
        validatorInitRequest(
          "walletC",
          new Coin("uluna", new Int(1000000000)),
          new Validator.CommissionRates(new Dec(0), new Dec(1), new Dec(0))
        ),
      ],
    })
  )
  .then((r) => console.log(JSON.stringify(r, null, 2)))
  .catch(console.log);
