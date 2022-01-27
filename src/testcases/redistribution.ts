import {Coin} from "@terra-money/terra.js";
import AnchorbAssetQueryHelper from "../helper/basset_queryhelper";
import {mustFail, mustPass} from "../helper/flow/must";
import {redelegate_proxy_multisig, redistribute} from "../utils/redistribution";
import {sleep, TestStateLocalTestNet, vals} from "./common_localtestnet"
var assert = require('assert');

export default async function main(contracts?: Record<string, number>) {
    const testState = new TestStateLocalTestNet(contracts)
    await testState.init()

    const querier = new AnchorbAssetQueryHelper(
        testState.lcdClient,
        testState.basset,
    )


    await mustPass(testState.basset.bond(testState.wallets.a, 2_500_000_000))
    const initial_delegations = [2_500_000_000, 1_300_000_000, 700_000_000, 300_000_000]
    for (let i = 1; i < 4; i++) {
        await mustPass(testState.basset.add_validator(testState.wallets.a, vals[i].address))
        await mustPass(testState.basset.bond(testState.wallets.a, initial_delegations[i]))
    }
    let validators = await querier.get_validators_for_delegation()

    for (let i = 0; i < initial_delegations.length; i++) {
        assert.equal(
            Number(validators.find((v) => {return (v.address == vals[i].address)}).total_delegated!),
            initial_delegations[i]
        )
    }


    // updating hub's creator field
    await mustPass(
        testState.basset.update_config(testState.wallets.a, testState.multisigPublikKey.address())
    )

    // previous creator is not allowed to make redeletion anymore
    await mustFail(testState.basset.redelegate_proxy(
        testState.wallets.ownerWallet,
        vals[0].address,
        [[vals[1].address, new Coin("uluna", "4000")]]
    ))

    //one key is not enouth to sign transaction
    await mustFail(redelegate_proxy_multisig(
        testState.lcdClient,
        testState.basset.contractInfo.lido_terra_hub.contractAddress,
        testState.multisigPublikKey,
        testState.multisigKeys.slice(0,0),
        vals[0].address,
        [[vals[1].address, 
        new Coin("uluna", "4000")]]
    ))

    await mustPass(redelegate_proxy_multisig(
        testState.lcdClient,
        testState.basset.contractInfo.lido_terra_hub.contractAddress,
        testState.multisigPublikKey,
        testState.multisigKeys,vals[0].address,
        [[vals[1].address, 
        new Coin("uluna", "4000")]]
    ))


    await mustPass(redistribute(
        testState.lcdClient,
        testState.multisigPublikKey,
        testState.multisigKeys,
        testState.basset.contractInfo.lido_terra_hub.contractAddress,
        validators.map((v) => {
            return {
                validator: v.address,
                amount: Number(v.total_delegated)
            }
        })
    ))

    // we are redelegating to val1 (line34) - terravaloper180darp2tj7ns48r0s3l3u8a2ygxjyycsjmyhzz
    // 4000 uluna and we can not to redelegate from him
    // our delegation state should be
    let expected_validator_state = [{
        total_delegated: "1100000000",
        address: "terravaloper1utdag7jnhp9zy667z78dt8hnnud2mu7vax5rsn"
    },
    {
        total_delegated: "1199996000",
        address: "terravaloper188p7d0w6948y8p4cg5p3m6zx8lzzg8r0vt47ms"
    },
    {
        total_delegated: "1200000000",
        address: "terravaloper1yg247q4kecqnktp2rte030yy43gpj0c9nm5nug"
    },
    {
        total_delegated: "1300004000",
        address: "terravaloper180darp2tj7ns48r0s3l3u8a2ygxjyycsjmyhzz"
    }
    ]

    validators = await querier.get_validators_for_delegation()
    for (let i = 0; i < validators.length; i++) {
        assert.equal(
            Number(validators[i].total_delegated),
            Number(expected_validator_state.find((v) => {
                if (v.address == validators[i].address) {
                    return true
                }
            }).total_delegated)
        )
    }

    let counter = 0
    let threshold = 15
    console.log('waiting all redelegations have completed')
    while (counter < threshold) {
        let [redelegations, pagination] = await testState.lcdClient.staking.redelegations(testState.basset.contractInfo.lido_terra_hub.contractAddress)
        if (redelegations.length == 0) {
            break
        }
        counter++
        console.log(counter)
        await sleep(1000)
    }
    // and redelegating again
    validators = await querier.get_validators_for_delegation()
    await mustPass(redistribute(
        testState.lcdClient,
        testState.multisigPublikKey,
        testState.multisigKeys,
        testState.basset.contractInfo.lido_terra_hub.contractAddress,
        validators.map((v) => {
            return {
                validator: v.address,
                amount: Number(v.total_delegated)
            }
        })
    ))
    validators = await querier.get_validators_for_delegation()
    for (let i = 0; i < validators.length; i++) {
        assert.equal(
            Number(validators[i].total_delegated),
            1_200_000_000
        )
    }
}

if (require.main === module) {
    main()
        .then(() => console.log("done"))
        .catch(console.log);
}
