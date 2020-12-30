import {
  Coin,
  Coins,
  isTxError,
  MsgSend,
  MsgStoreCode,
  StdFee,
  Wallet,
} from "@terra-money/terra.js";
import * as fs from "fs";
import { execute, instantiate, send_transaction } from "./flow/execution";

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
      const bytecode = fs.readFileSync(`${location}/${c}.wasm`);
      const storeCode = new MsgStoreCode(
        sender.key.accAddress,
        bytecode.toString("base64")
      );

      const result = await send_transaction(sender, [storeCode]);
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

  public async instantiate_hub(sender: Wallet): Promise<void> {
    const init = await instantiate(
      sender,
      this.contractInfo.anchor_basset_hub.codeId,
      {
        epoch_period: 30,
        underlying_coin_denom: "uluna",
        unbonding_period: 211,
        peg_recovery_fee: "0.001",
        er_threshold: "1",
        reward_denom: "uusd",
      }
    );
    if (isTxError(init)) {
      throw new Error(`Couldn't instantiate: ${init.raw_log}`);
    }

    const contractAddress =
      init.logs[0].eventsByType.instantiate_contract.contract_address[0];
    this.contractInfo.anchor_basset_hub.contractAddress = contractAddress;

    console.log(
      `anchor_basset_hub: { codeId: ${this.contractInfo.anchor_basset_hub.codeId}, contractAddress: "${this.contractInfo.anchor_basset_hub.contractAddress}"},`
    );
  }

  public async instantiate_reward(sender: Wallet): Promise<void> {
    const init = await instantiate(
      sender,
      this.contractInfo.anchor_basset_reward.codeId,
      {
        hub_contract: `${this.contractInfo["anchor_basset_hub"].contractAddress}`,
        reward_denom: "uusd",
      }
    );
    if (isTxError(init)) {
      throw new Error(`Couldn't instantiate: ${init.raw_log}`);
    }

    const contractAddress =
      init.logs[0].eventsByType.instantiate_contract.contract_address[0];
    this.contractInfo.anchor_basset_reward.contractAddress = contractAddress;

    console.log(
      `anchor_basset_reward: { codeId: ${this.contractInfo.anchor_basset_reward.codeId}, contractAddress: "${this.contractInfo.anchor_basset_reward.contractAddress}"},`
    );
  }

  public async instantiate_token(sender: Wallet): Promise<void> {
    const init = await instantiate(
      sender,
      this.contractInfo.anchor_basset_token.codeId,
      {
        name: "bluna",
        symbol: "BLUNA",
        decimals: 6,
        initial_balances: [],
        mint: {
          minter: `${this.contractInfo["anchor_basset_hub"].contractAddress}`,
          cap: null,
        },
        hub_contract: `${this.contractInfo["anchor_basset_hub"].contractAddress}`,
      }
    );
    if (isTxError(init)) {
      throw new Error(`Couldn't instantiate: ${init.raw_log}`);
    }

    const contractAddress =
      init.logs[0].eventsByType.instantiate_contract.contract_address[0];
    this.contractInfo.anchor_basset_token.contractAddress = contractAddress;

    console.log(
      `anchor_basset_token: { codeId: ${this.contractInfo.anchor_basset_token.codeId}, contractAddress: "${this.contractInfo.anchor_basset_token.contractAddress}"},`
    );
  }

  public async register_contracts(sender: Wallet) {
    const msg = await execute(
      sender,
      this.contractInfo["anchor_basset_hub"].contractAddress,
      {
        register_subcontracts: {
          contract: "reward",
          contract_address: `${this.contractInfo["anchor_basset_reward"].contractAddress}`,
        },
      }
    );

    if (isTxError(msg)) {
      throw new Error(`Couldn't run: ${msg.raw_log}`);
    }

    const msg2 = await execute(
      sender,
      this.contractInfo["anchor_basset_hub"].contractAddress,
      {
        register_subcontracts: {
          contract: "token",
          contract_address: `${this.contractInfo["anchor_basset_token"].contractAddress}`,
        },
      }
    );

    if (isTxError(msg2)) {
      throw new Error(`Couldn't run: ${msg2.raw_log}`);
    }
  }

  public async register_validator(
    sender: Wallet,
    validator: string
  ): Promise<void> {
    const contract = this.contractInfo.anchor_basset_hub.contractAddress;
    const registerValidatorExecution = await execute(sender, contract, {
      register_validator: {
        validator: `${validator}`,
      },
    });
    if (isTxError(registerValidatorExecution)) {
      throw new Error(`Couldn't run: ${registerValidatorExecution.raw_log}`);
    }
  }

  public async bond(
    sender: Wallet,
    amount: number,
    validator: string
  ): Promise<void> {
    const coin = new Coin("uluna", amount);
    const coins = new Coins([coin]);
    const contract = this.contractInfo["anchor_basset_hub"].contractAddress;
    const bondExecution = await execute(
      sender,
      contract,
      {
        bond: {
          validator: `${validator}`,
        },
      },
      coins
    );
    if (isTxError(bondExecution)) {
      throw new Error(`Couldn't run: ${bondExecution.raw_log}`);
    }
  }

  public async params(sender: Wallet): Promise<void> {
    const contract = this.contractInfo.anchor_basset_hub.contractAddress;
    const paramsExecution = await execute(sender, contract, {
      update_params: {
        epoch_time: 31,
        underlying_coin_denom: "uluna",
        undelegated_epoch: 7,
        peg_recovery_fee: "0.001",
        er_threshold: "1",
        swap_denom: "uusd",
      },
    });
    if (isTxError(paramsExecution)) {
      throw new Error(`Couldn't run: ${paramsExecution.raw_log}`);
    }
  }

  public async send_cw20_token(
    sender: Wallet,
    amount: number,
    inputMsg: object,
    contracAddr: string
  ): Promise<void> {
    const contract = this.contractInfo.anchor_basset_token.contractAddress;
    const sendExecuttion = await execute(sender, contract, {
      send: {
        contract: contracAddr,
        amount: `${amount}`,
        msg: Buffer.from(JSON.stringify(inputMsg)).toString("base64"),
      },
    });
    if (isTxError(sendExecuttion)) {
      throw new Error(`Couldn't run: ${sendExecuttion.raw_log}`);
    }
  }

  public async transfer_cw20_token(
    sender: Wallet,
    rcv: Wallet,
    amount: number
  ): Promise<void> {
    const contract = this.contractInfo.anchor_basset_token.contractAddress;
    const transferExecuttion = await execute(sender, contract, {
      transfer: {
        recipient: `${rcv.key.accAddress}`,
        amount: `${amount}`,
      },
    });
    if (isTxError(transferExecuttion)) {
      throw new Error(`Couldn't run: ${transferExecuttion.raw_log}`);
    }
  }

  public async finish(sender: Wallet): Promise<void> {
    const contract = this.contractInfo.anchor_basset_hub.contractAddress;
    const finishExecution = await execute(sender, contract, {
      withdraw_unbonded: {},
    });
    if (isTxError(finishExecution)) {
      throw new Error(`Couldn't run: ${finishExecution.raw_log}`);
    }
  }

  public async update_global_index(sender: Wallet): Promise<void> {
    const contract = this.contractInfo.anchor_basset_hub.contractAddress;
    const finishExe = await execute(sender, contract, {
      update_global_index: {},
    });
    if (isTxError(finishExe)) {
      throw new Error(`Couldn't run: ${finishExe.raw_log}`);
    }
  }

  public async reward(sender: Wallet): Promise<void> {
    const contract = this.contractInfo.anchor_basset_reward.contractAddress;
    const rewardExe = await execute(sender, contract, {
      claim_rewards: { recipient: null },
    });
    if (isTxError(rewardExe)) {
      throw new Error(`Couldn't run: ${rewardExe.raw_log}`);
    }
  }

  public async slashing(sender: Wallet): Promise<void> {
    const contract = this.contractInfo.anchor_basset_hub.contractAddress;
    const slashingExe = await execute(sender, contract, {
      check_slashing: {},
    });
    if (isTxError(slashingExe)) {
      throw new Error(`Couldn't run: ${slashingExe.raw_log}`);
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
    amount: Coins
  ): Promise<void> {
    const msg = await execute_bank(sender, amount, receiver);
    if (isTxError(msg)) {
      throw new Error(`Couldn't run: ${msg.raw_log}`);
    }
  }
}

async function execute_bank(
  sender: Wallet,
  amount: Coins,
  to: string
): ReturnType<typeof send_transaction> {
  return await send_transaction(sender, [
    new MsgSend(sender.key.accAddress, to, amount),
  ]);
}
