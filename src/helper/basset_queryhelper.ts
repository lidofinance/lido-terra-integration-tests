import { Validator as QueryValidator } from "./types/validators_registry/validator";
import { LoneSchemaDefinitionRule } from "graphql";
import { GraphQLClient } from "graphql-request";
import { makeContractStoreQuery } from "../mantle-querier/common";
import { Testkit } from "../testkit/testkit";
import AnchorbAsset from "./basset_helper";
import { AllowanceResponse } from "./types/cw20_token/allowance_response";
import { AllAccountsResponse } from "./types/cw20_token/all_accounts_response";
import { AllAllowancesResponse } from "./types/cw20_token/all_allowances_response";
import { TokenInfoResponse } from "./types/cw20_token/token_info_response";
import { MinterResponse } from "./types/cw20_token/token_init_msg";
import { QueryMsg as ValidatorsQueryMsg } from "./types/validators_registry/query_msg";
import { HolderResponse, HoldersResponse } from "./types/basset_reward/holders_response";

import { QueryMsg as BlunaQueryMsg } from "./types/basset_reward/query_msg";
import { QueryMsg as AnchotBassetHubQueryMsg } from "./types/anchor_basset_hub/query_msg";
import { StateResponse } from "./types/basset_reward/state_response";
import { ConfigResponse } from "./types/basset_reward/config_response";
import { State } from "./types/anchor_basset_hub/state";
import { AccruedRewardsResponse } from "./types/basset_reward/accrued_rewards_response";
import { AllHistoryResponse } from "./types/anchor_basset_hub/all_history_response";
import { UnbondRequestsResponse } from "./types/anchor_basset_hub/unbond_requests_response";
import { WithdrawableUnbondedResponse } from "./types/anchor_basset_hub/withdrawable_unbonded_response";

//npx json2ts -i anchor-bAsset-contracts/contracts/anchor_basset_token/schema/ -o src/helper/types/bluna_token/


class TokenQuerier {
    token_address: string;
    mantleClient: GraphQLClient

    constructor(token_address: string, mantleClient: GraphQLClient) {
        this.token_address = token_address;
        this.mantleClient = mantleClient;
    }

    async query(msg: object): Promise<any> {
        return makeContractStoreQuery(
            this.token_address,
            msg,
            this.mantleClient
        )
    }

    // Returns the current balance of the given address, 0 if unset.
    public async balance(address: string): Promise<number> {
        return this.query(
            {
                balance: {
                    address: address
                }
            }
        ).then((b) => Number(b.balance))
    }
    // Returns metadata on the contract - name, decimals, supply, etc. Return type: TokenInfoResponse.
    public async token_info(): Promise<TokenInfoResponse> {
        return this.query({
            token_info: {},
        }).then(r => r as TokenInfoResponse)
    }

    // Only with "mintable" extension. Returns who can mint and how much. Return type: MinterResponse.
    public async minter(): Promise<MinterResponse> {
        return this.query({
            minter: {},
        }).then(r => r as MinterResponse)
    }

    // Only with "allowance" extension. Returns how much spender can use from owner account, 0 if unset. Return type: AllowanceResponse.
    public async allowance(owner_address: string, spender_address: string): Promise<AllowanceResponse> {
        return this.query({
            allowance: {
                owner: owner_address,
                spender: spender_address,
            },
        }).then(r => r as AllowanceResponse)
    }

    // Only with "enumerable" extension (and "allowances") Returns all allowances this owner has approved. Supports pagination. Return type: AllAllowancesResponse.
    public async all_allowances(owner_address: string, limit?: number, start_after_addr?: string): Promise<AllAllowancesResponse> {
        return this.query({
            all_allowances: {
                owner: owner_address,
                limit: limit,
                start_after: start_after_addr,
            },
        }).then(r => r as AllAllowancesResponse)
    }
    // Only with "enumerable" extension Returns all accounts that have balances. Supports pagination. Return type: AllAccountsResponse.
    public async all_accounts(limit?: number, start_after_addr?: string): Promise<AllAccountsResponse> {
        return this.query({
            all_accounts: {
                limit: limit,
                start_after: start_after_addr
            },
        }).then(r => r as AllAccountsResponse)
    }
}

