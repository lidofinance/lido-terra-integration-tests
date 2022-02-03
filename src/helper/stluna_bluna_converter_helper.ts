import {Coin, Coins, Fee, isTxError, MsgExecuteContract, MsgStoreCode, Wallet,} from "@terra-money/terra.js";
import * as fs from "fs";
import {execute, instantiate, send_transaction} from "./flow/execution";
import {makeRestStoreQuery} from "./basset_queryhelper";

const contracts = ["lido_terra_stluna_bluna_converter_contract"];

export default class ConverterPool {
    public contractInfo: {
        [contractName: string]: {codeId: number; contractAddress: string};
    };

    constructor() {
        this.contractInfo = {};
    }

    public async storeCodes(
        sender: Wallet,
        location: string,
        fee?: Fee
    ): Promise<void> {
        return contracts.reduce(
            (t, c) =>
                t.then(async () => {
                    const bytecode = fs.readFileSync(`${location}/${c}.wasm`);
                    const storeCode = new MsgStoreCode(
                        sender.key.accAddress,
                        bytecode.toString("base64")
                    );

                    const result = await send_transaction(sender, [storeCode], fee);
                    if (isTxError(result)) {
                        throw new Error(`Couldn't upload ${c}: ${result.raw_log}`);
                    }

                    const codeId = +result.logs[0].eventsByType.store_code.code_id[0];
                    this.contractInfo[c] = {
                        codeId,
                        contractAddress: "",
                    };
                }),
            Promise.resolve()
        );
    }

    public async instantiate_converter_pool(
        sender: Wallet,
        hub_contract: string,
        stluna_contract: string,
        bluna_contract: string,
        fee?: Fee,
    ): Promise<void> {
        const converter = await instantiate(
            sender,
            this.contractInfo.lido_terra_stluna_bluna_converter_contract.codeId,
            {
                stluna_address: stluna_contract,
                bluna_address: bluna_contract,
                hub_address: hub_contract,
            },
            undefined,
            fee
        );

        if (isTxError(converter)) {
            throw new Error(
                `Couldn't instantiate ${this.contractInfo.lido_terra_stluna_bluna_converter_contract.codeId}: ${converter.raw_log}`
            );
        }
        this.contractInfo["lido_terra_stluna_bluna_converter_contract"].contractAddress = converter.logs[0].eventsByType.instantiate_contract
            .contract_address[0];
    }

    public async swap(
        sender: Wallet,
        amount: number,
        tokenAddr: string,
        to = null
    ): Promise<void> {
        const swapExecution = await execute(sender, tokenAddr, {
            send: {
                contract: this.contractInfo["lido_terra_stluna_bluna_converter_contract"].contractAddress,
                amount: `${amount}`,
                msg: Buffer.from(JSON.stringify({swap: {to: to}})).toString("base64"),
            },
        });
        if (isTxError(swapExecution)) {
            throw new Error(`Couldn't run: ${swapExecution.raw_log}`);
        }
    }

    public async transfer_cw20_token(
        sender: Wallet,
        rcv: string,
        amount: number
    ): Promise<void> {
        const contract = this.contractInfo.terraswap_token.contractAddress;
        const transferExecuttion = await execute(sender, contract, {
            transfer: {
                recipient: rcv,
                amount: `${amount}`,
            },
        });
        if (isTxError(transferExecuttion)) {
            throw new Error(`Couldn't run: ${transferExecuttion.raw_log}`);
        }
    }
}
