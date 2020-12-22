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
        {state:{}},
        client
    ).then(r => r.global_index)

    //
    const holder_map: { [address: string]: { balance: string, index: string, pending_reward: string }} = {}
    addresses.forEach(async address => {
        const balance = await makeContractStoreQuery(
            contracts.bAssetToken,
            {balance:{address: address}},
            client
        ).then(r => r.balance)

        const indexAndPendingReward = await makeContractStoreQuery(
            contracts.bAssetReward,
            {holder:{address:address}},
            client
        ).then(r => ({
            index: r.index,
            pending_reward: r.pending_rewards
        }))

        holder_map[address] = {
            balance,
            ...indexAndPendingReward,
        }
    })

    // undelegation_waitlist,
    const undelegation_waitlist = (await Promise.all(addresses.map(address => {
        return makeContractStoreQuery(
            contracts.bLunaHub,
            { unbond_requests: { address: address } },
            client
        )
    }))).reduce((m, current) => {
        const why = current.requests.reduce((m, l) => {
            m[l[0]] = l[1]
            return m
        }, {} as { [epoch: string]: string })

        m[current.address] = why
        return m
    }, {} as { [address: string]: { [epoch: string]: string } })

    // undelegated_so_far

    return {
        epoch_id,
        whitelist,
        total_bond_amount,
        total_issued,
        exchange_rate,
        balance,
        global_index,
        undelegation_waitlist,
        holder_map
    }
}
