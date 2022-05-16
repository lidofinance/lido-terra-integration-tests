# Testset for test columbus-5 lido terra contracts

## Using integration tests in terra contracts GitHub actions
Contracts https://github.com/lidofinance/lido-terra-contracts use tests in the GitHub workflow and there is a requirement - merging pr into test repo before merging in contracts.

After contracts PR is merged, gh is looking for a target merge branch name in the test repo. In other words, in case if you have implemented a specific test in branch tests/A for specific update contracts/A, then at first you have to merge tests RP, wait until workflows succeed and only after that you may merge contracts branch.

# Local TestNet - 4 validators set
## To make it work:
1) Clone repository and install or update dependencies with command
```shell
yarn install
```
2) Put lido bAsset artifacts in `./lido-terra-contracts/artifacts` dir
### Run all test in parallel
Just run the command `npx ts-node ./src/testcases/testrunner.ts` and wait.
### Run test individually (for now manual setup is required)
1) To start the 4-set validators environment - run `make start` in the `testkit` dir. Keep in mind, `http://192.168.10.2:1317/oracle/denoms/exchange_rates` starts work after 30-45 blocks(and the same amount of seconds), update_global_index needs the endpoint to work, for most of the testcases this does not matter, but if you want to call update_global_index soon after test starts, give some time to env get ready, to check oracles endpoint you can run 
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
2) run any test in the testcases directory
3) recommended to clear env with `make stop && make start` before each testrun