export default class AnchorbAssetQueryHelper {
    testkit: Testkit
    mantleClient: GraphQLClient
    basset: AnchorbAsset
    bluna_token_querier: TokenQuerier
    stluna_token_querier: TokenQuerier

    constructor(testkit: Testkit, basset: AnchorbAsset) {
        this.testkit = testkit;
        this.basset = basset;
        this.mantleClient = new GraphQLClient(this.testkit.deriveMantle());
        this.bluna_token_querier = new TokenQuerier(this.basset.contractInfo.anchor_basset_token.contractAddress, this.mantleClient)
        this.stluna_token_querier = new TokenQuerier(this.basset.contractInfo.anchor_basset_token_stluna.contractAddress, this.mantleClient)
    }

    async bassethubquery(msg: AnchotBassetHubQueryMsg): Promise<any> {
        return makeContractStoreQuery(
            this.basset.contractInfo.anchor_basset_hub.contractAddress,
            msg,
            this.mantleClient
        )
    }

    async get_anchor_basset_hub_state(): Promise<State> {
        return this.bassethubquery({
            state: {}
        }).then(r => r as State)
    }

    async blunarewardquery(msg: BlunaQueryMsg): Promise<any> {
        return makeContractStoreQuery(
            this.basset.contractInfo.anchor_basset_reward.contractAddress,
            msg,
            this.mantleClient
        )
    }

    async validatorsquery(msg: ValidatorsQueryMsg): Promise<any> {
        return makeContractStoreQuery(
            this.basset.contractInfo.anchor_basset_validators_registry.contractAddress,
            msg,
            this.mantleClient
        )
    }

    /* BEGIN. CW20 compatible tokens(bluna and stluna) helpers */

    // Returns the current bluna balance of the given address, 0 if unset.
    public async balance_bluna(address: string): Promise<number> {
        return this.bluna_token_querier.balance(address)
    }

    // Returns the current stluna balance of the given address, 0 if unset.
    public async balance_stluna(address: string): Promise<number> {
        return this.stluna_token_querier.balance(address)
    }

    // Returns metadata on the bluna contract - name, decimals, supply, etc. Return type: TokenInfoResponse.
    public async token_info_bluna(): Promise<TokenInfoResponse> {
        return this.bluna_token_querier.token_info()
    }

    // Returns metadata on the stluna contract - name, decimals, supply, etc. Return type: TokenInfoResponse.
    public async token_info_stluna(): Promise<TokenInfoResponse> {
        return this.stluna_token_querier.token_info()
    }

    // Only with "mintable" extension. Returns who can mint bluna and how much. Return type: MinterResponse.
    public async minter_bluna(): Promise<MinterResponse> {
        return this.bluna_token_querier.minter()
    }

    // Only with "mintable" extension. Returns who can mint stluna and how much. Return type: MinterResponse.
    public async minter_stluna(): Promise<MinterResponse> {
        return this.stluna_token_querier.minter()
    }

    // Only with "allowance" extension. Returns how much spender can use from owner bluna account, 0 if unset. Return type: AllowanceResponse.
    public async allowance_bluna(owner_address: string, spender_address: string): Promise<AllowanceResponse> {
        return this.bluna_token_querier.allowance(owner_address, spender_address)
    }

    // Only with "allowance" extension. Returns how much spender can use from owner stluna account, 0 if unset. Return type: AllowanceResponse.
    public async allowance_stluna(owner_address: string, spender_address: string): Promise<AllowanceResponse> {
        return this.stluna_token_querier.allowance(owner_address, spender_address)
    }

