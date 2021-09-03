# Testset for test columbus-5 bAsset contracts

# LocalTerra
## To make it work:
1) Clone repository and install or update dependencies with command
```
yarn install
```
2) Put lido bAsset artifacts in `./anchor-bAsset-contracts/artifacts` dir
3) Clone locale terra `https://github.com/terra-money/LocalTerra`
4) Update some params to speed up localterra network
    1) file `./config/genesis.json` you could update `unbonding_time` to the same value, bAssetHubContract has, lets say - 20s
    2) file `./config/config.toml` timeout parameters in `consensus` block
    ```
    + timeout_propose = "200ms"
    + timeout_propose_delta = "200ms"
    + timeout_prevote = "200ms"
    + timeout_prevote_delta = "200ms"
    + timeout_precommit_delta = "200ms"
    + timeout_commit = "200ms"
    ```
5) run `docker-compose up`

you are ready to run tests
the only one is workong right now is `./src/testcases/bluna_short_test.ts`

```
npx ts-node ./src/testcases/bluna_short_test.ts
```

The main difference between mantle sdk testkit and localterra testkit is in mantle sdk we are injecting accounts and validators and their behavior in network, while in localterra we are using predefined accounts

# Local TestNet - 4 validators set
## To make it work:
1) Clone repository and install or update dependencies with command
```shell
yarn install
```
2) Put lido bAsset artifacts in `./anchor-bAsset-contracts/artifacts` dir
3) To start the 4-set validators environment - run `make start` in the `testkit` dir. Keep in mind, `http://192.168.10.2:1317/oracle/denoms/exchange_rates` starts work after 30-45 blocks(and the same amount of seconds), update_global_index needs the endpoint to work, for most of the testcases this does not matter, but if you want to call update_global_index soon after test starts, give some time to env get ready, to check oracles endpoint you can run 
```shell
$ make oracle_status
```
and see
```shell
curl http://192.168.10.2:1317/oracle/denoms/exchange_rates
{"height":"927","result":[
  {
    "denom": "ukrw",
    "amount": "37448.842927253220580494"
  },
  {
    "denom": "umnt",
    "amount": "92371.292031605468186648"
  },
  {
    "denom": "usdr",
    "amount": "22.762391055342055070"
  },
  {
    "denom": "uusd",
    "amount": "32.400734854805658804"
  }
]}
```
4) run the tests
    working now
    `./src/testcases/bluna_short_test.ts`
    `./src/testcases/bluna_longrun_test.ts`
    `./src/testcases/stluna_longrun_test.ts`
    `./src/testcases/stluna_short_test.ts`
5) recommended to clear env with `make stop && make start` before each testrun