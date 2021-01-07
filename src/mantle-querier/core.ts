import { gql, GraphQLClient } from "graphql-request";
import { makeBalanceQuery, makeQuery } from "./common";
import { Addresses, Contracts, Validators } from "./types";
import * as b32 from "bech32";

import { getUnixTime } from "date-fns";

export const getCoreState = async (
  client: GraphQLClient,
  addresses: Addresses,
  validators: Validators,
  contracts: Contracts
) => {
  const block = await makeQuery(
    gql`
      query {
        BlockState {
          Block {
            Header {
              Time
              ProposerAddress
            }
          }
        }
      }
    `,
    {},
    client
  ).then((r) => ({
    block_time: getUnixTime(new Date(r.BlockState.Block.Header.Time)),
    block_proposer: b32.encode(
      "terravaloper",
      b32.toWords(r.BlockState.Block.Header.ProposerAddress)
    ),
  }));

  const oracle_price = await makeQuery(
    gql`
      query {
        OracleDenomsExchangeRates {
          Result {
            Denom
            Amount
          }
        }
      }
    `,
    {},
    client
  ).then((r) => r.Result);

  const reward = await makeQuery(
    gql`
      query($validatorAddr: String!, $delegatorAddr: String!) {
        DistributionDelegatorsDelegatorAddrRewardsValidatorAddr(
          ValidatorAddr: $validatorAddr
          DelegatorAddr: $delegatorAddr
        ) {
          Result {
            Denom
            Amount
          }
        }
      }
    `,
    {
      validatorAddr: validators[0],
      delegatorAddr: contracts.bLunaHub,
    },
    client
  )
    .then(
      (r) => r.DistributionDelegatorsDelegatorAddrRewardsValidatorAddr.Result
    )
    .then((rs) => rs.map((r) => ({ denom: r.Denom, amount: r.Amount })))
    .catch(() => { });

  const validator_info: any = await (async () => {
    const validator_list = await makeQuery(
      gql`
        query {
          StakingValidators {
            Height
            Result {
              OperatorAddress
              Commission {
                CommissionRates {
                  Rate
                }
              }
            }
          }
        }
      `,
      {},
      client
    );

    const fin = validator_list.StakingValidators.Result.map(
      async ({ OperatorAddress, Commission }) => {
        const validator_specific = await makeQuery(
          gql`
            query($OperatorAddress: String!) {
              DistributionValidatorsValidatorAddrOutstandingRewards(
                ValidatorAddr: $OperatorAddress
              ) {
                Result {
                  Denom
                  Amount
                }
              }

              StakingValidatorsValidatorAddrDelegations(
                ValidatorAddr: $OperatorAddress
              ) {
                Result {
                  DelegatorAddress
                  Balance {
                    Amount
                  }
                }
              }
            }
          `,
          { OperatorAddress },
          client
        );

        return {
          valaddr: OperatorAddress,
          commission: Commission.CommissionRates.Rate,
          rewardsPool: {
            denoms: validator_specific.DistributionValidatorsValidatorAddrOutstandingRewards.Result.map(
              (k) => ({
                denom: k.Denom,
                amount: k.Amount,
              })
            ),
          },
          delegators: validator_specific.StakingValidatorsValidatorAddrDelegations.Result.reduce(
            (m, k) => {
              m[k.DelegatorAddress] = (k.Balance || {}).Amount || 0;
              return m;
            },
            {}
          ),
        };
      }
    );

    return await (await Promise.all(fin)).reduce((m, i: any) => {
      m[i.valaddr] = i;
      return m;
    }, {});
  })();

  // accounts balance
  const accountBalances = await Promise.resolve()
    .then(() =>
      Promise.all(
        addresses.map(async (address) => ({
          address,
          result: await makeBalanceQuery(address, client),
        }))
      )
    )
    .then((balances) =>
      balances.map((accbal) => ({
        address: accbal.address,
        balance: accbal.result.Response.Result,
      }))
    );

  return {
    ...block,
    oracle_price,
    reward,
    ...validator_info,
    accountBalances,
  };
};
