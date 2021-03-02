import { GraphQLClient } from "graphql-request";
import { makeContractStoreQuery, makeBalanceQuery } from "./common";
import { Addresses, Contracts, Validators } from "./types";

export async function getMoneyMarketState(
  client: GraphQLClient,
  addresses: Addresses,
  validators: Validators,
  contracts: Contracts
) {
  // total_liabilities, total_reserve, last_interest_updated, global_interest_index
  const moneyMarketState = await makeContractStoreQuery(
    contracts.mmMarket,
    {
      state: {},
    },
    client
  );

  const aust_supply = await makeContractStoreQuery(
    contracts.anchorToken,
    {
      token_info: {},
    },
    client
  ).then((r) => r.total_supply);

  const oraclePrice = await makeContractStoreQuery(
    contracts.mmOracle,
    {
      price: {
        base: contracts.bAssetToken,
        quote: "uusd",
      },
    },
    client
  ).catch(() => 0);

  const marketBalance = await makeBalanceQuery(contracts.mmMarket, client);

  const custodyBalance = await makeBalanceQuery(contracts.mmCustody, client);

  const overseerBalance = await makeBalanceQuery(contracts.mmOverseer, client);

  const borrowerinfoMap = await makeContractStoreQuery(
    contracts.mmMarket,
    { borrower_infos: {} },
    client
  ).then((r) => {
    return r.borrower_infos.reduce((m, entity) => {
      m[entity.borrower] = {
        interest_index: entity.interest_index,
        reward_index: entity.reward_index,
        loan_amount: entity.loan_amount,
        pending_rewards: entity.pending_rewards
      };

      return m;
    }, {} as { [address: string]: { interest_index: string; reward_index: string; loan_amount: string; pending_rewards: string; } });
  });

  const borrowerMap = await makeContractStoreQuery(
    contracts.mmCustody,
    { borrowers: {} },
    client
  ).then((r) => {
    return r.borrowers.reduce((m, entity) => {
      m[entity.borrower] = {
        balance: entity.balance,
        spendable: entity.spendable,
      };

      return m;
    }, {} as { [address: string]: { balance: number; spendable: number } });
  });

  const atoken_holder_map: { [address: string]: { balance: number } } = {};
  Promise.resolve()
    .then(() =>
      makeContractStoreQuery(
        contracts.anchorToken,
        { all_accounts: {} },
        client
      )
    )
    .then((r) => r.accounts)
    .then((accounts) =>
      accounts.map(async (holder) => {
        const balance = await makeContractStoreQuery(
          contracts.anchorToken,
          { balance: { address: holder } },
          client
        );

        atoken_holder_map[holder] = { balance: balance.balance };
      })
    );

  const overseerEpochState = await makeContractStoreQuery(
    contracts.mmOverseer,
    { epoch_state: {} },
    client
  );

  const collateralMap = await makeContractStoreQuery(
    contracts.mmOverseer,
    { all_collaterals: {} },
    client
  ).then((r) => {
    return r.all_collaterals.reduce((m, entry) => {
      m[entry.borrower] = {
        // NOTE: BLUNA ONLY FOR NOW
        // if other bAssets are allowed, we need to change this reduce func
        collateral: entry.collaterals[0][0],
        amount: entry.collaterals[0][1],
      };
      return m;
    }, {} as { [address: string]: { collateral: string; amount: number } });
  });


  // Config {},
  // LiquidationAmount {
  //     borrow_amount: Uint256,
  //     borrow_limit: Uint256,
  //     collaterals: TokensHuman,
  //     collateral_prices: Vec<Decimal256>,
  // },
  // Bid {
  //     collateral_token: HumanAddr,
  //     bidder: HumanAddr,
  // },
  // BidsByUser {
  //     bidder: HumanAddr,
  //     start_after: Option<HumanAddr>,
  //     limit: Option<u32>,
  // },
  // BidsByCollateral {
  //     collateral_token: HumanAddr,
  //     start_after: Option<HumanAddr>,
  //     limit: Option<u32>,
  // },

  const liquidation_config = await makeContractStoreQuery(
    contracts.mmLiquidation,
    { config: {} },
    client
  )

  const liquidation_bids = await Promise.all(addresses.map(async address => {
    return await makeContractStoreQuery(
      contracts.mmLiquidation,
      {
        bid: {
          collateral_token: contracts.bAssetToken,
          bidder: address
        }
      },
      client
    ).catch(() => null)
  }))

  const liquidation_bids_by_user = await Promise.all(addresses.map(async address => {
    return await makeContractStoreQuery(
      contracts.mmLiquidation,
      {
        bids_by_user: {
          bidder: address,
        }
      },
      client
    ).catch(() => null)
  }))

  const liquidation_bids_by_collateral = await makeContractStoreQuery(
    contracts.mmLiquidation,
    {
      bids_by_collateral: {
        collateral_token: contracts.bAssetToken
      }
    },
    client
  ).then(() => ({}))

  return {
    ...moneyMarketState,
    aust_supply,
    oraclePrice,
    marketBalance,
    custodyBalance,
    overseerBalance,
    borrowerinfoMap,
    borrowerMap,
    atoken_holder_map,
    ...overseerEpochState,
    collateralMap,
    liquidation_config,
    liquidation_bids,
    liquidation_bids_by_collateral,
    liquidation_bids_by_user
    // borrow_rate,
  };
}
