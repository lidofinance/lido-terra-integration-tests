import { GraphQLClient } from "graphql-request";
import { getBlunaState } from "./bLuna";
import { getCoreState } from "./core";
import { getMoneyMarketState } from "./money-market";
import { Addresses, Contracts, Validators } from "./types";

interface ContractAddresses {
    "bLunaHub": string 
    "bAssetToken": string 
    "bAssetReward": string 
    "mmInterest": string 
    "mmOracle": string 
    "mmMarket": string 
    "mmOverseer": string 
    "mmCustody": string 
    "mmLiquidation": string 
    "anchorToken": string 
    "terraswapFactory": string 
    "terraswapPair": string 
}

export class MantleState {
    private contracts: Contracts
    private addresses: Addresses
    private validators: Validators
    private client: GraphQLClient

    constructor(
        contracts: ContractAddresses,
        addresses: string[],
        validators: string[],
        mantleEndpoint: string,
    ) {
        this.contracts = contracts
        this.addresses = addresses
        this.validators = validators
        this.client = new GraphQLClient(mantleEndpoint)
    }

    async getState() {
        return Promise.all([
            getMoneyMarketState(this.client, this.addresses, this.validators, this.contracts),
            getCoreState(this.client, this.addresses, this.validators, this.contracts),
            getBlunaState(this.client, this.addresses, this.validators, this.contracts)
        ]).then(([mm, core, bluna]) => ({
            ...mm,
            ...core,
            ...bluna
        }))
    }
}