import { mustPass } from "../helper/flow/must";
import {emptyBlockWithFixedGas} from "../helper/flow/gas-station";
import {TestStateLocalTerra} from "./common_localterra";
import {makeRestStoreQuery} from "../helper/basset_queryhelper";
import {send_transaction} from "../helper/flow/execution";
import {MsgSend} from "@terra-money/terra.js";

async function getLunaBalance(testState: TestStateLocalTerra, address) {
    let balance = await testState.lcdClient.bank.balance(address);
    return balance[0].get("uluna").amount
}

async function main() {
    const testState = new TestStateLocalTerra()
    await testState.init()

    let bondAmount = 20_000_000_000;
    let unbondAmount = 5_000_000_000;

    await mustPass(testState.basset.bond(testState.wallets.a, bondAmount))

    await mustPass(emptyBlockWithFixedGas(testState.lcdClient, testState.gasStation, 5))

    await mustPass(testState.basset.send_cw20_token(
        testState.basset.contractInfo["lido_terra_token"].contractAddress,
        testState.wallets.a,
        unbondAmount,
        {unbond: {}},
        testState.basset.contractInfo["lido_terra_hub"].contractAddress
    ));

    await mustPass(emptyBlockWithFixedGas(testState.lcdClient, testState.gasStation, 10))

    let withdrawableUnbonded = await makeRestStoreQuery(
        testState.basset.contractInfo["lido_terra_hub"].contractAddress,
        { withdrawable_unbonded: { address: testState.wallets.a.key.accAddress} },
        testState.lcdClient.config.URL
    ).then((r) => r.withdrawable);
    if (withdrawableUnbonded != unbondAmount) {
        throw new Error(`expected withdrawableUnbonded != actual withdrawableUnbonded: ${unbondAmount} != ${withdrawableUnbonded}`)
    }

    await mustPass(send_transaction(testState.wallets.ownerWallet, [
        new MsgSend(testState.wallets.ownerWallet.key.accAddress, testState.basset.contractInfo["lido_terra_hub"].contractAddress, "5uluna"),
    ]));

    await mustPass(testState.basset.send_cw20_token(
        testState.basset.contractInfo["lido_terra_token"].contractAddress,
        testState.wallets.a,
        unbondAmount,
        {unbond: {}},
        testState.basset.contractInfo["lido_terra_hub"].contractAddress
    ));

    await mustPass(emptyBlockWithFixedGas(testState.lcdClient, testState.gasStation, 10))

    withdrawableUnbonded = await makeRestStoreQuery(
        testState.basset.contractInfo["lido_terra_hub"].contractAddress,
        { withdrawable_unbonded: { address: testState.wallets.a.key.accAddress} },
        testState.lcdClient.config.URL
    ).then((r) => r.withdrawable);
    if (withdrawableUnbonded != unbondAmount * 2) {
        throw new Error(`expected withdrawableUnbonded != actual withdrawableUnbonded: ${unbondAmount * 2} != ${withdrawableUnbonded}`)
    }

    let lunaBalanceBeforeWithdraw = await getLunaBalance(testState, testState.wallets.a.key.accAddress);
    await mustPass(testState.basset.finish(testState.wallets.a));
    let lunaBalanceAfterWithdraw = await getLunaBalance(testState, testState.wallets.a.key.accAddress);

    if (BigInt(+lunaBalanceAfterWithdraw) - BigInt(+lunaBalanceBeforeWithdraw) <= BigInt(withdrawableUnbonded)) {
        throw new Error(`withdraw amount is less than withdrawableUnboned: 
                                    ${BigInt(+lunaBalanceAfterWithdraw) - BigInt(+lunaBalanceBeforeWithdraw)} <= ${withdrawableUnbonded}`)
    }
}

main()
    .then(() => console.log("done"))
    .catch(console.log);
