import { GraphQLClient } from "graphql-request";
import { makeBalanceQuery, makeContractStoreQuery, makeQuery } from "./common";
import { Addresses, Contracts, Validators } from "./types";

export const getBlunaState = async (
    client: GraphQLClient,
    addresses: Addresses,
    validators: Validators,
    contracts: Contracts,
) => {
    const epoch_id = await makeContractStoreQuery(
        contracts.bLunaHub,
        {current_epoch:{}},
        client
    ).catch(() => {})

    const whitelist = await makeContractStoreQuery(
        contracts.bLunaHub,
        {whitelisted_validators:{}},
        client
    )

    const total_bond_amount = await makeContractStoreQuery(
        contracts.bLunaHub,
        {total_bonded: {}},
        client
    )

    const total_issued = await makeContractStoreQuery(
        contracts.bAssetToken,
        {token_info:{}},
        client
    )

    const exchange_rate = await makeContractStoreQuery(
        contracts.bLunaHub,
        {exchange_rate:{}},
        client
    ).then(r => r.rate)

    const balance = await makeBalanceQuery(
        contracts.bAssetReward,
        client
    )

    const global_index = await makeContractStoreQuery(
        contracts.bAssetReward,
        {global_index:{}},
        client
    )

    //
    const holder_map: { [address: string]: { balance: string, index: string, pending_reward: string }} = {}
    addresses.forEach(async address => {
        const balance = await makeContractStoreQuery(
            contracts.bAssetToken,
            {balance:{address: address}},
            client
        ).then(r => r.balance)

        const index = await makeContractStoreQuery(
            contracts.bAssetReward,
            {user_index:{address:address}},
            client
        ).then(r => r.index)

        const pending_reward = await makeContractStoreQuery(
            contracts.bAssetReward,
            {pending_rewards:{address:address}},
            client
        ).then(r => r.reward)

        holder_map[address] = {
            balance,
            index,
            pending_reward
        }
    })

    // undelegation_waitlist,
    // undelegated_so_far

    return {
        epoch_id,
        whitelist,
        total_bond_amount,
        total_issued,
        exchange_rate,
        balance,
        global_index,
        holder_map
    }
}
