import {
    BlockTxBroadcastResult,
    Coin,
    Coins, Dec, Int,
    isTxError,
    LCDClient,
    Msg,
    MsgExecuteContract,
    MsgInstantiateContract,
    MsgStoreCode,
    StdFee,
    Wallet,
} from "@terra-money/terra.js";
import * as fs from "fs";
import { execute, instantiate, send_transaction } from "./flow/execution";

export type VoteOption = 'yes' | 'no';


export interface ExecuteMsg {
    contract: string;
    msg: string;
}

const contracts = [
    "gov",
    "faucet",
    "collector",
    "community",
    "staking",
    "token",
];

export default class AnchorToken {
    public contractInfo: {
        [contractName: string]: { codeId: number; contractAddress: string };
    };

    constructor() {
        this.contractInfo = {};
    }

    public async storeCodes(sender: Wallet, location: string, fee?: StdFee): Promise<void> {
        return contracts.reduce((t, c) => t.then(async () => {
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
        }), Promise.resolve())
    }

    public async collector_sweep (sender: Wallet, params: {
        denom: string
    }): Promise<void> {
        let contract = this.contractInfo["collector"].contractAddress;
        const updateExecution = await execute(sender, contract, {
            sweep: {
                denom: params.denom,
            }
        });
        if (isTxError(updateExecution)) {
            throw new Error(`Couldn't run: ${updateExecution.raw_log}`);
        }
    }


    public async collector_update_config (sender: Wallet, params: {
        reward_weight?: string;
    }): Promise<void> {
        let contract = this.contractInfo["collector"].contractAddress;
        const updateExecution = await execute(sender, contract, {
            update_config: {
                denom: params.reward_weight,
            }
        });
        if (isTxError(updateExecution)) {
            throw new Error(`Couldn't run: ${updateExecution.raw_log}`);
        }
    }

    public async community_spend (sender: Wallet, params: {
        recipient: string;
        amount: string;
    }): Promise<void> {
        let contract = this.contractInfo["community"].contractAddress;
        const updateExecution = await execute(sender, contract, {
            spend: {
                recipient: params.recipient,
                amount: new Int(new Dec(params.amount).mul(1000000)).toString(),
            }
        });
        if (isTxError(updateExecution)) {
            throw new Error(`Couldn't run: ${updateExecution.raw_log}`);
        }
    }

    public async community_update_config (sender: Wallet, params: {
        spend_limit?: string;
    }): Promise<void> {
        let contract = this.contractInfo["community"].contractAddress;
        const updateExecution = await execute(sender, contract, {
            update_config: {
                spend_limit: params.spend_limit,
            }
        });
        if (isTxError(updateExecution)) {
            throw new Error(`Couldn't run: ${updateExecution.raw_log}`);
        }
    }

    public async faucet_spend (sender: Wallet, params: {
        recipient: string;
        amount: string;
    }): Promise<void> {
        let contract = this.contractInfo["faucet"].contractAddress;
        const updateExecution = await execute(sender, contract, {
            spend: {
                recipient: params.recipient,
                amount: new Int(new Dec(params.amount).mul(1000000)).toString(),
            }
        });
        if (isTxError(updateExecution)) {
            throw new Error(`Couldn't run: ${updateExecution.raw_log}`);
        }
    }

    public async faucet_update_config (sender: Wallet, params: {
        spend_limit?: string;
    }): Promise<void> {
        let contract = this.contractInfo["faucet"].contractAddress;
        const updateExecution = await execute(sender, contract, {
            update_config: {
                spend_limit: params.spend_limit,
            }
        });
        if (isTxError(updateExecution)) {
            throw new Error(`Couldn't run: ${updateExecution.raw_log}`);
        }
    }

    public async gov_cast_vote (sender: Wallet, params: {
        poll_id: number;
        vote: VoteOption;
        amount: string;
    }): Promise<void> {
        let contract = this.contractInfo["gov"].contractAddress;
        const updateExecution = await execute(sender, contract, {
            cast_vote: {
                poll_id: params.poll_id,
                vote: params.vote,
                amount: new Int(new Dec(params.amount).mul(1000000)).toString(),
            }
        });
        if (isTxError(updateExecution)) {
            throw new Error(`Couldn't run: ${updateExecution.raw_log}`);
        }
    }


    public async gov_create_poll (sender: Wallet, params: {
        amount: string;
        title: string;
        description: string;
        link?: string;
        execute_msg?: ExecuteMsg;
    }): Promise<void> {
        let contract = this.contractInfo["token"].contractAddress;
        const updateExecution = await execute(sender, contract, {
            send: {
                contract: this.contractInfo["gov"].contractAddress,
                amount: new Int(new Dec(params.amount).mul(1000000)).toString(),
                msg: Buffer.from(JSON.stringify({
                    create_poll: {
                        title: params.title,
                        description: params.description,
                        link: params.link,
                        execute_msg: params.execute_msg
                    }
                })).toString("base64")

            }});
        if (isTxError(updateExecution)) {
            throw new Error(`Couldn't run: ${updateExecution.raw_log}`);
        }
    }

    public async gov_stake_voting (sender: Wallet, params: {
        amount: string;
    }): Promise<void> {
        let contract = this.contractInfo["token"].contractAddress;
        const updateExecution = await execute(sender, contract, {
            send: {
                contract: this.contractInfo["gov"].contractAddress,
                amount: new Int(new Dec(params.amount).mul(1000000)).toString(),
                msg: Buffer.from(JSON.stringify({
                    stake_voting_tokens: {},
                })).toString("base64")
            }});
        if (isTxError(updateExecution)) {
            throw new Error(`Couldn't run: ${updateExecution.raw_log}`);
        }
    }


