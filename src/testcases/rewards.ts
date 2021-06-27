import * as fs from "fs";
import { mustPass } from "../helper/flow/must";
import { getRecord } from "../helper/flow/record";
import { MantleState } from "../mantle-querier/MantleState";
import {TestState} from "./common";

let mantleState: MantleState;

async function main() {
    const testState = new TestState();
    mantleState = await testState.getMantleState();

    await mustPass(testState.basset.bond(testState.wallets.ownerWallet, 20000000000000))

    await mustPass(testState.basset.update_global_index(testState.wallets.a))
}

main()
    .then(() => console.log("done"))
    .then(async () => {
        console.log("saving state...");
        fs.writeFileSync(
            "rewards.json",
            JSON.stringify(getRecord(), null, 2)
        );
        fs.writeFileSync(
            "rewards.json",
            JSON.stringify(await mantleState.getState(), null, 2)
        );
    })
// .catch(console.log);
