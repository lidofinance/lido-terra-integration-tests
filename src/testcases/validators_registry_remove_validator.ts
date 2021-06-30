import * as fs from "fs";
import {mustFail, mustPass} from "../helper/flow/must";
import {getRecord} from "../helper/flow/record";
import {MantleState} from "../mantle-querier/MantleState";
import {TestState} from "./common";

let mantleState: MantleState;

async function main() {
    const testState = new TestState();
    mantleState = await testState.getMantleState();

    // Auth test, validators_registry is only allowed to send redelegate_proxy message.
    await mustFail(testState.basset.redelegate_proxy(testState.wallets.ownerWallet, testState.validators[0].validator_address, testState.validators[1].validator_address, 100))

    await mustPass(testState.basset.bond(testState.wallets.ownerWallet, 20000000000000))

    await mustPass(testState.basset.remove_validator(testState.wallets.ownerWallet, testState.validators[0].validator_address))
}

main()
    .then(() => console.log("done"))
    .then(async () => {
        console.log("saving state...");
        fs.writeFileSync(
            "remove_validator_action.json",
            JSON.stringify(getRecord(), null, 2)
        );
        fs.writeFileSync(
            "remove_validator_state.json",
            JSON.stringify(await mantleState.getState(), null, 2)
        );
    })
    .catch(console.log);