    // Only with "enumerable" extension (and "allowances") Returns all allowances this owner has approved on the bluna contract. Supports pagination. Return type: AllAllowancesResponse.
    public async all_allowances_bluna(owner_address: string, limit?: number, start_after_addr?: string): Promise<AllAllowancesResponse> {
        return this.bluna_token_querier.all_allowances(owner_address, limit, start_after_addr)
    }

    // Only with "enumerable" extension (and "allowances") Returns all allowances this owner has approved on the stluna contract. Supports pagination. Return type: AllAllowancesResponse.
    public async all_allowances_stluna(owner_address: string, limit?: number, start_after_addr?: string): Promise<AllAllowancesResponse> {
        return this.stluna_token_querier.all_allowances(owner_address, limit, start_after_addr)
    }


    // Only with "enumerable" extension Returns all accounts that have balances on the bluna contract. Supports pagination. Return type: AllAccountsResponse.
    public async all_accounts_bluna(limit?: number, start_after_addr?: string): Promise<AllAccountsResponse> {
        return this.bluna_token_querier.all_accounts(limit, start_after_addr)
    }

    // Only with "enumerable" extension Returns all accounts that have balances on the stluna contract. Supports pagination. Return type: AllAccountsResponse.
    public async all_accounts_stluna(limit?: number, start_after_addr?: string): Promise<AllAccountsResponse> {
        return this.stluna_token_querier.all_accounts(limit, start_after_addr)
    }

    /* END. CW20 compatible tokens(bluna and stluna) helpers */



    public async get_validators_for_delegation(): Promise<Array<QueryValidator>> {
        return this.validatorsquery(
            {
                get_validators_for_delegation: {}
            }
        ).then(r => r as Array<QueryValidator>)
    }

    public async holder(address: string): Promise<HolderResponse> {
        return this.blunarewardquery(
            {
                holder: {
                    address: address
                }
            }
        ).then(r => r as HolderResponse)
    }

    public async holders(): Promise<HoldersResponse> {
        return this.blunarewardquery(
            { holders: {} }
        ).then(r => r as HoldersResponse)
    }

    public async bluna_reward_state(): Promise<StateResponse> {
        return this.blunarewardquery(
            { state: {} }
        ).then(r => r as StateResponse)
    }

    public async bluna_reward_config(): Promise<ConfigResponse> {
        return this.blunarewardquery(
            { config: {} }
        ).then(r => r as ConfigResponse)
    }

    public async bluna_accrued_reward(address: string): Promise<AccruedRewardsResponse> {
        return this.blunarewardquery(
            {
                accrued_rewards: {
                    address: address
                }
            }
        ).then(r => r as AccruedRewardsResponse)
    }

    public async bluna_exchange_rate(): Promise<number> {
        return this.get_anchor_basset_hub_state()
            .then(r => Number(r.bluna_exchange_rate))
    }

    public async stluna_exchange_rate(): Promise<number> {
        return this.get_anchor_basset_hub_state()
            .then(r => Number(r.stluna_exchange_rate))
    }

    public async total_bond_bluna_amount(): Promise<number> {
        return this.get_anchor_basset_hub_state()
            .then(r => Number(r.total_bond_bluna_amount))
    }

    public async total_bond_stluna_amount(): Promise<number> {
        return this.get_anchor_basset_hub_state()
            .then(r => Number(r.total_bond_stluna_amount))
    }



    public async all_history(limit?: number, start_from?: number): Promise<AllHistoryResponse> {
        return this.bassethubquery(
            {
                all_history: {
                    limit: limit,
                    start_from: start_from,
                }
            }
        ).then(r => r as AllHistoryResponse)
    }

    public async unbond_requests(address: string): Promise<UnbondRequestsResponse> {
        return this.bassethubquery(
            {
                unbond_requests: {
                    address: address,
                }
            }
        ).then(r => r as UnbondRequestsResponse)
    }

}
