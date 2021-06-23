import { gql, GraphQLClient } from "graphql-request";

export const makeQuery = (
  query: string,
  variables: object,
  client: GraphQLClient
) =>
  client.request(query, variables).catch((e) => {
    //
  });

export const makeBalanceQuery = (address: string, client: GraphQLClient) =>
  makeQuery(
    gql`
      query($address: String!) {
        Response: BankBalancesAddress(Address: $address) {
          Result {
            Denom
            Amount
          }
        }
      }
    `,
    { address },
    client
  );


export const makeContractStoreQuery = (
  contractAddress: string,
  queryMsg: object,
  client: GraphQLClient
) => {
  return makeQuery(
    gql`
      query($contractAddress: String!, $queryMsg: String!) {
        Response: WasmContractsContractAddressStore(
          ContractAddress: $contractAddress
          QueryMsg: $queryMsg
        ) {
          Result
        }
      }
    `,
    {
      contractAddress,
      queryMsg: JSON.stringify(queryMsg),
    },
    client
  ).then((r) => JSON.parse(r.Response.Result));
  }