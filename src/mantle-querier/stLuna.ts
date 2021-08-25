import { GraphQLClient } from "graphql-request";
import { makeBalanceQuery, makeContractStoreQuery, makeQuery } from "./common";
import { Addresses, Contracts, Validators } from "./types";

export const getStlunaState = async (
    client: GraphQLClient,
    addresses: Addresses,
    validators: Validators,
    contracts: Contracts
) => {
    const total_stluna_issued = await makeContractStoreQuery(
        contracts.stLunaToken,
        { token_info: {} },
        client
    );


    const stLuna_holders: {
        [address: string]: {
            balance: string;
        };
    } = {};

    for (const address of addresses) {
        const balance = await makeContractStoreQuery(
            contracts.stLunaToken,
            { balance: { address: address } },
            client
        ).then((r) => r.balance);

        stLuna_holders[address] = {
            balance,
        };
    }

    return {
        total_stluna_issued,
        stLuna_holders,
    };
};
