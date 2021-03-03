import { GraphQLClient } from "graphql-request";
import { makeBalanceQuery, makeContractStoreQuery, makeQuery } from "./common";
import { Addresses, Contracts, Validators } from "./types";

export const getANCState = async (
    client: GraphQLClient,
    addresses: Addresses,
    validators: Validators,
    contracts: Contracts
) => {
    const anc_holder_map: {
        [address: string]: {
            balance: string;
        };
    } = {};
    addresses.forEach(async (address) => {
        const balance = await makeContractStoreQuery(
            contracts.token,
            { balance: { address: address } },
            client
        ).then((r) => r.balance);


        anc_holder_map[address] = {
            balance,
        };
    });

    const gov_state= await makeContractStoreQuery(
        contracts.gov,
        { state: {} },
        client
    ).catch(() => { });


    const gov_polls= await makeContractStoreQuery(
        contracts.gov,
        { polls: {} },
        client
    ).catch(() => { });



    const staker_map: {
        [address: string]: {
            staker: any
        };
    } = {};

    addresses.forEach(async (address) => {
        const staker = await makeContractStoreQuery(
            contracts.gov,
            { staker: { address: address} },
            client
        ).then((r) => r.balance);


        staker_map[address] = {
            staker
        };
    });


    const staking_state= await makeContractStoreQuery(
        contracts.staking,
        { state: {} },
        client
    ).catch(() => { });

    const staker_info_map: {
        [address: string]: {
            staker_info: any
        };
    } = {};

    addresses.forEach(async (address) => {
        const staker_info = await makeContractStoreQuery(
            contracts.staking,
            { staker_info: { staker: address} },
            client
        ).then((r) => r.balance);


        staker_info_map[address] = {
            staker_info
        };
    });

    return {
        anc_holder_map,
        gov_state,
        gov_polls,
        staker_map,
        staking_state,
        staker_info_map
    }
}