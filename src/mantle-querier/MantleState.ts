import { gql, GraphQLClient } from "graphql-request";
import { getBlunaState } from "./bLuna";
import { getCoreState } from "./core";
import { getMoneyMarketState } from "./money-market";
import { Addresses, Contracts, Validators } from "./types";

interface ContractAddresses {
    "bLunaHub": string,
    "bAssetToken": string,
    "bAssetReward": string,
    "bAssetAirdrop": string,
    "mmInterest": string,
    "mmOracle": string,
    "mmMarket": string,
    "mmOverseer": string,
    "mmCustody": string,
    "mmLiquidation": string,
    "mmdistribution":string,
    "anchorToken": string,
    "terraswapFactory": string,
    "terraswapPair": string,
    "gov": string,
    "faucet": string,
    "collector":string,
    "community":string,
    "staking": string,
    "token": string,
    "airdrop": string,
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

    async getCurrentBlockHeight(): Promise<number> {
        return this.client.request(gql`
            query {
                BlockState {
                    Block {
                        Header {
                            Height
                        }
                    }
                }
            }
        `, {}).then(r => r.BlockState.Block.Header.Height)
    }

    async query(gql: string, variables: object) {
        return this.client.request(gql, variables)
    }
}