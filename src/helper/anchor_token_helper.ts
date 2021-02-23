import {
  BlockTxBroadcastResult,
  Coin,
  Coins,
  Dec,
  Int,
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

export type VoteOption = "yes" | "no";

export interface ExecuteMsg {
  contract: string;
  msg: string;
}

type Mint = {
  minter: string;
  cap?: number;
};

const contracts = [
  "gov",
  "faucet",
  "collector",
  "community",
  "staking",
  "token",
  "airdrop",
];

export default class AnchorToken {
  public contractInfo: {
    [contractName: string]: { codeId: number; contractAddress: string };
  };

  constructor() {
    this.contractInfo = {};
  }

  public async storeCodes(
    sender: Wallet,
    location: string,
    fee?: StdFee
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

  public async gov_instantiate(
    sender: Wallet,
    params: {
      owner?: string;
      quorum?: string;
      threshold?: string;
      voting_period?: number;
      timelock_period?: number;
      expiration_period?: number;
      proposal_deposit?: string;
      snapshot_period?: string;
    },
    fee?: StdFee
  ): Promise<void> {
    let contract = this.contractInfo["gov"].codeId;
    const init = await instantiate(
      sender,
      contract,
      {
        owner: params.owner || sender.key.accAddress,
        quorum: params.quorum || "0.1",
        threshold: params.threshold || "0.5",
        voting_period: params.voting_period || "13500",
        timelock_period: params.timelock_period || "1688",
        expiration_period: params.expiration_period || "1688",
        proposal_deposit: params.proposal_deposit || "100000000",
        snapshot_period: params.snapshot_period || "1688",
      },
      undefined,
      fee
    );
    if (isTxError(init)) {
      throw new Error(`Couldn't run: ${init.raw_log}`);
    }

    if (isTxError(init)) {
      throw new Error(
        `Couldn't upload ${this.contractInfo["gov"].codeId}: ${init.raw_log}`
      );
    }
    const govAddr =
      init.logs[0].eventsByType.instantiate_contract.contract_address[0];
    this.contractInfo["gov"].contractAddress = govAddr;

    console.log(
      `gov: { codeId: ${this.contractInfo.gov.codeId}, contractAddress: "${this.contractInfo.gov.contractAddress}"},`
    );
  }

  public async staking_instantiation(
    sender: Wallet,
    params: {
      anchor_token?: string;
      staking_token?: string;
      distribution_schedule?: [number, number, string][];
    },
    fee?: StdFee
  ): Promise<void> {
    let contract = this.contractInfo["staking"].codeId;
    let token = this.contractInfo["token"].contractAddress;
    const init = await instantiate(
      sender,
      contract,
      {
        anchor_token: params.anchor_token || token,
        staking_token: params.staking_token,
        distribution_schedule: params.distribution_schedule || [
          [2690000, 3190000, "100000000000"],
        ],
      },
      undefined,
      fee
    );
    if (isTxError(init)) {
      throw new Error(`Couldn't run: ${init.raw_log}`);
    }

    if (isTxError(init)) {
      throw new Error(
        `Couldn't upload ${this.contractInfo["staking"].codeId}: ${init.raw_log}`
      );
    }
    const stakingAddr =
      init.logs[0].eventsByType.instantiate_contract.contract_address[0];
    this.contractInfo["staking"].contractAddress = stakingAddr;

    console.log(
      `staking: { codeId: ${this.contractInfo.staking.codeId}, contractAddress: "${this.contractInfo.staking.contractAddress}"},`
    );
  }

  public async community_instantiation(
    sender: Wallet,
    params: {
      gov_contract?: string;
      anchor_token?: string;
      spend_limit?: string;
    },
    fee?: StdFee
  ): Promise<void> {
    let contract = this.contractInfo["community"].codeId;
    let gov = this.contractInfo["gov"].contractAddress;
    let token = this.contractInfo["token"].contractAddress;
    const init = await instantiate(
      sender,
      contract,
      {
        gov_contract: gov || params.gov_contract,
        anchor_token: token,
        spend_limit: params.spend_limit || "100000000000",
      },
      undefined,
      fee
    );
    if (isTxError(init)) {
      throw new Error(`Couldn't run: ${init.raw_log}`);
    }

    if (isTxError(init)) {
      throw new Error(
        `Couldn't upload ${this.contractInfo["community"].codeId}: ${init.raw_log}`
      );
    }
    const comunityAddr =
      init.logs[0].eventsByType.instantiate_contract.contract_address[0];
    this.contractInfo["community"].contractAddress = comunityAddr;

    console.log(
      `community: { codeId: ${this.contractInfo.community.codeId}, contractAddress: "${this.contractInfo.community.contractAddress}"},`
    );
  }

  public async collector_instantiation(
    sender: Wallet,
    params: {
      gov_contract?: string;
      terraswap_factory?: string;
      anchor_token?: string;
      faucet_contract?: string;
      reward_factor?: string;
    },
    fee?: StdFee
  ): Promise<void> {
    let contract = this.contractInfo["collector"].codeId;
    let gov = this.contractInfo["gov"].contractAddress;
    let token = this.contractInfo["token"].contractAddress;
    let faucet = this.contractInfo["token"].contractAddress;
    const init = await instantiate(
      sender,
      contract,
      {
        gov_contract: gov,
        terraswap_factory: params.terraswap_factory,
        anchor_token: token,
        faucet_contract: faucet,
        reward_factor: params.reward_factor || "0.5",
      },
      undefined,
      fee
    );
    if (isTxError(init)) {
      throw new Error(`Couldn't run: ${init.raw_log}`);
    }

    if (isTxError(init)) {
      throw new Error(
        `Couldn't upload ${this.contractInfo["collector"].codeId}: ${init.raw_log}`
      );
    }
    const collectorAddr =
      init.logs[0].eventsByType.instantiate_contract.contract_address[0];
    this.contractInfo["collector"].contractAddress = collectorAddr;

    console.log(
      `collector: { codeId: ${this.contractInfo.collector.codeId}, contractAddress: "${this.contractInfo.collector.contractAddress}"},`
    );
  }

  public async faucet_instantiation(
    sender: Wallet,
    params: {
      gov_contract?: string;
      anchor_token?: string;
      whitelist?: string[];
      spend_limit?: string;
    },
    fee?: StdFee
  ): Promise<void> {
    let contract = this.contractInfo["faucet"].codeId;
    let gov = this.contractInfo["gov"].contractAddress;
    let token = this.contractInfo["token"].contractAddress;
    const init = await instantiate(
      sender,
      contract,
      {
        gov_contract: gov,
        anchor_token: token,
        whitelist: params.whitelist,
        spend_limit: params.spend_limit || "100000000000",
      },
      undefined,
      fee
    );
    if (isTxError(init)) {
      throw new Error(`Couldn't run: ${init.raw_log}`);
    }

    if (isTxError(init)) {
      throw new Error(
        `Couldn't upload ${this.contractInfo["faucet"].codeId}: ${init.raw_log}`
      );
    }
    const faucetAddr =
      init.logs[0].eventsByType.instantiate_contract.contract_address[0];
    this.contractInfo["faucet"].contractAddress = faucetAddr;

    console.log(
      `faucet: { codeId: ${this.contractInfo.faucet.codeId}, contractAddress: "${this.contractInfo.faucet.contractAddress}"},`
    );
  }

  public async airdrop_instantiation(
    sender: Wallet,
    params: {
      owner?: string;
      anchor_token?: string;
    },
    fee?: StdFee
  ): Promise<void> {
    let contract = this.contractInfo["airdrop"].codeId;
    const init = await instantiate(
      sender,
      contract,
      {
        owner: params.owner || sender.key.accAddress,
        anchor_token:
          params.anchor_token || this.contractInfo.token.contractAddress,
      },
      undefined,
      fee
    );
    if (isTxError(init)) {
      throw new Error(`Couldn't run: ${init.raw_log}`);
    }

    if (isTxError(init)) {
      throw new Error(
        `Couldn't upload ${this.contractInfo["airdrop"].codeId}: ${init.raw_log}`
      );
    }
    const airdropAddr =
      init.logs[0].eventsByType.instantiate_contract.contract_address[0];
    this.contractInfo["airdrop"].contractAddress = airdropAddr;

    console.log(
      `airdrop: { codeId: ${this.contractInfo.airdrop.codeId}, contractAddress: "${this.contractInfo.airdrop.contractAddress}"},`
    );
  }

  public async instantiate_token(
    sender: Wallet,
    params: {
      name?: string;
      symbol?: string;
      decimals?: number;
      initial_balances?: object;
      mint?: Mint;
    },
    fee?: StdFee
  ): Promise<void> {
    const init = await instantiate(
      sender,
      this.contractInfo.token.codeId,
      {
        name: params.name,
        symbol: params.symbol,
        decimals: params.decimals,
        initial_balances: params.initial_balances || [
          {
            address: `${this.contractInfo["anchor_basset_hub"].contractAddress}`,
            amount: "1000000",
          },
        ],
        mint: {
          minter: params.mint?.minter || null,
          cap: params.mint?.cap || null,
        },
      },
      undefined,
      fee
    );
    if (isTxError(init)) {
      throw new Error(`Couldn't instantiate: ${init.raw_log}`);
    }

    const contractAddress =
      init.logs[0].eventsByType.instantiate_contract.contract_address[0];
    this.contractInfo.token.contractAddress = contractAddress;

    console.log(
      `anchor_token: { codeId: ${this.contractInfo.token.codeId}, contractAddress: "${this.contractInfo.anchor_basset_token.contractAddress}"},`
    );
  }

  public async collector_sweep(
    sender: Wallet,
    params: {
      denom: string;
    }
  ): Promise<void> {
    let contract = this.contractInfo["collector"].contractAddress;
    const updateExecution = await execute(sender, contract, {
      sweep: {
        denom: params.denom,
      },
    });
    if (isTxError(updateExecution)) {
      throw new Error(`Couldn't run: ${updateExecution.raw_log}`);
    }
  }

  public async collector_update_config(
    sender: Wallet,
    params: {
      reward_weight?: string;
    }
  ): Promise<void> {
    let contract = this.contractInfo["collector"].contractAddress;
    const updateExecution = await execute(sender, contract, {
      update_config: {
        denom: params.reward_weight,
      },
    });
    if (isTxError(updateExecution)) {
      throw new Error(`Couldn't run: ${updateExecution.raw_log}`);
    }
  }

  public async community_spend(
    sender: Wallet,
    params: {
      recipient: string;
      amount: string;
    }
  ): Promise<void> {
    let contract = this.contractInfo["community"].contractAddress;
    const updateExecution = await execute(sender, contract, {
      spend: {
        recipient: params.recipient,
        amount: new Int(new Dec(params.amount).mul(1000000)).toString(),
      },
    });
    if (isTxError(updateExecution)) {
      throw new Error(`Couldn't run: ${updateExecution.raw_log}`);
    }
  }

  public async community_update_config(
    sender: Wallet,
    params: {
      spend_limit?: string;
    }
  ): Promise<void> {
    let contract = this.contractInfo["community"].contractAddress;
    const updateExecution = await execute(sender, contract, {
      update_config: {
        spend_limit: params.spend_limit,
      },
    });
    if (isTxError(updateExecution)) {
      throw new Error(`Couldn't run: ${updateExecution.raw_log}`);
    }
  }

  public async faucet_spend(
    sender: Wallet,
    params: {
      recipient: string;
      amount: string;
    }
  ): Promise<void> {
    let contract = this.contractInfo["faucet"].contractAddress;
    const updateExecution = await execute(sender, contract, {
      spend: {
        recipient: params.recipient,
        amount: new Int(new Dec(params.amount).mul(1000000)).toString(),
      },
    });
    if (isTxError(updateExecution)) {
      throw new Error(`Couldn't run: ${updateExecution.raw_log}`);
    }
  }

  public async faucet_update_config(
    sender: Wallet,
    params: {
      spend_limit?: string;
    }
  ): Promise<void> {
    let contract = this.contractInfo["faucet"].contractAddress;
    const updateExecution = await execute(sender, contract, {
      update_config: {
        spend_limit: params.spend_limit,
      },
    });
    if (isTxError(updateExecution)) {
      throw new Error(`Couldn't run: ${updateExecution.raw_log}`);
    }
  }

  public async gov_cast_vote(
    sender: Wallet,
    params: {
      poll_id: number;
      vote: VoteOption;
      amount: string;
    }
  ): Promise<void> {
    let contract = this.contractInfo["gov"].contractAddress;
    const updateExecution = await execute(sender, contract, {
      cast_vote: {
        poll_id: params.poll_id,
        vote: params.vote,
        amount: new Int(new Dec(params.amount).mul(1000000)).toString(),
      },
    });
    if (isTxError(updateExecution)) {
      throw new Error(`Couldn't run: ${updateExecution.raw_log}`);
    }
  }

  public async gov_create_poll(
    sender: Wallet,
    params: {
      amount: string;
      title: string;
      description: string;
      link?: string;
      execute_msg?: ExecuteMsg;
    }
  ): Promise<void> {
    let contract = this.contractInfo["token"].contractAddress;
    const updateExecution = await execute(sender, contract, {
      send: {
        contract: this.contractInfo["gov"].contractAddress,
        amount: new Int(new Dec(params.amount).mul(1000000)).toString(),
        msg: Buffer.from(
          JSON.stringify({
            create_poll: {
              title: params.title,
              description: params.description,
              link: params.link,
              execute_msg: params.execute_msg,
            },
          })
        ).toString("base64"),
      },
    });
    if (isTxError(updateExecution)) {
      throw new Error(`Couldn't run: ${updateExecution.raw_log}`);
    }
  }

  public async gov_stake_voting(
    sender: Wallet,
    params: {
      amount: string;
    }
  ): Promise<void> {
    let contract = this.contractInfo["token"].contractAddress;
    const updateExecution = await execute(sender, contract, {
      send: {
        contract: this.contractInfo["gov"].contractAddress,
        amount: new Int(new Dec(params.amount).mul(1000000)).toString(),
        msg: Buffer.from(
          JSON.stringify({
            stake_voting_tokens: {},
          })
        ).toString("base64"),
      },
    });
    if (isTxError(updateExecution)) {
      throw new Error(`Couldn't run: ${updateExecution.raw_log}`);
    }
  }

  public async gov_end_poll(
    sender: Wallet,
    params: {
      poll_id: number;
    }
  ): Promise<void> {
    let contract = this.contractInfo["gov"].contractAddress;
    const updateExecution = await execute(sender, contract, {
      end_poll: {
        poll_id: params.poll_id,
      },
    });
    if (isTxError(updateExecution)) {
      throw new Error(`Couldn't run: ${updateExecution.raw_log}`);
    }
  }

  public async gov_execute_poll(
    sender: Wallet,
    params: {
      poll_id: number;
    }
  ): Promise<void> {
    let contract = this.contractInfo["gov"].contractAddress;
    const updateExecution = await execute(sender, contract, {
      execute_poll: {
        poll_id: params.poll_id,
      },
    });
    if (isTxError(updateExecution)) {
      throw new Error(`Couldn't run: ${updateExecution.raw_log}`);
    }
  }

  public async gov_expire_poll(
    sender: Wallet,
    params: {
      poll_id: number;
    }
  ): Promise<void> {
    let contract = this.contractInfo["gov"].contractAddress;
    const updateExecution = await execute(sender, contract, {
      expire_poll: {
        poll_id: params.poll_id,
      },
    });
    if (isTxError(updateExecution)) {
      throw new Error(`Couldn't run: ${updateExecution.raw_log}`);
    }
  }

  public async gov_snapshot_poll(
    sender: Wallet,
    params: {
      poll_id: number;
    }
  ): Promise<void> {
    let contract = this.contractInfo["gov"].contractAddress;
    const updateExecution = await execute(sender, contract, {
      snapshot_poll: {
        poll_id: params.poll_id,
      },
    });
    if (isTxError(updateExecution)) {
      throw new Error(`Couldn't run: ${updateExecution.raw_log}`);
    }
  }

  public async gov_withdraw_voting(
    sender: Wallet,
    params: {
      amount: string;
    }
  ): Promise<void> {
    let contract = this.contractInfo["gov"].contractAddress;
    const updateExecution = await execute(sender, contract, {
      withdraw_voting_tokens: {
        amount: new Int(new Dec(params.amount).mul(1000000)).toString(),
      },
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
      snapshot_period?: string;
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
      },
    });
    if (isTxError(updateExecution)) {
      throw new Error(`Couldn't run: ${updateExecution.raw_log}`);
    }
  }

  public async staking_bond(
    sender: Wallet,
    params: {
      amount: string;
    }
  ): Promise<void> {
    let contract = this.contractInfo["token"].contractAddress;
    const updateExecution = await execute(sender, contract, {
      send: {
        contract: this.contractInfo["staking"].contractAddress,
        amount: new Int(new Dec(params.amount).mul(1000000)).toString(),
        msg: Buffer.from(
          JSON.stringify({
            bond: {},
          })
        ).toString("base64"),
      },
    });
    if (isTxError(updateExecution)) {
      throw new Error(`Couldn't run: ${updateExecution.raw_log}`);
    }
  }

  public async staking_deposit(
    sender: Wallet,
    params: {
      amount: string;
    }
  ): Promise<void> {
    let contract = this.contractInfo["token"].contractAddress;
    const updateExecution = await execute(sender, contract, {
      send: {
        contract: this.contractInfo["staking"].contractAddress,
        amount: new Int(new Dec(params.amount).mul(1000000)).toString(),
        msg: Buffer.from(
          JSON.stringify({
            deposit_reward: {},
          })
        ).toString("base64"),
      },
    });
    if (isTxError(updateExecution)) {
      throw new Error(`Couldn't run: ${updateExecution.raw_log}`);
    }
  }

  public async staking_unbond(
    sender: Wallet,
    params: {
      amount: string;
    }
  ): Promise<void> {
    let contract = this.contractInfo["staking"].contractAddress;
    const updateExecution = await execute(sender, contract, {
      unbond: {
        amount: new Int(new Dec(params.amount).mul(1000000)).toString(),
      },
    });
    if (isTxError(updateExecution)) {
      throw new Error(`Couldn't run: ${updateExecution.raw_log}`);
    }
  }

  public async staking_withdraw(sender: Wallet, params: {}): Promise<void> {
    let contract = this.contractInfo["staking"].contractAddress;
    const updateExecution = await execute(sender, contract, { withdraw: {} });
    if (isTxError(updateExecution)) {
      throw new Error(`Couldn't run: ${updateExecution.raw_log}`);
    }
  }
}
