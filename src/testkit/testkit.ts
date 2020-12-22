import { BlockTxBroadcastResult, Coin, CreateTxOptions, LCDClient, MnemonicKey, Msg, StdFee, StdTx, TxBroadcastResult, Validator, Wallet } from "@terra-money/terra.js";
import axios, { AxiosInstance } from 'axios'
import { startOfToday } from "date-fns";

export class Testkit {
    testkit: AxiosInstance
    testkitEndpoint: string
    chainId!: string
    contextId!: string
    lcd!: LCDClient

    proposerRounds: string[] = []
    proposerRoundIdx: number = 0

    automaticTxQueue: {
        wallet: Wallet,
        fee: StdFee | undefined,
        msgs: Msg[]
    }[] = []

    constructor(testkitEndpoint: string) {
        this.testkit = axios.create({ baseURL: testkitEndpoint })
        this.testkitEndpoint = testkitEndpoint
    }

    async init(opts: TestkitOption) {
        return this.testkit.post<TestkitInit.Data>("/init", opts).then(r => {
            this.contextId = r.data.identifier
            this.chainId = r.data.chain_id
            this.lcd = new LCDClient({
                URL: `${this.testkitEndpoint}/${r.data.identifier}`,
                chainID: r.data.chain_id,
            })

            return r.data
        })
    }

    async registerAutomaticTx(opt: AutomaticTxRequest) {
        return this.testkit.post<AutomaticTxRequest>(`/${this.contextId}/register_auto_tx`, opt)
    }

    static walletToAccountRequest(accountName: string, w: MnemonicKey): AddAccountRequest {
        return {
            account_name: accountName,
            mnemonic: w.mnemonic
        }
    }

    static validatorInitRequest(
        accountName: string,
        selfDelegation: Coin,
        commission: Validator.CommissionRates
    ): ValidatorInitRequest {
        return {
            account_name: accountName,
            self_delegation: selfDelegation.toData(),
            commission: commission.toData()
        }
    }

    static automaticTxRequest({
        accountName,
        period,
        msgs,
        offset,
        startAt,
        fee
    }: AutomaticTxConfig): AutomaticTxRequest {
        return {
            account_name: accountName,
            period: period.toString(),
            offset: offset ? offset.toString() : undefined,
            startAt: startAt ? startAt.toString() : undefined,
            msgs: msgs.map(msg => msg.toData()),
            fee: fee.toData()
        }
    }

    deriveLCD(): LCDClient {
       return this.lcd
    }

    async inject(validatorAddress: string) {
        return this.testkit
            .post<Inject.BlockState>(`/${this.contextId}/inject/${validatorAddress}`)
            .then(r => r.data)
    }
}

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;;;;;;;;;;;;; /* types */ ;;;;;;;;;;;;;;
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
declare module Inject {

    export interface Attribute {
        key: string;
        value: string;
    }

    export interface Event {
        type: string;
        attributes: Attribute[];
    }

    export interface ResponseBeginBlock {
        events: Event[];
    }

    export interface ResponseEndBlock {
        validator_updates: any[];
    }

    export interface Attribute2 {
        key: string;
        value: string;
    }

    export interface Event2 {
        type: string;
        attributes: Attribute2[];
    }

    export interface ResponseDeliverTx {
        code: number;
        data: string;
        log: string;
        info: string;
        gasWanted: string;
        gasUsed: string;
        events: Event2[];
        codespace: string;
    }

    export interface Version {
        block: string;
        app: string;
    }

    export interface Parts {
        total: string;
        hash: string;
    }

    export interface LastBlockId {
        hash: string;
        parts: Parts;
    }

    export interface Header {
        version: Version;
        chain_id: string;
        height: string;
        time: Date;
        last_block_id: LastBlockId;
        last_commit_hash: string;
        data_hash: string;
        validators_hash: string;
        next_validators_hash: string;
        consensus_hash: string;
        app_hash: string;
        last_results_hash: string;
        evidence_hash: string;
        proposer_address: string;
    }

    export interface Data {
        txs: string[];
    }

    export interface Block {
        header: Header;
        data: Data;
    }

    export interface BlockState {
        Height: string;
        ResponseBeginBlock: ResponseBeginBlock;
        ResponseEndBlock: ResponseEndBlock;
        ResponseDeliverTx: ResponseDeliverTx[];
        Block: Block;
    }

}


interface TestkitOption {
    genesis: object,
    accounts: AddAccountRequest[],
    validators: ValidatorInitRequest[],
    auto_tx?: AutomaticTxRequest[],
    auto_inject?: AutomaticInjectionRequest
}

export module TestkitInit {
    export interface Account {
        account_name: string;
        address: string;
        mnemonic: string;
    }

    export interface Description {
        moniker: string;
        identity: string;
        website: string;
        security_contact: string;
        details: string;
    }

    export interface Commission {
        rate: string;
        max_rate: string;
        max_change_rate: string;
    }

    export interface Value {
        denom: string;
        amount: string;
    }

    export interface Msg {
        description: Description;
        commission: Commission;
        min_self_delegation: string;
        delegator_address: string;
        validator_address: string;
        pubkey: string;
        value: Value;
    }

    export interface Validator {
        Msg: Msg;
        validator_address: string;
        account_name: string;
    }

    export interface Data {
        identifier: string;
        chain_id: string;
        accounts: Account[];
        validators: Validator[];
        auto_txs: any[];
        auto_inject?: any;
    }

}

interface AddAccountRequest {
    account_name: string
    mnemonic: string
}

interface ValidatorInitRequest {
    account_name: string
    self_delegation: Coin.Data
    commission: Validator.CommissionRates.Data
}


interface AutomaticInjectionRequest {
    validator_rounds: string[]
}

;;;;;;;;;;;;;

export interface AutomaticTxConfig {
    accountName: string,
    period: number,
    msgs: Msg[],
    fee: StdFee,
    offset?: number,
    startAt?: number,
}

export interface AutomaticTxRequest {
    account_name: string
    period: string
    msgs: Msg.Data[]
    fee: StdFee.Data,
    offset?: string,
    startAt?: string,
}