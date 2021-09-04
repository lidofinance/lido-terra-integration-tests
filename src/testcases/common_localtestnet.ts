import {LCDClient, LocalTerra, MnemonicKey, MsgSend, StdFee, Validator, Wallet} from "@terra-money/terra.js";
import Anchor from "../helper/spawn";
import AnchorbAsset from "../helper/basset_helper";
import {setTestParams} from "../parameters/contract-tests-parameteres";
import * as path from "path";
import AnchorbAssetQueryHelper from "../helper/basset_queryhelper";
import {UnbondRequestsResponse} from "../helper/types/anchor_basset_hub/unbond_requests_response";
import {send_transaction} from "../helper/flow/execution";
const {exec} = require('child_process');

export const ValidatorsKeys = [
    "gloom sad wear decorate afraid tooth can gossip tool group work kid home arm lend alone job strategy decide oyster stairs crazy thrive muscle",
    "silver depend sleep maple bar innocent garlic hire patrol often embrace interest magnet valley tomorrow magnet rural lonely typical egg asset much round resist",
    "vendor faculty reform unit bunker vocal actual churn squeeze oval enough attitude subway source orange smile spoil walnut favorite ensure defense north bracket once",
    "zero chef gate lizard toilet armor sense stage debris begin key mimic payment reform lawsuit inch off card search rural blame purse harvest tonight",
]

export const vals = [
    {
        name: "terradnode0",
        address: "terravaloper188p7d0w6948y8p4cg5p3m6zx8lzzg8r0vt47ms"
    },
    {
        name: "terradnode1",
        address: "terravaloper180darp2tj7ns48r0s3l3u8a2ygxjyycsjmyhzz"
    },
    {
        name: "terradnode2",
        address: "terravaloper1utdag7jnhp9zy667z78dt8hnnud2mu7vax5rsn"
    },
    {
        name: "terradnode3",
        address: "terravaloper1yg247q4kecqnktp2rte030yy43gpj0c9nm5nug"
    },
]

export const accKeys = [
    "song wood skull unfair cute rude water dog convince summer sell comic flower enter proud scout orient alarm bulk jealous enable index tip wolf",
    "broccoli civil caution forum drum burst become frequent brother valley truly amazing eager strategy arrow snack vehicle turtle switch fiber pact story cruise bulb",
    "devote negative jacket recipe onion health that jungle stuff catch soft region this indoor tired erase fiber adjust nurse half develop issue often broccoli",
    "rose chalk climb drum innocent cruise rich soap brother barely human humble run coffee gadget symptom kit food hobby west pill harvest exile gap",
    "claw meat hockey day clay cave blossom toy calm rotate home huge tomato faint language gate life midnight slab session palm forum raw alien",
    "whale aisle lemon entire uphold retreat couch avocado fork thank flee card blossom hockey universe rich slam spare amused slight pet bright bridge junk"
]
/* 
Validators:
terravaloper188p7d0w6948y8p4cg5p3m6zx8lzzg8r0vt47ms - node0 192.168.10.2
fever fold wave liar injury lawsuit despair fade cash angry labor session accident process thunder left breeze together coast live marble exhaust lumber neutral

terravaloper180darp2tj7ns48r0s3l3u8a2ygxjyycsjmyhzz - node1 192.168.10.3
gasp boat supply render wet biology dwarf narrow donkey safe economy aware unknown know mirror head fatal junior auto aim elder fence raccoon owner

terravaloper1utdag7jnhp9zy667z78dt8hnnud2mu7vax5rsn - node4 192.168.10.4
hat luxury square menu benefit salon payment rifle dawn quote wear hood team junior quick exact era cheap device clown raven month bonus refuse

terravaloper1yg247q4kecqnktp2rte030yy43gpj0c9nm5nug - node3 192.168.10.5
moral globe barrel sock kite concert service debate dignity rival lyrics doctor mobile stage cousin wife fee run hospital buffalo fan embody gaze error

Accounts:
- name: acc0
  address: terra19uv79nyv4a62slv3npkze3p9984ueafemaa352
song wood skull unfair cute rude water dog convince summer sell comic flower enter proud scout orient alarm bulk jealous enable index tip wolf


- name: acc1
  address: terra15kfx0jvjcvyur4unmlv6ll299zcyld2dr0y4ug
broccoli civil caution forum drum burst become frequent brother valley truly amazing eager strategy arrow snack vehicle turtle switch fiber pact story cruise bulb

- name: acc2
  address: terra132uydmemhtjqhzgm2zjcz2mthnc4swpwvmw4xm
devote negative jacket recipe onion health that jungle stuff catch soft region this indoor tired erase fiber adjust nurse half develop issue often broccoli


- name: acc3
  address: terra1gn6asgxzpn72akfmmj27hl3vcfhuz6t9vmxaps
rose chalk climb drum innocent cruise rich soap brother barely human humble run coffee gadget symptom kit food hobby west pill harvest exile gap


- name: acc4
  address: terra1yxd274qup67xc3mcewlfz7mk90yz6y75fd4cpr
claw meat hockey day clay cave blossom toy calm rotate home huge tomato faint language gate life midnight slab session palm forum raw alien

- name: acc5
  address: terra1jtm9ga0zvgptd2jnv9fysuh82z4ajw2az3xr39
whale aisle lemon entire uphold retreat couch avocado fork thank flee card blossom hockey universe rich slam spare amused slight pet bright bridge junk
*/

