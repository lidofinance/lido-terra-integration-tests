import { GraphQLClient } from "graphql-request";
import { makeContractStoreQuery, makeBalanceQuery } from "./common";
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

    const marketBalance = await makeBalanceQuery(
        contracts.mmMarket,
        client
    )

    const custodyBalance = await makeBalanceQuery(
        contracts.mmCustody,
        client
    )

    const overseerBalance = await makeBalanceQuery(
        contracts.mmOverseer,
        client
    )

    const liabilityMap = await makeContractStoreQuery(
        contracts.mmMarket,
        { liabilities: {} },
        client
    ).then(r => {
        r.liabilities.reduce((m, entity) => {
            m[entity.borrower] = {
                interest_index: m.interest_index,
                loan_amount: m.loan_amount
            }

            return m
        }, {} as { [address: string]: { interest_index: string, loan_amount: string } })
    })

    const borrowerMap = await makeContractStoreQuery(
        contracts.mmCustody,
        { borrowers: {} },
        client
    ).then(r => {
        r.borrowers.reduce((m, entity) => {
            m[entity.borrower] = {
                balance: entity.balance,
                spendable: entity.spendable
            }

            return m
        }, {} as { [address: string]: { balance: number, spendable: number } })
    })

    const atoken_holder_map: { [address: string]: { balance: number } } = {}
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

            atoken_holder_map[holder] = { balance: balance.balance }
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
    ).then(r => {
        r.all_collaterals.reduce((m, entry) => {
            m[entry.borrower] = {
                // NOTE: BLUNA ONLY FOR NOW
                // if other bAssets are allowed, we need to change this reduce func
                collateral: entry.collaterals[0][0],
                amount: entry.collaterals[0][1]
            }
            return m
        }, {} as { [address: string]: { collateral: string, amount: number } })
    })

    // const borrow_rate = await makeContractStoreQuery(
    //     contracts.mmInterest,
    //     {
    //         borrow_rate: {
    //             market_balance: marketBalance.Response.Result[0].Amount,
    //             total_liabilities: moneyMarketState.total_liabilities,
    //             total_reserve: moneyMarketState.total_reserves
    //         }
    //     },
    //     client
    // ).then(r => r.rate)

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
        // borrow_rate,
    }
}
