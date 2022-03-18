import * as fs from "fs";
import {GraphQLClient} from "graphql-request";
import AnchorbAssetQueryHelper from "../helper/basset_queryhelper";
import {emptyBlockWithFixedGas} from "../helper/flow/gas-station";
import {mustFail, mustPass} from "../helper/flow/must";
import {getRecord} from "../helper/flow/record";
import {makeContractStoreQuery} from "../mantle-querier/common";
import {MantleState} from "../mantle-querier/MantleState";
import {TestState} from "./common";
import {TestStateLocalTerra} from "./common_localterra";
import {TestStateLocalTestNet} from "./common_localtestnet";
import {Airdrop} from "@mirror-protocol/mirror-airdrop";
import AnchorToken from "../helper/anchor_token_helper";
import {Fee} from "@terra-money/terra.js/dist/core/Fee";
import * as path from "path";

var assert = require('assert');
let mantleState: MantleState;






async function main() {

    const testState = new TestStateLocalTestNet()
    await testState.init()

    // we will use cw20 compatible bluna token as anchor token
    const anchorTonenAddress = testState.basset.contractInfo.lido_terra_token.contractAddress
    const withdrawalAccount = testState.wallets.a.key.accAddress

    const querier = new AnchorbAssetQueryHelper(
        testState.lcdClient,
        testState.basset,
    )


    await mustPass(testState.basset.bond(testState.wallets.ownerWallet, 1_000_000_000))

    const anchor = new AnchorToken()
    // https://github.com/Anchor-Protocol/anchor-token-contracts
    // airdrop contract is required for the test
    await mustPass(anchor.storeCodes(testState.wallets.ownerWallet, path.resolve(__dirname, "../../anchor-token-contracts/artifacts"), new Fee(6000000, "2000000uusd")))

    await mustPass(anchor.airdrop_instantiation(testState.wallets.ownerWallet, {anchor_token: anchorTonenAddress}, new Fee(6000000, "2000000uusd")))

    let airdrops_amounts = [
        {"address": testState.basset.contractInfo.lido_terra_hub.contractAddress, "amount": "1000000"},
        // "random" accounts to generate merkle tree
        {"address": testState.wallets.a.key.accAddress, "amount": "1000"},
        {"address": testState.wallets.b.key.accAddress, "amount": "1000"},
        {"address": testState.wallets.c.key.accAddress, "amount": "1000"},
        {"address": testState.wallets.d.key.accAddress, "amount": "1000"},
    ]

    const airdrop = new Airdrop(airdrops_amounts);

    const proof = airdrop.getMerkleProof(airdrops_amounts[0]);
    await mustPass(anchor.airdrop_register_merkle_root(testState.wallets.ownerWallet, airdrop.getMerkleRoot()))
    await mustPass(testState.basset.transfer_cw20_token_to_addr(anchorTonenAddress, testState.wallets.ownerWallet, anchor.contractInfo.airdrop.contractAddress, 1_000_000_000))

    await mustPass(testState.basset.add_airdrop_info(testState.wallets.ownerWallet, anchorTonenAddress, anchor.contractInfo.airdrop.contractAddress))

    assert.equal(await querier.balance_bluna(withdrawalAccount), 0)

    // no withdrawal account configured
    await mustFail(testState.basset.claim_airdrops(testState.wallets.ownerWallet, "ANC", 1, proof, 1_000_000))
    assert.equal(await querier.balance_bluna(withdrawalAccount), 0)

    await mustPass(testState.basset.update_config(testState.wallets.ownerWallet, null, null, null, withdrawalAccount))

    // auth error
    await mustFail(testState.basset.claim_airdrops(testState.wallets.b, "ANC", 1, proof, 1_000_000))
    assert.equal(await querier.balance_bluna(withdrawalAccount), 0)

    // merkle tree verification error due to invalid claim amount
    await mustFail(testState.basset.claim_airdrops(testState.wallets.ownerWallet, "ANC", 1, proof, 1_000_001))
    assert.equal(await querier.balance_bluna(withdrawalAccount), 0)

    // no airdrop contract in the registry
    await mustFail(testState.basset.claim_airdrops(testState.wallets.ownerWallet, "INV", 1, proof, 1_000_000))
    assert.equal(await querier.balance_bluna(withdrawalAccount), 0)

    await mustPass(testState.basset.claim_airdrops(testState.wallets.ownerWallet, "ANC", 1, proof, 1_000_000))

    assert.equal(await querier.balance_bluna(withdrawalAccount), 1_000_000)

    // stage is already claimed 
    await mustFail(testState.basset.claim_airdrops(testState.wallets.ownerWallet, "ANC", 1, proof, 1_000_000))
    assert.equal(await querier.balance_bluna(withdrawalAccount), 1_000_000)

}

main()
    .then(() => console.log("done"))
    .catch(console.log);
