import * as fs from "fs";
import { mustFail, mustPass } from "../helper/flow/must";
import { getRecord } from "../helper/flow/record";
import { MantleState } from "../mantle-querier/MantleState";
import {TestState} from "./common";

let mantleState: MantleState;

async function main() {
    const testState = new TestState();
    mantleState = await testState.getMantleState();

    await mustPass(testState.basset.bond(testState.wallets.a, 10000000000))

    await mustPass(testState.basset.transfer_cw20_token(testState.wallets.a, testState.wallets.b, 10000000))

    await mustFail(testState.basset.burn_cw20_token(testState.wallets.b, 11000000))
    await mustPass(testState.basset.burn_cw20_token(testState.wallets.b, 10000000))


    await mustPass(testState.basset.send_cw20_token(
      testState.wallets.a,
        1000000,
        { unbond: {} },
        testState.basset.contractInfo["anchor_basset_hub"].contractAddress
    ))

    // mint message allowed only from anchor_basset_hub contract as sender
    await mustFail(testState.basset.mint_cw20_token(testState.wallets.a, testState.basset.contractInfo["anchor_basset_hub"].contractAddress, 100000))

    // TransferFrom
    await mustPass(testState.basset.increase_allowance(testState.wallets.a, testState.wallets.b.key.accAddress, 100000, { never: {} }))
    await mustPass(testState.basset.transfer_from_cw20_token(testState.wallets.b, testState.wallets.a, testState.wallets.b, 10000))
    await mustPass(testState.basset.transfer_from_cw20_token(testState.wallets.b, testState.wallets.a, testState.wallets.b, 20000))
    await mustPass(testState.basset.decrease_allowance(testState.wallets.a, testState.wallets.b.key.accAddress, 100000, { never: {} }))
    await mustFail(testState.basset.transfer_from_cw20_token(testState.wallets.b, testState.wallets.a, testState.wallets.b, 20000))

    // BurnFrom
    await mustPass(testState.basset.increase_allowance(testState.wallets.a, testState.wallets.b.key.accAddress, 100000, { never: {} }))
    await mustPass(testState.basset.burn_from_cw20_token(testState.wallets.b, testState.wallets.a, 10000))
    await mustPass(testState.basset.decrease_allowance(testState.wallets.a, testState.wallets.b.key.accAddress, 100000, { never: {} }))
    await mustFail(testState.basset.burn_from_cw20_token(testState.wallets.b, testState.wallets.a, 10000))

    // SendFrom
    await mustPass(testState.basset.increase_allowance(testState.wallets.a, testState.wallets.b.key.accAddress, 1000000, { never: {} }))
    await mustPass(testState.basset.send_from_cw20_token(testState.wallets.b, testState.wallets.a,
        100000,
        { unbond: {} },
        testState.basset.contractInfo["anchor_basset_hub"].contractAddress))
    await mustPass(testState.basset.decrease_allowance(testState.wallets.a, testState.wallets.b.key.accAddress, 1000000, { never: {} }))
    await mustFail(testState.basset.send_from_cw20_token(testState.wallets.b, testState.wallets.a,
        100000,
        { unbond: {} },
        testState.basset.contractInfo["anchor_basset_hub"].contractAddress))
}

main()
    .then(() => console.log("done"))
    .then(async () => {
        console.log("saving state...");
        fs.writeFileSync(
            "bluna_short_test_action.json",
            JSON.stringify(getRecord(), null, 2)
        );
        fs.writeFileSync(
            "bluna_short_test_state.json",
            JSON.stringify(await mantleState.getState(), null, 2)
        );
    })
    .catch(console.log);
