import { GraphQLClient } from "graphql-request";
import { makeBalanceQuery, makeContractStoreQuery, makeQuery } from "./common";
import { Addresses, Contracts, Validators } from "./types";

export const getBlunaState = async (
  client: GraphQLClient,
  addresses: Addresses,
  validators: Validators,
  contracts: Contracts
) => {
  const epoch_id = await makeContractStoreQuery(
    contracts.bLunaHub,
    { current_batch: {} },
    client
  ).catch(() => { });

  const state = await makeContractStoreQuery(
    contracts.bLunaHub,
    { state: {} },
    client
  );

  const total_issued = await makeContractStoreQuery(
    contracts.bAssetToken,
    { token_info: {} },
    client
  );

  const balance = await makeBalanceQuery(contracts.bAssetReward, client);

  const global_index = await makeContractStoreQuery(
    contracts.bAssetReward,
    { state: {} },
    client
  ).then((r) => r.global_index);


  const holder_map: {
    [address: string]: {
      balance: string;
      index: string;
      pending_reward: string;
    };
  } = {};

  for (const address of addresses) {
    const balance = await makeContractStoreQuery(
      contracts.bAssetToken,
      { balance: { address: address } },
      client
    ).then((r) => r.balance);

    const indexAndPendingReward = await makeContractStoreQuery(
      contracts.bAssetReward,
      { holder: { address: address } },
      client
    ).then((r) => ({
      index: r.index,
      pending_reward: r.pending_rewards,
    }));

    holder_map[address] = {
      balance,
      ...indexAndPendingReward,
    };
  }

  return {
    epoch_id,
    ...state,
    total_issued,
    balance,
    global_index,
    holder_map,
  };
};
