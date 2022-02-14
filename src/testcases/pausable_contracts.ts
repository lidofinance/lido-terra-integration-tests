import {mustPass, mustFail, mustFailWithErrorMsg} from "../helper/flow/must";
import {emptyBlockWithFixedGas} from "../helper/flow/gas-station";
import {TestStateLocalTerra} from "./common_localterra";

async function main() {
    const testState = new TestStateLocalTerra()
    await testState.init()

    let stLunaBondAmount = 20_000_000_000;
    let bLunaBondAmount = 20_000_000_000;

    await mustPass(testState.basset.bond_for_stluna(testState.wallets.c, stLunaBondAmount))
    await mustPass(testState.basset.bond(testState.wallets.d, bLunaBondAmount))

    await mustPass(testState.basset.send_cw20_token(
        testState.basset.contractInfo.lido_terra_token.contractAddress,
        testState.wallets.d,
        10000,
        {unbond: {}},
        testState.basset.contractInfo["lido_terra_hub"].contractAddress
    ));
    await mustPass(emptyBlockWithFixedGas(testState.lcdClient, testState.gasStation, 10));

    await mustPass(emptyBlockWithFixedGas(testState.lcdClient, testState.gasStation, 5));
    await mustPass(testState.basset.update_global_index(testState.wallets.ownerWallet));

    // only the owner can manage guardians
    await mustFail(testState.basset.add_guardians(testState.wallets.d, [testState.wallets.a.key.accAddress, testState.wallets.b.key.accAddress]));

    await mustPass(testState.basset.add_guardians(testState.wallets.ownerWallet, [testState.wallets.a.key.accAddress, testState.wallets.b.key.accAddress]));

    // guardian A pauses the contracts
    await mustPass(testState.basset.pauseContracts((testState.wallets.a)))

    // check that all contracts are paused
    await mustFail(testState.basset.fabricate_mir_claim(testState.wallets.d, 10, "1000", ["aaa, bbb"])); // airdrop must be paused
    await mustFail(testState.basset.update_global_index(testState.wallets.ownerWallet)); // hub must be paused
    await mustFail(testState.basset.bond(testState.wallets.d, bLunaBondAmount)); // hub must be paused
    await mustFail(testState.basset.bond_for_stluna(testState.wallets.d, stLunaBondAmount)); // hub must be paused
    await mustFailWithErrorMsg(testState.basset.finish(testState.wallets.d), "the contract is temporarily paused"); // hub must be paused
    await mustFail(testState.basset.reward(testState.wallets.d)); // reward contract must be paused
    await mustFail(testState.basset.transfer_cw20_token(
        testState.basset.contractInfo.lido_terra_token.contractAddress, testState.wallets.d, testState.wallets.c, 1_000_000_000)
    );
    await mustFail(testState.basset.convert_bluna_to_stluna(testState.wallets.d,
        1_000_000_000))
    await mustFail(testState.basset.transfer_cw20_token(
        testState.basset.contractInfo.lido_terra_token_stluna.contractAddress, testState.wallets.c, testState.wallets.d, 1_000_000_000)
    );
    await mustFail(testState.basset.convert_bluna_to_stluna(testState.wallets.c,
        1_000_000_000))

    // only the owner can unpause contracts
    await mustFail(testState.basset.unpauseContracts((testState.wallets.a)))

    // unpause contracts
    await mustPass(testState.basset.unpauseContracts((testState.wallets.ownerWallet)))

    // check that all contracts are unpaused
    await mustPass(testState.basset.update_global_index(testState.wallets.ownerWallet));
    await mustPass(testState.basset.bond(testState.wallets.d, bLunaBondAmount));
    await mustPass(testState.basset.bond_for_stluna(testState.wallets.d, stLunaBondAmount));
    await mustPass(testState.basset.finish(testState.wallets.d));
    await mustPass(testState.basset.reward(testState.wallets.d));
    await mustPass(testState.basset.transfer_cw20_token(
        testState.basset.contractInfo.lido_terra_token.contractAddress, testState.wallets.d, testState.wallets.c, 1_000_000_000)
    );
    await mustPass(testState.basset.convert_bluna_to_stluna(testState.wallets.d,
        1_000_000_000))
    await mustPass(testState.basset.transfer_cw20_token(
        testState.basset.contractInfo.lido_terra_token.contractAddress, testState.wallets.c, testState.wallets.d, 1_000_000_000)
    );
    await mustPass(testState.basset.convert_stluna_to_bluna(testState.wallets.c,
        1_000_000_000))

    // only the owner can manage guardians
    await mustFail(testState.basset.remove_guardians(testState.wallets.b, [testState.wallets.a.key.accAddress]));

    await mustPass(testState.basset.remove_guardians(testState.wallets.ownerWallet, [testState.wallets.a.key.accAddress]));

    // guardian A cannot pause the contracts because it was removed
    await mustFail(testState.basset.pauseContracts((testState.wallets.a)))

    // but guardian B can pause the contracts
    await mustPass(testState.basset.pauseContracts((testState.wallets.b)))
}

main()
    .then(() => console.log("done"))
    .catch(console.log);