    public async gov_end_poll (sender: Wallet, params: {
        poll_id: number;
    }): Promise<void> {
        let contract = this.contractInfo["gov"].contractAddress;
        const updateExecution = await execute(sender, contract, {
            end_poll: {
                poll_id: params.poll_id,
            }
        });
        if (isTxError(updateExecution)) {
            throw new Error(`Couldn't run: ${updateExecution.raw_log}`);
        }
    }

    public async gov_execute_poll (sender: Wallet, params: {
        poll_id: number;
    }): Promise<void> {
        let contract = this.contractInfo["gov"].contractAddress;
        const updateExecution = await execute(sender, contract, {
            execute_poll: {
                poll_id: params.poll_id,
            }
        });
        if (isTxError(updateExecution)) {
            throw new Error(`Couldn't run: ${updateExecution.raw_log}`);
        }
    }

    public async gov_expire_poll (sender: Wallet, params: {
        poll_id: number;
    }): Promise<void> {
        let contract = this.contractInfo["gov"].contractAddress;
        const updateExecution = await execute(sender, contract, {
            expire_poll: {
                poll_id: params.poll_id,
            }
        });
        if (isTxError(updateExecution)) {
            throw new Error(`Couldn't run: ${updateExecution.raw_log}`);
        }
    }

    public async gov_snapshot_poll (sender: Wallet, params: {
        poll_id: number;
    }): Promise<void> {
        let contract = this.contractInfo["gov"].contractAddress;
        const updateExecution = await execute(sender, contract, {
            snapshot_poll: {
                poll_id: params.poll_id,
            }
        });
        if (isTxError(updateExecution)) {
            throw new Error(`Couldn't run: ${updateExecution.raw_log}`);
        }
    }

    public async gov_withdraw_voting (sender: Wallet, params: {
        amount: string;
    }): Promise<void> {
        let contract = this.contractInfo["gov"].contractAddress;
        const updateExecution = await execute(sender, contract, {
            withdraw_voting_tokens: {
                amount: new Int(new Dec(params.amount).mul(1000000)).toString(),
            }
        });
        if (isTxError(updateExecution)) {
            throw new Error(`Couldn't run: ${updateExecution.raw_log}`);
        }
    }

    public async gov_update_config(
        sender: Wallet,
        params: {
            owner?: string;
            quorum?: string;
            threshold?: string;
            voting_period?: number;
            timelock_period?: number;
            expiration_period?: number;
            proposal_deposit?: string;
            snapshot_period?:string;
        }
    ): Promise<void> {
        let contract = this.contractInfo["gov"].contractAddress;
        const updateExecution = await execute(sender, contract, {
            update_config: {
                owner: params.owner,
                quorum: params.quorum,
                threshold: params.threshold,
                voting_period: params.voting_period,
                timelock_period: params.timelock_period,
                expiration_period: params.expiration_period,
                proposal_deposit: params.proposal_deposit,
                snapshot_period: params.snapshot_period,
            }
        });
        if (isTxError(updateExecution)) {
            throw new Error(`Couldn't run: ${updateExecution.raw_log}`);
        }
    }

    public async staking_bond (sender: Wallet, params: {
        amount: string;
    }): Promise<void> {
        let contract = this.contractInfo["token"].contractAddress;
        const updateExecution = await execute(sender, contract, {
            send: {
                contract: this.contractInfo["staking"].contractAddress,
                amount: new Int(new Dec(params.amount).mul(1000000)).toString(),
                msg: Buffer.from(JSON.stringify({
                    bond: {}
                })).toString("base64")

            }});
        if (isTxError(updateExecution)) {
            throw new Error(`Couldn't run: ${updateExecution.raw_log}`);
        }
    }

    public async staking_deposit (sender: Wallet, params: {
        amount: string;
    }): Promise<void> {
        let contract = this.contractInfo["token"].contractAddress;
        const updateExecution = await execute(sender, contract, {
            send: {
                contract: this.contractInfo["staking"].contractAddress,
                amount: new Int(new Dec(params.amount).mul(1000000)).toString(),
                msg: Buffer.from(JSON.stringify({
                    deposit_reward: {}
                })).toString("base64")

            }});
        if (isTxError(updateExecution)) {
            throw new Error(`Couldn't run: ${updateExecution.raw_log}`);
        }
    }

    public async staking_unbond (sender: Wallet, params: {
        amount: string;
    }): Promise<void> {
        let contract = this.contractInfo["staking"].contractAddress;
        const updateExecution = await execute(sender, contract, {
            unbond: {
                amount: new Int(new Dec(params.amount).mul(1000000)).toString(),
            }});
        if (isTxError(updateExecution)) {
            throw new Error(`Couldn't run: ${updateExecution.raw_log}`);
        }
    }

    public async staking_withdraw (sender: Wallet, params: {
    }): Promise<void> {
        let contract = this.contractInfo["staking"].contractAddress;
        const updateExecution = await execute(sender, contract, { withdraw: {},});
        if (isTxError(updateExecution)) {
            throw new Error(`Couldn't run: ${updateExecution.raw_log}`);
        }
    }

}