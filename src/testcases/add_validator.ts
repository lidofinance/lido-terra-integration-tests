import {
  MnemonicKey,
} from "@terra-money/terra.js";
import * as fs from "fs";
import {mustPass} from "../helper/flow/must";
import {getRecord} from "../helper/flow/record";
import {MantleState} from "../mantle-querier/MantleState";
import {makeContractStoreQuery} from "../mantle-querier/common";
import {GraphQLClient} from "graphql-request/dist";
import {TestState} from "./common";

let mantleState: MantleState;

async function main() {
  const testState = new TestState();
  mantleState = await testState.getMantleState();

  const addedValidatorKey = new MnemonicKey();
  await mustPass(testState.basset.add_validator(testState.wallets.ownerWallet, addedValidatorKey.accAddress))

  const mantleClient = new GraphQLClient(testState.testkit.deriveMantle());
  const registeredValidators = await makeContractStoreQuery(
    testState.basset.contractInfo.anchor_basset_validators_registry.contractAddress,
    {get_validators_for_delegation: {}},
    mantleClient
  );

  if (!registeredValidators.some(e => e.address === addedValidatorKey.accAddress)) {
    throw new Error("Could not find the registered validator");
  }
}

main()
  .then(() => console.log("done"))
  .then(async () => {
    console.log("saving state...");
    fs.writeFileSync(
      "remove_validator.json",
      JSON.stringify(getRecord(), null, 2)
    );
    fs.writeFileSync(
      "remove_validator.json",
      JSON.stringify(await mantleState.getState(), null, 2)
    );
  })
  .catch(console.log);
