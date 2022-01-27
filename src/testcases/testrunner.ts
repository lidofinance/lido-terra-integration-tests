import {Fee, LCDClient, MnemonicKey, Msg, MsgSend, Wallet} from "@terra-money/terra.js";
import * as path from "path";
import {send_transaction} from "../helper/flow/execution";
import {mustPass} from "../helper/flow/must";
const execSync = require('child_process').execSync;

import BlunaShortTest from "./bluna_short_test";
import {predefinedKeys, globalWalletPool, sleep, uploadCode} from "./common_localtestnet";
import STlunaShortTest from "./stluna_short_test"
import ConversionTest from "./conversion"
import PausableContractsTest from "./pausable_contracts"
import RedistributionsTest from "./redistribution"
import RewardsBlunaTest from "./rewards_bLuna"


const net = require('net');



export default async function isPortReachable(port: number, host: string, timeout = 1000) {
    if (typeof host !== 'string') {
        throw new TypeError('Specify a `host`');
    }

    const promise = new Promise((resolve, reject) => {
        const socket = new net.Socket();

        const onError = () => {
            socket.destroy();
            reject();
        };

        socket.setTimeout(timeout);
        socket.once('error', onError);
        socket.once('timeout', onError);

        socket.connect(port, host, () => {
            socket.end();
            resolve(true);
        });
    });

    try {
        await promise;
        return true;
    } catch {
        return false;
    }
}

const waitForPort = async (port = 1317, host = "localhost", threshold = 10): Promise<void> => {
    let c = 0
    while (true) {
        c++
        console.log(c)
        if (threshold != undefined && c > threshold) {
            throw new Error(`timed out for waiting port ${host}:${port}`);
        }
        const reacheble = await isPortReachable(port, host, 1000)
        if (reacheble) {
            break
        }
    }
}

console.log(__dirname)
const docker_config = path.join(__dirname, "..", "..", "testkit", "docker-compose.yml")
console.log(docker_config)

const start_testnet = async () => {
    const stdout = execSync(`docker-compose -f ${docker_config} up -d`);
    console.log(`${stdout}`)
}

const stop_testnet = async () => {
    const stdout = execSync(`docker-compose -f ${docker_config} down --remove-orphans`);
    console.log(`${stdout}`)
}

const localtestnet_runner = async (tests: Array<(contracts?: Record<string, number>) => Promise<void>>, contracts?: Record<string, number>) => {
    for (let i = 0; i < tests.length; i++) {
        const test = tests[i]
        // console.log(test.caller)
        // await stop_testnet()
        // await start_testnet()
        //giving some time to start env
        // await waitForPort()
        await test(contracts)
        // await stop_testnet()
    }
}

const configure_shared_testnet = async (walletPoolSize = 50): Promise<Record<string, number>> => {
    // await stop_testnet()
    // await start_testnet()
    // //giving some time to start env
    // await waitForPort()
    const chainID = "localnet"
    const URL = "http://127.0.0.1:1317/"
    const lcd = new LCDClient({
        chainID: chainID,
        URL: URL
    })
    const masterWallet = lcd.wallet(new MnemonicKey({mnemonic: predefinedKeys[0]}))
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

const shared_runner = async (tests: Array<(contracts?: Record<string, number>) => Promise<void>>, contracts?: Record<string, number>) => {
    return Promise.all(
        tests.map((t) => t(contracts))
    )
}

const localtestnet_testcases: Array<(contracts?: Record<string, number>) => Promise<void>> = [
    // BlunaShortTest,
    // STlunaShortTest,
    // ConversionTest,
    PausableContractsTest,
    // RedistributionsTest,
    // RewardsBlunaTest
]

configure_shared_testnet()
    .then((contracts) => {
        console.log("uploaded contracts ", contracts)
        return shared_runner(localtestnet_testcases, contracts)
    })
    .then(() => {console.log("done")})
    .catch((err) => {
        console.log(err)
        console.log("failed");
        process.exit(1)
    })
