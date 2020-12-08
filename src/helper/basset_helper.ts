import {
  Coin,
  Coins,
  isTxError,
  LocalTerra,
  Msg,
  MsgExecuteContract,
  MsgInstantiateContract,
  MsgSend,
  MsgStoreCode,
  StdFee,
  Wallet,
} from "@terra-money/terra.js";
import * as fs from "fs";

const terra = new LocalTerra();

const contracts = [
  "anchor_basset_hub",
  "anchor_basset_reward",
  "anchor_basset_token",
];

export default class AnchorbAsset {
  public contractInfo: {
    [contractName: string]: { codeId: number; contractAddress: string };
  };

  constructor() {
    this.contractInfo = {};
  }

  public async storeCodes(sender: Wallet, location: string): Promise<void> {
    for (const c of contracts) {
      const bytecode = fs.readFileSync(__dirname + `${location}/${c}.wasm`);
      const storeCode = new MsgStoreCode(
        sender.key.accAddress,
        bytecode.toString("base64")
      );
      const tx = await sender.createAndSignTx({
        msgs: [storeCode],
      });
      const result = await terra.tx.broadcast(tx);
      if (isTxError(result)) {
        throw new Error(`Couldn't upload ${c}: ${result.raw_log}`);
      }

      const codeId = +result.logs[0].eventsByType.store_code.code_id[0];
      this.contractInfo[c] = {
        codeId,
        contractAddress: "",
      };
    }
  }

  public async instantiate(sender: Wallet): Promise<void> {
    const instantiate = new MsgInstantiateContract(
      sender.key.accAddress,
      this.contractInfo.anchor_basset_hub.codeId,
      {
        name: "bluna",
        symbol: "BLUNA",
        decimals: 6,
        reward_code_id: this.contractInfo.anchor_basset_reward.codeId,
        token_code_id: this.contractInfo.anchor_basset_token.codeId,
      }
    );
    const tx = await sender.createAndSignTx({
      msgs: [instantiate],
    });
    const result = await terra.tx.broadcast(tx);
    if (isTxError(result)) {
      throw new Error(`Couldn't instantiate: ${result.raw_log}`);
    }

    const contractAddress =
      result.logs[0].eventsByType.instantiate_contract.contract_address[2];
    const contractAddress2 =
      result.logs[0].eventsByType.instantiate_contract.contract_address[1];
    const contractAddress3 =
      result.logs[0].eventsByType.instantiate_contract.contract_address[0];
    this.contractInfo.anchor_basset_hub.contractAddress = contractAddress;
    this.contractInfo.anchor_basset_reward.contractAddress = contractAddress2;
    this.contractInfo.anchor_basset_token.contractAddress = contractAddress3;

    console.log(
      `anchor_basset_hub: { codeId: ${this.contractInfo.anchor_basset_hub.codeId}, contractAddress: "${this.contractInfo.anchor_basset_hub.contractAddress}"},`
    );
    console.log(
      `anchor_basset_reward: { codeId: ${this.contractInfo.anchor_basset_reward.codeId},  contractAddress: "${this.contractInfo.anchor_basset_reward.contractAddress}"},`
    );
    console.log(
      `anchor_basset_token: { codeId: ${this.contractInfo.anchor_basset_token.codeId}, contractAddress: "${this.contractInfo.anchor_basset_token.contractAddress}"}`
    );
  }

  public async register_validator(sender: Wallet): Promise<void> {
    const msg = new MsgExecuteContract(
      sender.key.accAddress,
      this.contractInfo.anchor_basset_hub.contractAddress,
      {
        register_validator: {
          validator: "terravaloper1dcegyrekltswvyy0xy69ydgxn9x8x32zdy3ua5",
        },
      }
    );

    const tx = await sender.createAndSignTx({
      msgs: [msg],
      fee: new StdFee(2000000, { uluna: 10000000 }),
    });

    const result = await terra.tx.broadcast(tx);
    if (isTxError(result)) {
      throw new Error(`Couldn't run: ${result.raw_log}`);
    }
  }

  public async bond(
    sender: Wallet,
    amount: number,
    validator: string
  ): Promise<void> {
    const msg = new MsgExecuteContract(
      sender.key.accAddress,
      this.contractInfo.anchor_basset_hub.contractAddress,
      {
        bond: {
          validator: `${validator}`,
        },
      },
      { uluna: amount }
    );

    const tx = await sender.createAndSignTx({
      msgs: [msg],
      fee: new StdFee(2000000000, { uluna: 100000000000 }),
    });

    const result = await terra.tx.broadcast(tx);
    if (isTxError(result)) {
      throw new Error(`Couldn't run: ${result.raw_log}`);
    }
  }

  public async params(sender: Wallet): Promise<void> {
    const msg = new MsgExecuteContract(
      sender.key.accAddress,
      this.contractInfo.anchor_basset_hub.contractAddress,
      {
        update_params: {
          epoch_time: 30,
          underlying_coin_denom: "uluna",
          undelegated_epoch: 2,
          peg_recovery_fee: "0",
          er_threshold: "1",
          swap_denom: "uusd",
        },
      }
    );

    const tx = await sender.createAndSignTx({
      msgs: [msg],
      fee: new StdFee(2000000, { uluna: 10000000 }),
    });

    const result = await terra.tx.broadcast(tx);
    if (isTxError(result)) {
      throw new Error(`Couldn't run: ${result.raw_log}`);
    }
  }

