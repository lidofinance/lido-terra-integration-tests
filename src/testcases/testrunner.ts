import {Fee, LCDClient, MnemonicKey, Msg, MsgSend, Wallet} from "@terra-money/terra.js";
import * as path from "path";
import {send_transaction} from "../helper/flow/execution";
import {mustPass} from "../helper/flow/must";
const execSync = require('child_process').execSync;

import BlunaShortTest from "./bluna_short_test";
import {predefinedKeys, globalWalletPool, sleep, uploadCode, faucetMnemonic} from "./common_localtestnet";
import STlunaShortTest from "./stluna_short_test"
import ConversionTest from "./conversion"
import PausableContractsTest from "./pausable_contracts"
import RedistributionsTest from "./redistribution"
import RewardsBlunaTest from "./rewards_bLuna"
import RewardDistributionMultipleDenomsTest from "./rewards_distribution_multiple_denoms"
import RewardDistributionSIngleDenomTest from "./rewards_distribution_single_denom"
import RewardStlunaTest from "./rewards_stLuna"
import SlashingOnBurnTest from "./slashing_on_burn"
import axios from "axios";

import BlunaLongRunningTest from "./bluna_longrun_test"
import StlunaLongRunningTest from "./stluna_longrun_test"
import SlashingTest from "./slashing"
import {createNodesConfigs, defaultProjConf} from "../utils/node_configurator";



const net = require('net');



export default async function isLCDReachable(port: number, host: string) {
    try {
        return await axios.get(`http://${host}:${port}/`).catch((err) => {
            /* 
                looking for 
                {
                    "code": 12,
                    "message": "Not Implemented",
                    "details": [
                    ]
                }
                501 swagger error to make sure its ready
            */
            return err.response.data.code == 12
        })
    } catch {
        return false
    }
}

const isOracleReachable = async (port: number, host: string) => {
    try {
        return await axios.get(`http://${host}:${port}/oracle/denoms/exchange_rates`).then((resp) => {
            return resp.data.result != null
        })
    } catch {
        return false
    }
}

const waitForPort = async (port = 1317, host = "localhost", threshold = 10): Promise<void> => {
    let c = 0
    while (true) {
        c++
        console.log("waiting for swagger ", c)
        if (threshold != undefined && c > threshold) {
            throw new Error(`timed out for waiting swagger ${host}:${port}`);
        }
        const reacheble = await isLCDReachable(port, host)
        if (reacheble) {
            break
        }
        await sleep(1000)
    }
}

const waitForOracles = async (port = 1317, host = "localhost", threshold = 10): Promise<void> => {
    let c = 0
    while (true) {
        c++
        console.log("waiting for oracle ", c)
        if (threshold != undefined && c > threshold) {
            throw new Error(`timed out for waiting oracles ${host}:${port}`);
        }
        const reacheble = await isOracleReachable(port, host)
        if (reacheble) {
            break
        }
        await sleep(1000)
    }
}

const docker_config = path.join(__dirname, "..", "..", "testkit", "docker-compose.yml")

const start_testnet = async () => {
    const confDir = createNodesConfigs(defaultProjConf)
    const stdout = execSync(`CONF_DIR=${confDir} docker-compose -f ${docker_config} up -d`);
    console.log(`${stdout}`)
}

const stop_testnet = async () => {
    const stdout = execSync(`docker-compose -f ${docker_config} down --remove-orphans`);
    console.log(`${stdout}`)
}

const isolated_runner = async (tests: Array<() => Promise<void>>) => {
    for (let i = 0; i < tests.length; i++) {
        const test = tests[i]
        await stop_testnet()
        await start_testnet()
        await waitForPort()
        await waitForOracles(1317, "localhost", 80)
        //give some time to start env
        await test()
        await stop_testnet()
    }
}

const configure_shared_testnet = async (walletPoolSize = 10): Promise<Record<string, number>> => {
    await stop_testnet()
    await start_testnet()
    //give some time to start env
    await waitForPort()
    await waitForOracles(1317, "localhost", 80)
    const chainID = "localnet"
    const URL = "http://127.0.0.1:1317/"
    const lcd = new LCDClient({
        chainID: chainID,
        URL: URL
    })
    const masterWallet = lcd.wallet(new MnemonicKey({mnemonic: faucetMnemonic}))
    let msgs: Msg[] = []
    for (let i = 0; i < walletPoolSize; i++) {
        const wallet = lcd.wallet(new MnemonicKey())
        globalWalletPool.push(wallet)
        msgs.push(new MsgSend(masterWallet.key.accAddress, wallet.key.accAddress, "100000000000000uusd,100000000000000uluna"))
    }
    const fixedFeeForInit = new Fee(600000000, "1000000000uusd");
    await mustPass(send_transaction(masterWallet, msgs, fixedFeeForInit))
    return uploadCode(path.resolve(__dirname, "../../lido-terra-contracts/artifacts"), masterWallet)
    // return {}
}

const shared_concurrent_runner = async (tests: Array<(contracts?: Record<string, number>) => Promise<void>>, contracts?: Record<string, number>) => {
    return Promise.all(
        tests.map((t) => t(contracts))
    )
}

const localtestnet_shared_testcases: Array<(contracts?: Record<string, number>) => Promise<void>> = [
    // BlunaShortTest,
    // STlunaShortTest,
    // ConversionTest,
    // PausableContractsTest,
    // RedistributionsTest,
    // RewardsBlunaTest,
    // RewardDistributionMultipleDenomsTest,
    // RewardDistributionSIngleDenomTest,
    // RewardStlunaTest,
    // SlashingOnBurnTest
]

const isolated_testcases: Array<() => Promise<void>> = [
    // StlunaLongRunningTest,
    // BlunaLongRunningTest,
    SlashingTest
]

// each test needs 6 wallets
configure_shared_testnet(localtestnet_shared_testcases.length * 6)
    .then((contracts) => {
        console.log("uploaded contracts ", contracts)
        return shared_concurrent_runner(localtestnet_shared_testcases, contracts)
    })
    .then(
        () => {return isolated_runner(isolated_testcases)}
    )
    .then(() => {console.log("done")})
    .catch((err) => {
        console.log(err)
        console.log("failed");
        process.exit(1)
    })
