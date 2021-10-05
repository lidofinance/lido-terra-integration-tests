import {LocalTerra, MnemonicKey, Fee, Validator, Wallet} from "@terra-money/terra.js";
import Anchor from "../helper/spawn";
import AnchorbAsset from "../helper/basset_helper";
import {setTestParams} from "../parameters/contract-tests-parameteres";
import * as path from "path";
import AnchorbAssetQueryHelper from "../helper/basset_queryhelper";
import {UnbondRequestsResponse} from "../helper/types/anchor_basset_hub/unbond_requests_response";


export class TestStateLocalTerra {
    validators: Validator[]
    anchor: Anchor
    gasStation: MnemonicKey
    lcdClient: LocalTerra
    wallets: Record<string, Wallet>
    basset: AnchorbAsset
    validators_addresses: Array<string>
    constructor() {
        this.lcdClient = new LocalTerra()
        this.wallets = {
            a: this.lcdClient.wallets.test1,
            b: this.lcdClient.wallets.test2,
            c: this.lcdClient.wallets.test3,
            d: this.lcdClient.wallets.test4,
            lido_fee: this.lcdClient.wallets.test5,
            ownerWallet: this.lcdClient.wallets.test6,
            gasStation: this.lcdClient.wallets.test7,
            valAWallet: this.lcdClient.wallets.validator
        }
        this.gasStation = new MnemonicKey({mnemonic: 'noble width taxi input there patrol clown public spell aunt wish punch moment will misery eight excess arena pen turtle minimum grain vague inmate'})
        this.validators_addresses = ["terravaloper1dcegyrekltswvyy0xy69ydgxn9x8x32zdy3ua5"]
        this.anchor = new Anchor(this.wallets.ownerWallet);
    }

    async init() {
        [this.validators] = await this.lcdClient.staking.validators()
        await this.anchor.store_contracts_localterra(
            path.resolve(__dirname, "../../anchor-bAsset-contracts/artifacts"),
        );
        const fixedFeeForInit = new Fee(6000000, "2000000uusd");
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