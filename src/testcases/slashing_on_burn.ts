import AnchorbAssetQueryHelper from "../helper/basset_queryhelper"
import {mustPass} from "../helper/flow/must"
import {TestStateLocalTestNet} from "./common_localtestnet"
var assert = require('assert');


async function main() {
    const testState = new TestStateLocalTestNet()
    await testState.init()
    const querier = new AnchorbAssetQueryHelper(
        testState.lcdClient,
        testState.basset,
    )

    const blunaContractAddress = testState.basset.contractInfo.anchor_basset_token.contractAddress
    const stlunaContractAddress = testState.basset.contractInfo.anchor_basset_token_stluna.contractAddress

    await mustPass(testState.basset.bond(testState.wallets.a, 4_000_000_000))
    assert.equal(await querier.balance_bluna(testState.wallets.a.key.accAddress), 4_000_000_000)
    await mustPass(testState.basset.bond_for_stluna(testState.wallets.a, 4_000_000_000))
    assert.equal(await querier.balance_stluna(testState.wallets.a.key.accAddress), 4_000_000_000)
    assert.ok(await querier.bluna_exchange_rate() == 1)
    assert.ok(await querier.stluna_exchange_rate() == 1)

    await mustPass(testState.basset.burn_cw20_token(blunaContractAddress, testState.wallets.a, 2_000_000_000))
    // burning the tokens leads to exchange rate is growing
    assert.ok(await querier.bluna_exchange_rate() == 2)

    await mustPass(testState.basset.burn_cw20_token(stlunaContractAddress, testState.wallets.a, 2_000_000_000))
    assert.ok(await querier.stluna_exchange_rate() == 2)

    await mustPass(testState.basset.increase_allowance(blunaContractAddress, testState.wallets.a, testState.wallets.b.key.accAddress, 1_000_000_000, {never: {}}))
    await mustPass(testState.basset.burn_from_cw20_token(blunaContractAddress, testState.wallets.b, testState.wallets.a, 1_000_000_000))
    assert.ok(await querier.bluna_exchange_rate() == 4)

    await mustPass(testState.basset.increase_allowance(stlunaContractAddress, testState.wallets.a, testState.wallets.b.key.accAddress, 1_000_000_000, {never: {}}))
    await mustPass(testState.basset.burn_from_cw20_token(stlunaContractAddress, testState.wallets.b, testState.wallets.a, 1_000_000_000))
    assert.ok(await querier.stluna_exchange_rate() == 4)
}

main().then(() => {console.log("done")})