# Testset for test columbus-5 bAsset contracts

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