  public async send_cw20_token(sender: Wallet, amount: number): Promise<void> {
    const msg = new MsgExecuteContract(
      sender.key.accAddress,
      this.contractInfo.anchor_basset_token.contractAddress,
      {
        send: {
          contract: `${this.contractInfo.anchor_basset_hub.contractAddress}`,
          amount: `${amount}`,
          msg: "eyJ1bmJvbmQiOnt9fQ==",
        },
      }
    );

    const tx = await sender.createAndSignTx({
      msgs: [msg],
      fee: new StdFee(101200000, { uluna: 101200000 }),
    });

    const result = await terra.tx.broadcast(tx);
    if (isTxError(result)) {
      throw new Error(`Couldn't run: ${result.raw_log}`);
    }
  }

  public async transfer_cw20_token(
    sender: Wallet,
    rcv: Wallet,
    amount: number
  ): Promise<void> {
    const msg = new MsgExecuteContract(
      sender.key.accAddress,
      this.contractInfo.anchor_basset_token.contractAddress,
      {
        transfer: {
          recipient: `${rcv.key.accAddress}`,
          amount: `${amount}`,
        },
      }
    );

    const tx = await sender.createAndSignTx({
      msgs: [msg],
      fee: new StdFee(101200000, { uluna: 101200000 }),
    });

    const result = await terra.tx.broadcast(tx);
    if (isTxError(result)) {
      throw new Error(`Couldn't run: ${result.raw_log}`);
    }
  }

  public async finish(sender: Wallet): Promise<void> {
    const msg = new MsgExecuteContract(
      sender.key.accAddress,
      this.contractInfo.anchor_basset_hub.contractAddress,
      {
        withdraw_unbonded: {},
      }
    );

    const tx = await sender.createAndSignTx({
      msgs: [msg],
      fee: new StdFee(2000000, { uluna: 10000000 }),
    });

    const result = await terra.tx.broadcast(tx);
    if (isTxError(result)) {
      throw new Error(`Couldn't run: ${result.raw_log}`);
    }
  }

  public async update_global(sender: Wallet): Promise<void> {
    const msg = new MsgExecuteContract(
      sender.key.accAddress,
      this.contractInfo.anchor_basset_hub.contractAddress,
      {
        update_global_index: {},
      }
    );

    const tx = await sender.createAndSignTx({
      msgs: [msg],
      fee: new StdFee(2000000, { uluna: 10000000 }),
    });

    const result = await terra.tx.broadcast(tx);
    if (isTxError(result)) {
      throw new Error(`Couldn't run: ${result.raw_log}`);
    }
  }

  public async reward(sender: Wallet): Promise<void> {
    const msg = new MsgExecuteContract(
      sender.key.accAddress,
      this.contractInfo.anchor_basset_reward.contractAddress,
      {
        claim_rewards: { recipient: null },
      }
    );

    const tx = await sender.createAndSignTx({
      msgs: [msg],
      fee: new StdFee(2000000, { uluna: 10000000 }),
    });

    const result = await terra.tx.broadcast(tx);
    if (isTxError(result)) {
      throw new Error(`Couldn't run: ${result.raw_log}`);
    }
  }

  public async slashing(sender: Wallet): Promise<void> {
    const msg = new MsgExecuteContract(
      sender.key.accAddress,
      this.contractInfo.anchor_basset_hub.contractAddress,
      {
        check_slashing: {},
      }
    );

    const tx = await sender.createAndSignTx({
      msgs: [msg],
      fee: new StdFee(2000000, { uluna: 10000000 }),
    });

    const result = await terra.tx.broadcast(tx);
    if (isTxError(result)) {
      throw new Error(`Couldn't run: ${result.raw_log}`);
    }
  }

  public async increase_allowance(
    sender: Wallet,
    spender: string,
    amount: number,
    height: number
  ): Promise<void> {
    const execution = await execute(
      sender,
      this.contractInfo.anchor_basset_token.contractAddress,
      {
        increase_allowance: {
          spender: spender,
          amount: `${amount}`,
          expires: {
            at_height: `${height}`,
          },
        },
      }
    );
    if (isTxError(execution)) {
      throw new Error(`Couldn't run: ${execution.raw_log}`);
    }
  }

  public async bank_send(
    sender: Wallet,
    receiver: string,
    amount: Coin
  ): Promise<void> {
    const msg = await execute_bank(sender, amount, receiver);
    if (isTxError(msg)) {
      throw new Error(`Couldn't run: ${msg.raw_log}`);
    }
  }
}

// TODO: move all transactions using the following codes.
async function instantiate(
  sender: Wallet,
  codeId: number,
  initMsg: object,
  tokens?: Coins
): ReturnType<typeof send_transaction> {
  console.error(`instantiate ${codeId} w/ ${JSON.stringify(initMsg)}`);
  return await send_transaction(sender, [
    new MsgInstantiateContract(sender.key.accAddress, codeId, initMsg, tokens),
  ]);
}

async function execute(
  sender: Wallet,
  contract: string,
  executeMsg: object,
  tokens?: Coins
): ReturnType<typeof send_transaction> {
  console.error(`execute ${contract} w/ ${JSON.stringify(executeMsg)}`);
  return await send_transaction(sender, [
    new MsgExecuteContract(sender.key.accAddress, contract, executeMsg, tokens),
  ]);
}

async function execute_bank(
  sender: Wallet,
  amount: Coin,
  to: string
): ReturnType<typeof send_transaction> {
  return await send_transaction(sender, [
    new MsgSend(sender.key.accAddress, to, [amount]),
  ]);
}

async function send_transaction(
  sender: Wallet,
  msgs: Msg[]
): ReturnType<typeof terra.tx.broadcast> {
  return Promise.resolve()
    .then(() => sender.createAndSignTx({ msgs, gasAdjustment: 1.4 }))
    .then((tx) => terra.tx.broadcast(tx));
}
