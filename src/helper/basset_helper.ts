import {
  Coin,
  Coins,
  isTxError,
  MsgSend,
  MsgStoreCode,
  Fee,
  Wallet,
  LCDClient,
  MsgExecuteContract,
  LegacyAminoMultisigPublicKey,
  MnemonicKey,
  SignDoc,
} from "@terra-money/terra.js";
import { SignatureV2 } from "@terra-money/terra.js/dist/core/SignatureV2";
import { MultiSignature } from "@terra-money/terra.js/dist/core/MultiSignature";
import * as fs from "fs";
import { execute, instantiate, send_transaction } from "./flow/execution";

type Mint = {
  minter: string;
  cap?: number;
};

const contracts = [
  "lido_terra_airdrop_registry",
  "lido_terra_hub",
  "lido_terra_reward",
  "lido_terra_token",
  "lido_terra_token_stluna",
  "lido_terra_rewards_dispatcher",
  "lido_terra_validators_registry",
];

type Expire = { at_height: number } | { at_time: number } | { never: {} };

export default class AnchorbAsset {
  public contractInfo: {
    [contractName: string]: { codeId: number; contractAddress: string };
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

  public async instantiate_validators_registry(
    sender: Wallet,
    params: {
      registry?: Array<{
        active: boolean;
        total_delegated?: string;
        address: string;
      }>;
      hub_contract: string;
    },
    fee?: Fee
  ): Promise<void> {
    const init = await instantiate(
      sender,
      this.contractInfo.lido_terra_validators_registry.codeId,
      {
        registry: params.registry || [],
        hub_contract:
          params.hub_contract ||
          this.contractInfo.lido_terra_hub.contractAddress,
      },
      undefined
    );
    if (isTxError(init)) {
      throw new Error(`Couldn't instantiate: ${init.raw_log}`);
    }
    const contractAddress =
      init.logs[0].eventsByType.instantiate_contract.contract_address[0];
    this.contractInfo.lido_terra_validators_registry.contractAddress = contractAddress;

    console.log(
      `lido_terra_validators_registry: { codeId: ${this.contractInfo.lido_terra_validators_registry.codeId}, contractAddress: "${this.contractInfo.lido_terra_validators_registry.contractAddress}"},`
    );
  }

  public async instantiate_st_luna(
    sender: Wallet,
    params: {
      name?: string;
      symbol?: string;
      decimals?: number;
      initial_balances?: [];
      mint?: null;
      hub_contract?: string;
    },
    fee?: Fee
  ): Promise<void> {
    const init = await instantiate(
      sender,
      this.contractInfo.lido_terra_token_stluna.codeId,
      {
        name: params.name || "test_name",
        symbol: params.symbol || "AAA",
        decimals: params.decimals || 6,
        initial_balances: params.initial_balances || [],
        hub_contract:
          params.hub_contract ||
          this.contractInfo.lido_terra_hub.contractAddress,
        mint: params.mint,
      },
      undefined
    );
    if (isTxError(init)) {
      throw new Error(`Couldn't instantiate: ${init.raw_log}`);
    }
    const contractAddress =
      init.logs[0].eventsByType.instantiate_contract.contract_address[0];
    this.contractInfo.lido_terra_token_stluna.contractAddress = contractAddress;

    console.log(
      `lido_terra_token_stluna: { codeId: ${this.contractInfo.lido_terra_token_stluna.codeId}, contractAddress: "${this.contractInfo.lido_terra_token_stluna.contractAddress}"},`
    );
  }

  public async instantiate_lido_terra_rewards_dispatcher(
    sender: Wallet,
    params: {
      hub_contract?: string;
      bluna_reward_contract?: string;
      lido_fee_address?: string;
    },
    fee?: Fee
  ): Promise<void> {
    const init = await instantiate(
      sender,
      this.contractInfo.lido_terra_rewards_dispatcher.codeId,
      {
        hub_contract:
          params.hub_contract ||
          this.contractInfo.lido_terra_hub.contractAddress,
        bluna_reward_contract:
          params.bluna_reward_contract ||
          this.contractInfo["lido_terra_reward"].contractAddress,
        stluna_reward_denom: "uluna",
        bluna_reward_denom: "uusd",
        //FIX: change to real fee address?
        lido_fee_address:
          params.lido_fee_address ||
          this.contractInfo["lido_terra_token"].contractAddress,
        lido_fee_rate: "0.005",
      },
      undefined
    );
    if (isTxError(init)) {
      throw new Error(`Couldn't instantiate: ${init.raw_log}`);
    }
    const contractAddress =
      init.logs[0].eventsByType.instantiate_contract.contract_address[0];
    this.contractInfo.lido_terra_rewards_dispatcher.contractAddress = contractAddress;

    console.log(
      `lido_terra_rewards_dispatcher: { codeId: ${this.contractInfo.lido_terra_rewards_dispatcher.codeId}, contractAddress: "${this.contractInfo.lido_terra_rewards_dispatcher.contractAddress}"},`
    );
  }

  public async instantiate_hub(
    sender: Wallet,
    params: {
      epoch_period?: number;
      underlying_coin_denom?: string;
      unbonding_period?: number;
      peg_recovery_fee?: string;
      er_threshold?: string;
      reward_denom?: string;
      validator?: string;
    },
    fee?: Fee
  ): Promise<void> {
    const coins = new Coins([]);
    const init = await instantiate(
      sender,
      this.contractInfo.lido_terra_hub.codeId,
      {
        //FIXME: The epoch period and unbonding period must be changed
        epoch_period: params?.epoch_period,
        underlying_coin_denom: params?.underlying_coin_denom,
        unbonding_period: params?.unbonding_period,
        peg_recovery_fee: params?.peg_recovery_fee,
        er_threshold: params?.er_threshold,
        reward_denom: params?.reward_denom,
        validator: params?.validator,
      },
      coins,
      fee
    );
    if (isTxError(init)) {
      throw new Error(`Couldn't instantiate: ${init.raw_log}`);
    }

    const contractAddress =
      init.logs[0].eventsByType.instantiate_contract.contract_address[0];
    this.contractInfo.lido_terra_hub.contractAddress = contractAddress;

    console.log(
      `lido_terra_hub: { codeId: ${this.contractInfo.lido_terra_hub.codeId}, contractAddress: "${this.contractInfo.lido_terra_hub.contractAddress}"},`
    );
  }

  public async instantiate_reward(
    sender: Wallet,
    params: {
      hub_contract?: string;
      reward_denom?: string;
    },
    fee?: Fee
  ): Promise<void> {
    const init = await instantiate(
      sender,
      this.contractInfo.lido_terra_reward.codeId,
      {
        hub_contract:
          params.hub_contract ||
          `${this.contractInfo["lido_terra_hub"].contractAddress}`,
        reward_denom: params.reward_denom || "uusd",
      },
      undefined,
      fee
    );
    if (isTxError(init)) {
      throw new Error(`Couldn't instantiate: ${init.raw_log}`);
    }

    const contractAddress =
      init.logs[0].eventsByType.instantiate_contract.contract_address[0];
    this.contractInfo.lido_terra_reward.contractAddress = contractAddress;

    console.log(
      `lido_terra_reward: { codeId: ${this.contractInfo.lido_terra_reward.codeId}, contractAddress: "${this.contractInfo.lido_terra_reward.contractAddress}"},`
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
      hub_contract?: string;
    },
    fee?: Fee
  ): Promise<void> {
    const init = await instantiate(
      sender,
      this.contractInfo.lido_terra_token.codeId,
      {
        name: params.name || "bondedLuna",
        symbol: params.symbol || "BLUNA",
        decimals: params.decimals || 6,
        initial_balances:
          params.initial_balances ||
          [
            // cause new hub doesn't have initial bond
            // {
            //     address: `${this.contractInfo["lido_terra_hub"].contractAddress}`,
            //     amount: "1000000",
            // },
          ],
        mint: {
          minter:
            params.mint?.minter ||
            `${this.contractInfo["lido_terra_hub"].contractAddress}`,
          cap: params.mint?.cap || null,
        },
        hub_contract:
          params.hub_contract ||
          `${this.contractInfo["lido_terra_hub"].contractAddress}`,
      },
      undefined,
      fee
    );
    if (isTxError(init)) {
      throw new Error(`Couldn't instantiate: ${init.raw_log}`);
    }

    const contractAddress =
      init.logs[0].eventsByType.instantiate_contract.contract_address[0];
    this.contractInfo.lido_terra_token.contractAddress = contractAddress;

    console.log(
      `lido_terra_token: { codeId: ${this.contractInfo.lido_terra_token.codeId}, contractAddress: "${this.contractInfo.lido_terra_token.contractAddress}"},`
    );
  }

  public async instantiate_airdrop(
    sender: Wallet,
    params: {
      hub_contract?: string;
      reward_contract?: string;
    },
    fee?: Fee
  ) {
    const init = await instantiate(
      sender,
      this.contractInfo.lido_terra_airdrop_registry.codeId,
      {
        hub_contract: this.contractInfo.lido_terra_hub.contractAddress,
        reward_contract: this.contractInfo.lido_terra_reward.contractAddress,
      },
      undefined,
      fee
    );

    if (isTxError(init)) {
      throw new Error(`Couldn't run: ${init.raw_log}`);
    }

    const contractAddress =
      init.logs[0].eventsByType.instantiate_contract.contract_address[0];
    this.contractInfo.lido_terra_airdrop_registry.contractAddress = contractAddress;

    console.log(
      `lido_terra_airdrop_registery: { codeId: ${this.contractInfo.lido_terra_airdrop_registry.codeId}, contractAddress: "${this.contractInfo.lido_terra_airdrop_registry.contractAddress}"},`
    );
  }

  public async register_contracts(
    sender: Wallet,
    params: {
      reward_address?: string;
      token_address?: string;
      airdrop_registry_contract?: string;
      validators_registry?: string;
      rewards_dispatcher_contract?: string;
      stluna_token_contract?: string;
    },
    fee?: Fee
  ) {
    const msg = await execute(
      sender,
      this.contractInfo["lido_terra_hub"].contractAddress,
      {
        update_config: {
          owner: undefined,
          rewards_dispatcher_contract:
            params.rewards_dispatcher_contract ||
            `${this.contractInfo["lido_terra_rewards_dispatcher"].contractAddress}`,
          stluna_token_contract:
            params.stluna_token_contract ||
            `${this.contractInfo["lido_terra_token_stluna"].contractAddress}`,
          bluna_token_contract:
            params.token_address ||
            `${this.contractInfo["lido_terra_token"].contractAddress}`,
          airdrop_registry_contract:
            params.airdrop_registry_contract ||
            `${this.contractInfo["lido_terra_airdrop_registry"].contractAddress}`,
          validators_registry_contract:
            params.validators_registry ||
            `${this.contractInfo.lido_terra_validators_registry.contractAddress}`,
        },
      },
      undefined,
      fee
    );
    if (isTxError(msg)) {
      throw new Error(`Couldn't run: ${msg.raw_log}`);
    }
  }

  public async register_validator(
    sender: Wallet,
    validator: string,
    fee?: Fee
  ): Promise<void> {
    const contract = this.contractInfo.lido_terra_hub.contractAddress;
    const registerValidatorExecution = await execute(
      sender,
      contract,
      {
        register_validator: {
          validator: `${validator}`,
        },
      },
      undefined,
      fee
    );
    if (isTxError(registerValidatorExecution)) {
      throw new Error(`Couldn't run: ${registerValidatorExecution.raw_log}`);
    }
  }

  public async add_validator(
    sender: Wallet,
    validatorAddress: string
  ): Promise<void> {
    const contract = this.contractInfo.lido_terra_validators_registry
      .contractAddress;
    const addValidatorExecution = await execute(sender, contract, {
      add_validator: {
        validator: {
          address: `${validatorAddress}`,
          active: true,
        },
      },
    });
    if (isTxError(addValidatorExecution)) {
      throw new Error(`Couldn't run: ${addValidatorExecution.raw_log}`);
    }
  }

  public async remove_validator(
    sender: Wallet,
    validatorAddress: string
  ): Promise<void> {
    const contract = this.contractInfo.lido_terra_validators_registry
      .contractAddress;
    const removeValidatorExecution = await execute(sender, contract, {
      remove_validator: {
        address: `${validatorAddress}`,
      },
    });
    if (isTxError(removeValidatorExecution)) {
      throw new Error(`Couldn't run: ${removeValidatorExecution.raw_log}`);
    }
  }

  public async bond(sender: Wallet, amount: number): Promise<void> {
    const coin = new Coin("uluna", amount);
    const coins = new Coins([coin]);
    const contract = this.contractInfo["lido_terra_hub"].contractAddress;
    const bondExecution = await execute(
      sender,
      contract,
      {
        bond: {},
      },
      coins
    );
    if (isTxError(bondExecution)) {
      throw new Error(`Couldn't run: ${bondExecution.raw_log}`);
    }
  }

  public async bond_for_stluna(sender: Wallet, amount: number): Promise<void> {
    const coin = new Coin("uluna", amount);
    const coins = new Coins([coin]);
    const contract = this.contractInfo["lido_terra_hub"].contractAddress;
    const bondExecution = await execute(
      sender,
      contract,
      {
        bond_for_st_luna: {},
      },
      coins
    );
    if (isTxError(bondExecution)) {
      throw new Error(`Couldn't run: ${bondExecution.raw_log}`);
    }
  }
  public async convert_stluna_to_bluna(
    sender: Wallet,
    amount: number
  ): Promise<void> {
    const coin = new Coin("uluna", amount);
    const coins = new Coins([coin]);
    const contract = this.contractInfo["lido_terra_token_stluna"]
      .contractAddress;
    const sendExecuttion = await execute(sender, contract, {
      send: {
        contract: this.contractInfo["lido_terra_hub"].contractAddress,
        amount: `${amount}`,
        msg: Buffer.from(JSON.stringify({ convert: {} })).toString("base64"),
      },
    });
    if (isTxError(sendExecuttion)) {
      throw new Error(`Couldn't run: ${sendExecuttion.raw_log}`);
    }
  }

  public async convert_bluna_to_stluna(
    sender: Wallet,
    amount: number
  ): Promise<void> {
    const coin = new Coin("uluna", amount);
    const coins = new Coins([coin]);
    const contract = this.contractInfo["lido_terra_token"].contractAddress;
    const sendExecuttion = await execute(sender, contract, {
      send: {
        contract: this.contractInfo["lido_terra_hub"].contractAddress,
        amount: `${amount}`,
        msg: Buffer.from(JSON.stringify({ convert: {} })).toString("base64"),
      },
    });
    if (isTxError(sendExecuttion)) {
      throw new Error(`Couldn't run: ${sendExecuttion.raw_log}`);
    }
  }

  public async redelegate_proxy(
    sender: Wallet,
    src_validator_address: string,
    redelegations: Array<[string, Coin]>
  ): Promise<void> {
    const contract = this.contractInfo["lido_terra_hub"].contractAddress;
    const bondExecution = await execute(
      sender,
      contract,
      {
        redelegate_proxy: {
          src_validator: src_validator_address,
          redelegations: redelegations.map(([dst_addr, coin]) => {
            return [dst_addr, { amount: `${coin.amount}`, denom: coin.denom }];
          }),
        },
      },
      undefined
    );
    if (isTxError(bondExecution)) {
      throw new Error(`Couldn't run: ${bondExecution.raw_log}`);
    }
  }

  public async params(
    sender: Wallet,
    params: {
      epoch_period?: number;
      underlying_coin_denom?: string;
      unbonding_period?: number;
      peg_recovery_fee?: string;
      er_threshold?: string;
      reward_denom?: string;
    },
    fee?: Fee
  ): Promise<void> {
    const contract = this.contractInfo.lido_terra_hub.contractAddress;
    const paramsExecution = await execute(
      sender,
      contract,
      {
        update_params: {
          epoch_period: params?.epoch_period || 30,
          underlying_coin_denom: params?.underlying_coin_denom || "uluna",
          unbonding_period: params?.unbonding_period || 211,
          peg_recovery_fee: params?.peg_recovery_fee || "0.001",
          er_threshold: params?.er_threshold || "1",
          reward_denom: params?.reward_denom || "uusd",
        },
      },
      undefined,
      fee
    );
    if (isTxError(paramsExecution)) {
      throw new Error(`Couldn't run: ${paramsExecution.raw_log}`);
    }
  }

  public async update_config(
    sender: Wallet,
    owner?: string,
    reward_contract?: string,
    token_contract?: string,
    withdrawal_account?: string
  ): Promise<void> {
    const contract = this.contractInfo.lido_terra_hub.contractAddress;
    const paramsExecution = await execute(sender, contract, {
      update_config: {
        owner: owner,
        reward_contract: reward_contract,
        token_contract: token_contract,
        airdrop_withdrawal_account: withdrawal_account,
      },
    });
    if (isTxError(paramsExecution)) {
      throw new Error(`Couldn't run: ${paramsExecution.raw_log}`);
    }
  }

  public async finish(sender: Wallet): Promise<void> {
    const contract = this.contractInfo.lido_terra_hub.contractAddress;
    const finishExecution = await execute(sender, contract, {
      withdraw_unbonded: {},
    });
    if (isTxError(finishExecution)) {
      throw new Error(`Couldn't run: ${finishExecution.raw_log}`);
    }
  }

  public async update_global_index(sender: Wallet): Promise<void> {
    const contract = this.contractInfo.lido_terra_hub.contractAddress;
    const finishExe = await execute(sender, contract, {
      update_global_index: {
        // airdrop_hooks: null,
      },
    });
    if (isTxError(finishExe)) {
      throw new Error(`Couldn't run: ${finishExe.raw_log}`);
    }
  }

  public async update_global_index_with_result(
    sender: Wallet
  ): Promise<ReturnType<typeof send_transaction>> {
    const contract = this.contractInfo.lido_terra_hub.contractAddress;
    const finishExe = await execute(sender, contract, {
      update_global_index: {
        // airdrop_hooks: null,
      },
    });
    if (isTxError(finishExe)) {
      throw new Error(`Couldn't run: ${finishExe.raw_log}`);
    }
    return finishExe;
  }

  public async slashing(sender: Wallet): Promise<void> {
    const contract = this.contractInfo.lido_terra_hub.contractAddress;
    const slashingExe = await execute(sender, contract, {
      check_slashing: {},
    });
    if (isTxError(slashingExe)) {
      throw new Error(`Couldn't run: ${slashingExe.raw_log}`);
    }
  }

  public async reward(sender: Wallet): Promise<void> {
    const contract = this.contractInfo.lido_terra_reward.contractAddress;
    const rewardExe = await execute(sender, contract, {
      claim_rewards: { recipient: null },
    });
    if (isTxError(rewardExe)) {
      throw new Error(`Couldn't run: ${rewardExe.raw_log}`);
    }
  }

  public async reward2(sender: Wallet, address: string): Promise<void> {
    const contract = this.contractInfo.lido_terra_reward.contractAddress;
    const rewardExe = await execute(sender, contract, {
      claim_rewards: { recipient: address },
    });
    if (isTxError(rewardExe)) {
      throw new Error(`Couldn't run: ${rewardExe.raw_log}`);
    }
  }

  public async reward_swap(sender: Wallet): Promise<void> {
    const contract = this.contractInfo.lido_terra_reward.contractAddress;
    const swapExe = await execute(sender, contract, {
      swap_to_reward_denom: {},
    });
    if (isTxError(swapExe)) {
      throw new Error(`Couldn't run: ${swapExe.raw_log}`);
    }
  }

  public async reward_update_global(
    sender: Wallet,
    prev_balance: string
  ): Promise<void> {
    const contract = this.contractInfo.lido_terra_reward.contractAddress;
    const updateGlobalExe = await execute(sender, contract, {
      update_global_index: { prev_balance: prev_balance },
    });
    if (isTxError(updateGlobalExe)) {
      throw new Error(`Couldn't run: ${updateGlobalExe.raw_log}`);
    }
  }

  public async reward_update_denom(
    sender: Wallet,
    reward_denom?: string
  ): Promise<void> {
    const contract = this.contractInfo.lido_terra_reward.contractAddress;
    const updateDenomExe = await execute(sender, contract, {
      update_reward_denom: { reward_denom: reward_denom },
    });
    if (isTxError(updateDenomExe)) {
      throw new Error(`Couldn't run: ${updateDenomExe.raw_log}`);
    }
  }

  public async reward_increase_balance(
    sender: Wallet,
    address?: string,
    amount?: string
  ): Promise<void> {
    const contract = this.contractInfo.lido_terra_reward.contractAddress;
    const increaseExe = await execute(sender, contract, {
      increase_balance: { address: address, amount: amount },
    });
    if (isTxError(increaseExe)) {
      throw new Error(`Couldn't run: ${increaseExe.raw_log}`);
    }
  }

  public async reward_decrease_balance(
    sender: Wallet,
    address?: string,
    amount?: string
  ): Promise<void> {
    const contract = this.contractInfo.lido_terra_reward.contractAddress;
    const decreaseExe = await execute(sender, contract, {
      decrease_balance: { address: address, amount: amount },
    });
    if (isTxError(decreaseExe)) {
      throw new Error(`Couldn't run: ${decreaseExe.raw_log}`);
    }
  }

  public async mint_cw20_token(
    contract: string,
    sender: Wallet,
    recipient: string,
    amount: number
  ): Promise<void> {
    const sendExecution = await execute(sender, contract, {
      mint: {
        recipient: recipient,
        amount: `${amount}`,
      },
    });
    if (isTxError(sendExecution)) {
      throw new Error(`Couldn't run: ${sendExecution.raw_log}`);
    }
  }

  public async send_cw20_token(
    contract: string,
    sender: Wallet,
    amount: number,
    inputMsg: object,
    dstContractAddr: string
  ): Promise<void> {
    const sendExecution = await execute(sender, contract, {
      send: {
        contract: dstContractAddr,
        amount: `${amount}`,
        msg: Buffer.from(JSON.stringify(inputMsg)).toString("base64"),
      },
    });
    if (isTxError(sendExecution)) {
      throw new Error(`Couldn't run: ${sendExecution.raw_log}`);
    }
  }

  public async send_from_cw20_token(
    contract: string,
    sender: Wallet,
    owner: Wallet,
    amount: number,
    inputMsg: object,
    contracAddr: string
  ): Promise<void> {
    const sendExecution = await execute(sender, contract, {
      send_from: {
        owner: `${owner.key.accAddress}`,
        contract: contracAddr,
        amount: `${amount}`,
        msg: Buffer.from(JSON.stringify(inputMsg)).toString("base64"),
      },
    });
    if (isTxError(sendExecution)) {
      throw new Error(`Couldn't run: ${sendExecution.raw_log}`);
    }
  }

  public async transfer_cw20_token(
    contract: string,
    sender: Wallet,
    rcv: Wallet,
    amount: number
  ): Promise<void> {
    const transferExecution = await execute(sender, contract, {
      transfer: {
        recipient: `${rcv.key.accAddress}`,
        amount: `${amount}`,
      },
    });
    if (isTxError(transferExecution)) {
      throw new Error(`Couldn't run: ${transferExecution.raw_log}`);
    }
  }

  public async transfer_cw20_token_to_addr(
    contract: string,
    sender: Wallet,
    recipient: string,
    amount: number
  ): Promise<void> {
    const transferExecution = await execute(sender, contract, {
      transfer: {
        recipient: recipient,
        amount: `${amount}`,
      },
    });
    if (isTxError(transferExecution)) {
      throw new Error(`Couldn't run: ${transferExecution.raw_log}`);
    }
  }

  public async transfer_from_cw20_token(
    contract: string,
    sender: Wallet,
    owner: Wallet,
    rcv: Wallet,
    amount: number
  ): Promise<void> {
    const transferExecution = await execute(sender, contract, {
      transfer_from: {
        owner: `${owner.key.accAddress}`,
        recipient: `${rcv.key.accAddress}`,
        amount: `${amount}`,
      },
    });
    if (isTxError(transferExecution)) {
      throw new Error(`Couldn't run: ${transferExecution.raw_log}`);
    }
  }

  public async burn_cw20_token(
    contract: string,
    sender: Wallet,
    amount: number
  ): Promise<void> {
    const transferExecuttion = await execute(sender, contract, {
      burn: {
        amount: `${amount}`,
      },
    });
    if (isTxError(transferExecuttion)) {
      throw new Error(`Couldn't run: ${transferExecuttion.raw_log}`);
    }
  }

  public async burn_from_cw20_token(
    contract: string,
    sender: Wallet,
    owner: Wallet,
    amount: number
  ): Promise<void> {
    const transferExecuttion = await execute(sender, contract, {
      burn_from: {
        owner: `${owner.key.accAddress}`,
        amount: `${amount}`,
      },
    });
    if (isTxError(transferExecuttion)) {
      throw new Error(`Couldn't run: ${transferExecuttion.raw_log}`);
    }
  }

  public async increase_allowance(
    contract: string,
    sender: Wallet,
    spender: string,
    amount: number,
    expire: Expire
  ): Promise<void> {
    const execution = await execute(sender, contract, {
      increase_allowance: {
        spender: spender,
        amount: `${amount}`,
        expires: expire,
      },
    });
    if (isTxError(execution)) {
      throw new Error(`Couldn't run: ${execution.raw_log}`);
    }
  }

  public async decrease_allowance(
    contract: string,
    sender: Wallet,
    spender: string,
    amount: number,
    expire: Expire
  ): Promise<void> {
    const execution = await execute(sender, contract, {
      decrease_allowance: {
        spender: spender,
        amount: `${amount}`,
        expires: expire,
      },
    });
    if (isTxError(execution)) {
      throw new Error(`Couldn't run: ${execution.raw_log}`);
    }
  }

  public async add_airdrop_info(
    sender: Wallet,
    token: string,
    aidrop: string,
    pair?: string
  ): Promise<void> {
    const execution = await execute(
      sender,
      this.contractInfo.lido_terra_airdrop_registry.contractAddress,
      {
        add_airdrop_info: {
          airdrop_token: "ANC",
          airdrop_info: {
            airdrop_token_contract: token,
            airdrop_contract: aidrop,
            airdrop_swap_contract: pair || "dummy",
            swap_belief_price: null,
            swap_max_spread: null,
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

  public async add_guardians(
    sender: Wallet,
    guardians: Array<string>
  ): Promise<void> {
    const contract = this.contractInfo.lido_terra_hub.contractAddress;
    const addGuardians = await execute(sender, contract, {
      add_guardians: { addresses: guardians },
    });
    if (isTxError(addGuardians)) {
      throw new Error(`Couldn't run: ${addGuardians.raw_log}`);
    }
  }

  public async remove_guardians(
    sender: Wallet,
    guardians: Array<string>
  ): Promise<void> {
    const contract = this.contractInfo.lido_terra_hub.contractAddress;
    const removeGuardians = await execute(sender, contract, {
      remove_guardians: { addresses: guardians },
    });
    if (isTxError(removeGuardians)) {
      throw new Error(`Couldn't run: ${removeGuardians.raw_log}`);
    }
  }

  public async pauseContracts(sender: Wallet): Promise<void> {
    const contract = this.contractInfo.lido_terra_hub.contractAddress;
    const pauseContracts = await execute(sender, contract, {
      pause_contracts: {},
    });
    if (isTxError(pauseContracts)) {
      throw new Error(`Couldn't run: ${pauseContracts.raw_log}`);
    }
  }

  public async unpauseContracts(sender: Wallet): Promise<void> {
    const contract = this.contractInfo.lido_terra_hub.contractAddress;
    const unpauseContracts = await execute(sender, contract, {
      unpause_contracts: {},
    });
    if (isTxError(unpauseContracts)) {
      throw new Error(`Couldn't run: ${unpauseContracts.raw_log}`);
    }
  }

  public async claim_airdrops(
    sender: Wallet,
    airdrop_token_contract: string,
    airdrop_contract: string,
    stage: number,
    proof: string[],
    amount: number
  ): Promise<void> {
    const execution = await execute(
      sender,
      this.contractInfo.lido_terra_hub.contractAddress,
      {
        claim_airdrops: {
          airdrop_token_contract: airdrop_token_contract,
          airdrop_contract: airdrop_contract,
          stage: stage,
          proof: proof,
          amount: `${amount}`,
        },
      }
    );
    if (isTxError(execution)) {
      throw new Error(`Couldn't run: ${execution.raw_log}`);
    }
  }

  public async fabricate_mir_claim(
    sender: Wallet,
    stage: number,
    amount: string,
    proof: Array<string>
  ): Promise<void> {
    const execution = await execute(
      sender,
      this.contractInfo.lido_terra_airdrop_registry.contractAddress,
      {
        fabricate_m_i_r_claim: {
          stage: stage,
          amount: amount,
          proof: proof,
        },
      }
    );
    if (isTxError(execution)) {
      throw new Error(`Couldn't run: ${execution.raw_log}`);
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
