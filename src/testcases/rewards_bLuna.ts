import {mustPass} from "../helper/flow/must";
import {emptyBlockWithFixedGas} from "../helper/flow/gas-station";
import {TestStateLocalTerra} from "./common_localterra";
import {makeRestStoreQuery} from "../helper/basset_queryhelper";
import {defaultSleepTime, sleep, TestStateLocalTestNet} from "./common_localtestnet";

async function getLunaBalance(testState: TestStateLocalTestNet, address) {
    let balance = await testState.lcdClient.bank.balance(address);
    return balance[0].get("uluna").amount
}

export default async function main(contracts?: Record<string, number>) {
    const testState = new TestStateLocalTestNet(contracts)
    await testState.init()

    let bondAmount = 20_000_000_000_000;

    await mustPass(testState.basset.bond(testState.wallets.a, bondAmount))
    await mustPass(testState.basset.bond(testState.wallets.b, bondAmount))

    await mustPass(testState.basset.update_global_index(testState.wallets.a))

    await mustPass(testState.basset.send_cw20_token(
        testState.basset.contractInfo["lido_terra_token"].contractAddress,
        testState.wallets.a,
        bondAmount,
        {unbond: {}},
        testState.basset.contractInfo["lido_terra_hub"].contractAddress
    ));

    const bLunaBalance = await makeRestStoreQuery(
        testState.basset.contractInfo["lido_terra_token"].contractAddress,
        {balance: {address: testState.wallets.a.key.accAddress}},
        testState.lcdClient.config.URL
    ).then((r) => r.balance);

    if (bLunaBalance > 0) {
        throw new Error("bLuna balance must be zero")
    }

    let accruedRewards = await makeRestStoreQuery(
        testState.basset.contractInfo["lido_terra_reward"].contractAddress,
        {accrued_rewards: {address: testState.wallets.a.key.accAddress}},
        testState.lcdClient.config.URL
    ).then((r) => r.rewards);
    if (accruedRewards <= 0) {
        throw new Error("accruedRewards must be more than zero");
    }

    await sleep(defaultSleepTime)

    let withdrawableUnbonded = await makeRestStoreQuery(
        testState.basset.contractInfo["lido_terra_hub"].contractAddress,
        {withdrawable_unbonded: {address: testState.wallets.a.key.accAddress}},
        testState.lcdClient.config.URL
    ).then((r) => r.withdrawable);
    if (withdrawableUnbonded != bondAmount) {
        throw new Error(`withdrawableUnbonded(${withdrawableUnbonded}) is not equal to bonded(${bondAmount}) amount`)
    }

    let lunaBalanceBeforeWithdraw = await getLunaBalance(testState, testState.wallets.a.key.accAddress);
    await mustPass(testState.basset.finish(testState.wallets.a));
    let lunaBalanceAfterWithdraw = await getLunaBalance(testState, testState.wallets.a.key.accAddress);
    // we lose 1-2 uluna because of Decimal logic
    if (BigInt(+lunaBalanceAfterWithdraw) - BigInt(+lunaBalanceBeforeWithdraw) != BigInt(withdrawableUnbonded)) {
        throw new Error(`withdraw amount is not equal to withdrawableUnboned: 
                                    ${BigInt(+lunaBalanceAfterWithdraw) - BigInt(+lunaBalanceBeforeWithdraw)} != ${withdrawableUnbonded}`)
    }

    await sleep(defaultSleepTime)

    await mustPass(testState.basset.update_global_index(testState.wallets.a))

    await mustPass(testState.basset.send_cw20_token(
        testState.basset.contractInfo["lido_terra_token"].contractAddress,
        testState.wallets.b,
        bondAmount,
        {unbond: {}},
        testState.basset.contractInfo["lido_terra_hub"].contractAddress
    ));

    accruedRewards = await makeRestStoreQuery(
        testState.basset.contractInfo["lido_terra_reward"].contractAddress,
        {accrued_rewards: {address: testState.wallets.b.key.accAddress}},
        testState.lcdClient.config.URL
    ).then((r) => r.rewards);
    if (accruedRewards <= 0) {
        throw new Error("accruedRewards must be more than zero");
    }

    await sleep(defaultSleepTime)

    withdrawableUnbonded = await makeRestStoreQuery(
        testState.basset.contractInfo["lido_terra_hub"].contractAddress,
        {withdrawable_unbonded: {address: testState.wallets.b.key.accAddress}},
        testState.lcdClient.config.URL
    ).then((r) => r.withdrawable);
    if (withdrawableUnbonded != bondAmount) {
        throw new Error(`withdrawableUnbonded is not equal to bonded amount: ${withdrawableUnbonded} != ${bondAmount}`)
    }

    await sleep(defaultSleepTime)

    lunaBalanceBeforeWithdraw = await getLunaBalance(testState, testState.wallets.b.key.accAddress);
    await mustPass(testState.basset.finish(testState.wallets.b));
    lunaBalanceAfterWithdraw = await getLunaBalance(testState, testState.wallets.b.key.accAddress);
    // we lose 1-2 uluna because of Decimal logic
    if (BigInt(+lunaBalanceAfterWithdraw) - BigInt(+lunaBalanceBeforeWithdraw) != BigInt(withdrawableUnbonded)) {
        throw new Error(`withdraw amount is not equal to withdrawableUnboned: 
                                    ${BigInt(+lunaBalanceAfterWithdraw) - BigInt(+lunaBalanceBeforeWithdraw)} != ${withdrawableUnbonded}`)
    }

}

if (require.main === module) {
    main()
        .then(() => console.log("done"))
        .catch(console.log);
}
