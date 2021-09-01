import {mustPass} from "../helper/flow/must";
import {emptyBlockWithFixedGas} from "../helper/flow/gas-station";
import {TestStateLocalTerra} from "./common_localterra";
import AnchorbAssetQueryHelper, {makeRestStoreQuery} from "../helper/basset_queryhelper";

function approxeq(a, b, e) {
    return Math.abs(a - b) <= e;
}

async function getLunaBalance(testState: TestStateLocalTerra, address) {
    let balance = await testState.lcdClient.bank.balance(address);
    return balance.get("uluna").amount
}

async function main() {
    const testState = new TestStateLocalTerra()
    await testState.init()
    const querier = new AnchorbAssetQueryHelper(
        testState.lcdClient,
        testState.basset,
    )

    let bondAmount = 20_000_000_000_000;

    await mustPass(testState.basset.bond(testState.wallets.c, 100))

    await mustPass(testState.basset.bond_for_stluna(testState.wallets.a, bondAmount))
    let balanceA = await querier.balance_stluna(testState.wallets.a.key.accAddress)
    if (balanceA != bondAmount) {
        throw new Error("invalid stLuna balance")
    }

    await mustPass(emptyBlockWithFixedGas(testState.lcdClient, testState.gasStation, 20));
    await mustPass(testState.basset.update_global_index(testState.wallets.a))
    await mustPass(testState.basset.bond_for_stluna(testState.wallets.b, bondAmount))

    let balanceB = await querier.balance_stluna(testState.wallets.b.key.accAddress)
    if (balanceB >= bondAmount) {
        throw new Error(`invalid stLuna balance: ${balanceB} > ${bondAmount}`)
    }

    await mustPass(emptyBlockWithFixedGas(testState.lcdClient, testState.gasStation, 10));
    await mustPass(testState.basset.update_global_index(testState.wallets.a))

    await mustPass(testState.basset.send_cw20_token(
        testState.basset.contractInfo["anchor_basset_token_stluna"].contractAddress,
        testState.wallets.a,
        bondAmount,
        {unbond: {}},
        testState.basset.contractInfo["anchor_basset_hub"].contractAddress
    ));

    const stLunaBalance = await querier.balance_stluna(testState.wallets.a.key.accAddress);
    if (stLunaBalance > 0) {
        throw new Error("stLuna balance must be zero")
    }

    await mustPass(emptyBlockWithFixedGas(testState.lcdClient, testState.gasStation, 10));

    let withdrawableUnbonded = await makeRestStoreQuery(
        testState.basset.contractInfo["anchor_basset_hub"].contractAddress,
        { withdrawable_unbonded: { address: testState.wallets.a.key.accAddress} },
        testState.lcdClient.config.URL
    ).then((r) => r.withdrawable);
    if (withdrawableUnbonded <= bondAmount) {
        throw new Error("withdrawableUnbonded must be more than bond amount")
    }

    let lunaBalanceBeforeWithdraw = await getLunaBalance(testState, testState.wallets.a.key.accAddress);
    await mustPass(testState.basset.finish(testState.wallets.a));
    let lunaBalanceAfterWithdraw = await getLunaBalance(testState, testState.wallets.a.key.accAddress);
    if (!approxeq(Number(BigInt(lunaBalanceAfterWithdraw) - BigInt(lunaBalanceBeforeWithdraw)), withdrawableUnbonded, 2)) {
        throw new Error(`withdraw amount is not equal to withdrawableUnboned: 
                                    ${BigInt(lunaBalanceAfterWithdraw) - BigInt(lunaBalanceBeforeWithdraw)} != ${withdrawableUnbonded}`)
    }

    await mustPass(emptyBlockWithFixedGas(testState.lcdClient, testState.gasStation, 5));

    await mustPass(testState.basset.update_global_index(testState.wallets.a))

    await mustPass(emptyBlockWithFixedGas(testState.lcdClient, testState.gasStation, 10));

    await mustPass(testState.basset.update_global_index(testState.wallets.a))

    await mustPass(testState.basset.send_cw20_token(
        testState.basset.contractInfo["anchor_basset_token_stluna"].contractAddress,
        testState.wallets.b,
        balanceB,
        {unbond: {}},
        testState.basset.contractInfo["anchor_basset_hub"].contractAddress
    ));

    const stLunaBalanceB = await querier.balance_stluna( testState.wallets.b.key.accAddress);
    if (stLunaBalanceB > 0) {
        throw new Error("stLuna balance must be zero")
    }

    await mustPass(emptyBlockWithFixedGas(testState.lcdClient, testState.gasStation, 10));

    withdrawableUnbonded = await makeRestStoreQuery(
        testState.basset.contractInfo["anchor_basset_hub"].contractAddress,
        { withdrawable_unbonded: { address: testState.wallets.b.key.accAddress} },
        testState.lcdClient.config.URL
    ).then((r) => r.withdrawable);
    if (withdrawableUnbonded <= bondAmount) {
        throw new Error("withdrawableUnbonded must be more than bond amount")
    }

    await mustPass(emptyBlockWithFixedGas(testState.lcdClient, testState.gasStation, 10));

    lunaBalanceBeforeWithdraw = await getLunaBalance(testState, testState.wallets.b.key.accAddress);
    await mustPass(testState.basset.finish(testState.wallets.b));

    lunaBalanceAfterWithdraw = await getLunaBalance(testState, testState.wallets.b.key.accAddress);
    if (!approxeq(Number(BigInt(lunaBalanceAfterWithdraw) - BigInt(lunaBalanceBeforeWithdraw)), withdrawableUnbonded, 2)) {
        throw new Error(`withdraw amount is not equal to withdrawableUnboned: 
                                    ${BigInt(lunaBalanceAfterWithdraw) - BigInt(lunaBalanceBeforeWithdraw)} != ${withdrawableUnbonded}`)
    }
}

main()
    .then(() => console.log("done"))
.catch(console.log);
