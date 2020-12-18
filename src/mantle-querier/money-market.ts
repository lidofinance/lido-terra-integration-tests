import { GraphQLClient } from "graphql-request";
import { makeContractStoreQuery } from "./common";
import { Addresses, Contracts, Validators } from "./types";

export async function getMoneyMarketState(
    client: GraphQLClient,
    addresses: Addresses,
    validators: Validators,
    contracts: Contracts,
) {
    // total_liabilities, total_reserve, last_interest_updated, global_interest_index
    const moneyMarketState = await makeContractStoreQuery(
        contracts.mmMarket, {
            state: {}
        },
        client
    )

    const aust_supply = await makeContractStoreQuery(
        contracts.anchorToken, {
            token_info: {}
        },
        client
    ).then(r => r.total_supply)

    const oraclePrice = await makeContractStoreQuery(
        contracts.mmOracle, {
            price: {
                base: contracts.bAssetToken,
                quote: 'uusd'
            }
        },
        client
    ).catch(() => 0)

    const marketBalance = await makeContractStoreQuery(
        contracts.anchorToken,
        {
            balance: {
                address: contracts.mmMarket
            }
        },
        client
    )

    const custodyBalance = await makeContractStoreQuery(
        contracts.anchorToken,
        {
            balance: {
                address: contracts.mmCustody
            }
        },
        client
    )

    const overseerBalance = await makeContractStoreQuery(
        contracts.anchorToken,
        {
            balance: {
                address: contracts.mmOverseer
            }
        },
        client
    )

    const liabilityMap = await makeContractStoreQuery(
        contracts.mmMarket,
        {liabilities:{}},
        client
    )

    const borrowerMap = await makeContractStoreQuery(
        contracts.mmCustody,
        {borrowers:{}},
        client
    )

    const atoken_holder_map: { [address: string]: { balance: number }} = {}
    Promise.resolve()
        .then(() => makeContractStoreQuery(
            contracts.anchorToken,
            { all_accounts: {} },
            client
        ))
        .then(r => r.accounts)
        .then(accounts => accounts.map(async holder => {
            const balance = await makeContractStoreQuery(
                contracts.anchorToken,
                { balance: { address: holder } },
                client
            )

            atoken_holder_map[holder] = { balance: balance }
        }))

    const overseerEpochState = await makeContractStoreQuery(
        contracts.mmOverseer,
        { epoch_state: {} },
        client
    )

    const collateralMap = await makeContractStoreQuery(
        contracts.mmOverseer,
        { all_collaterals: {} },
        client
    )

    const borrow_rate = await makeContractStoreQuery(
        contracts.mmInterest,
        {
            borrow_rate: {
                market_balance: marketBalance.balance,
                total_liabilities: moneyMarketState.total_liabilities,
                total_reserve: moneyMarketState.total_reserves
            }
        },
        client
    ).then(r => r.rate)

    return {
        ...moneyMarketState,
        aust_supply,
        oraclePrice,
        marketBalance,
        custodyBalance,
        overseerBalance,
        liabilityMap,
        borrowerMap,
        atoken_holder_map,
        ...overseerEpochState,
        collateralMap,
        borrow_rate,
    }
}