const {
    DOCKER_NETWORK = "testkit_localnet"
} = process.env


function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

export const disconnectValidator = async (name: string): Promise<any> => {
    const {stdout, stderr} = await exec(`docker network disconnect ${DOCKER_NETWORK} ${name}`)
    return stdout
}

export class TestStateLocalTestNet {
    validators: Validator[]
    anchor: Anchor
    gasStation: MnemonicKey
    lcdClient: LCDClient
    wallets: Record<string, Wallet>
    basset: AnchorbAsset
    validators_addresses: Array<string>
    constructor() {
        this.lcdClient = new LCDClient({
            chainID: "localnet",
            URL: "http://192.168.10.2:1317/"
        })
        this.wallets = {
            valAWallet: this.lcdClient.wallet(new MnemonicKey({mnemonic: ValidatorsKeys[0]})),
            valBWallet: this.lcdClient.wallet(new MnemonicKey({mnemonic: ValidatorsKeys[1]})),
            valCWallet: this.lcdClient.wallet(new MnemonicKey({mnemonic: ValidatorsKeys[2]})),
            valDWallet: this.lcdClient.wallet(new MnemonicKey({mnemonic: ValidatorsKeys[3]})),

            ownerWallet: this.lcdClient.wallet(new MnemonicKey({mnemonic: accKeys[0]})),
            a: this.lcdClient.wallet(new MnemonicKey({mnemonic: accKeys[0]})),
            b: this.lcdClient.wallet(new MnemonicKey({mnemonic: accKeys[1]})),
            c: this.lcdClient.wallet(new MnemonicKey({mnemonic: accKeys[2]})),
            d: this.lcdClient.wallet(new MnemonicKey({mnemonic: accKeys[3]})),

            lido_fee: this.lcdClient.wallet(new MnemonicKey({mnemonic: accKeys[4]})),
            gasStation: this.lcdClient.wallet(new MnemonicKey({mnemonic: accKeys[5]})),
        }
        this.gasStation = new MnemonicKey({mnemonic: accKeys[5]})
        this.validators_addresses = [vals[0].address]
        this.anchor = new Anchor(this.wallets.ownerWallet);
    }

    async init() {
        this.validators = await this.lcdClient.staking.validators()
        await this.anchor.store_contracts_localterra(
            path.resolve(__dirname, "../../anchor-bAsset-contracts/artifacts"),
        );
        const fixedFeeForInit = new StdFee(6000000, "2000000uusd");
        await this.anchor.instantiate_localterra(
            fixedFeeForInit,
            setTestParams(
                this.validators_addresses[0],
                this.wallets.a.key.accAddress,
                this.wallets.lido_fee.key.accAddress,
            ),
            this.validators_addresses
        );
        this.basset = this.anchor.bAsset;
    }

    async waitForJailed(name: string, threshold?: number): Promise<void> {
        const val = vals.find((val) => {if (val.name == name) {return true} else {return false} })
        let c = 0
        while (true) {
            c++
            console.log(c)
            if (threshold != undefined && c > threshold) {
                throw new Error("timed out for waiting jailing validator");

            }
            const v = await this.lcdClient.staking.validator(val.address)
            if (v.jailed) {
                break
            }
            await sleep(1000)
        }
    }

}

export const get_expected_sum_from_requests = async (querier: AnchorbAssetQueryHelper, reqs: UnbondRequestsResponse, token: "bluna" | "stluna"): Promise<number> => {
    return reqs.requests.reduce(async (acc, [batchid, amount_bluna_tokens, amount_stluna_tokens]) => {
        const acc_sum = await acc;
        const h = await querier.all_history(1, batchid - 1);
        if (h.history.length == 0) {
            // probably this request is not in UnboundHistory yet
            return acc_sum
        } else if (!h.history[0].released) {
            // unbond batch is not released yet
            return acc_sum
        }
        else {
            if (token == "bluna") {
                return Number(h.history[0].bluna_withdraw_rate) * Number(amount_bluna_tokens) + acc_sum;
            } else {
                return Number(h.history[0].stluna_withdraw_rate) * Number(amount_stluna_tokens) + acc_sum;
            }
        }
    }, Promise.resolve(0))
}