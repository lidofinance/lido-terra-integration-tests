import {
  BlockTxBroadcastResult,
  Coin,
  Coins,
  isTxError,
  LCDClient,
  Msg,
  MsgExecuteContract,
  MsgInstantiateContract,
  MsgStoreCode,
  Fee,
  Wallet,
} from "@terra-money/terra.js";
import * as fs from "fs";
import { execute, instantiate, send_transaction } from "./flow/execution";

// TODO: anchor_token should be added in contracts.

export interface BAssetInfo {
  name: string;
  symbol: string;
  decimals: number;
}

const contracts = [
  "moneymarket_custody_bluna",
  "moneymarket_distribution_model",
  "moneymarket_interest_model",
  "moneymarket_market",
  "moneymarket_oracle",
  "moneymarket_overseer",
  "moneymarket_liquidation",
];

export default class MoneyMarket {
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
  // initialize interest contract
  public async instantiate_interest(
    sender: Wallet,
    params: {
      owner?: string;
      base_rate?: string;
      interest_multiplier?: string;
    },
    fee?: Fee
  ): Promise<void> {
    const mmInterest = await instantiate(
      sender,
      this.contractInfo.moneymarket_interest_model.codeId,
      {
        owner: params?.owner,
        base_rate: params?.base_rate || "0.000000004069028629",
        interest_multiplier:
          params?.interest_multiplier || "0.000000032552229035",
      },
      undefined,
      fee
    );

    if (isTxError(mmInterest)) {
      throw new Error(
        `Couldn't upload ${this.contractInfo.moneymarket_interest_model.codeId}: ${mmInterest.raw_log}`
      );
    }
    const interestAddr =
      mmInterest.logs[0].eventsByType.instantiate_contract.contract_address[0];
    this.contractInfo[
      "moneymarket_interest_model"
    ].contractAddress = interestAddr;
  }

  // initialize oracle contract
  public async instantiate_oracle(
    sender: Wallet,
    params: {
      owner?: string;
      base_asset?: string;
    },
    fee?: Fee
  ): Promise<void> {
    const mmOracle = await instantiate(
      sender,
      this.contractInfo.moneymarket_oracle.codeId,
      {
        owner: params.owner || sender.key.accAddress,
        base_asset: params.base_asset || "uusd",
      },
      undefined,
      fee
    );

    if (isTxError(mmOracle)) {
      throw new Error(
        `Couldn't upload ${this.contractInfo["moneymarket_oracle"].codeId}: ${mmOracle.raw_log}`
      );
    }
    const oracleAddr =
      mmOracle.logs[0].eventsByType.instantiate_contract.contract_address[0];
    this.contractInfo["moneymarket_oracle"].contractAddress = oracleAddr;
  }

  // initialize liquidation contract
  public async instantiate_liquidation(
    sender: Wallet,
    params: {
      owner: string;
      safeRatio?: number;
      liquidationThreshold?: number;
      oracleContract?: string;
      price_timeframe?: number;
      bid_fee?: string;
      stable_denom?: string;
      max_premium_rate?: string;
    },
    fee?: Fee
  ): Promise<void> {
    const mmLiquidation = await instantiate(
      sender,
      this.contractInfo.moneymarket_liquidation.codeId,
      {
        owner: params.owner,
        oracle_contract:
          params.oracleContract ||
          this.contractInfo["moneymarket_oracle"].contractAddress,
        stable_denom: params.stable_denom || "uusd",
        safe_ratio: params.safeRatio?.toString() || "0.8",
        bid_fee: params.bid_fee || "0.01",
        max_premium_rate: params.max_premium_rate || "0.3",
        // min_liquidation: `${minLiquidation}`,
        liquidation_threshold: params.liquidationThreshold || "200",
        price_timeframe: params.price_timeframe || 60,
      },
      undefined,
      fee
    );

    if (isTxError(mmLiquidation)) {
      throw new Error(
        `Couldn't upload ${this.contractInfo.moneymarket_liquidation.codeId}: ${mmLiquidation.raw_log}`
      );
    }
    const liquidationAddr =
      mmLiquidation.logs[0].eventsByType.instantiate_contract
        .contract_address[0];
    this.contractInfo[
      "moneymarket_liquidation"
    ].contractAddress = liquidationAddr;
  }

  // initialize money market contract
  public async instantiate_money(
    sender: Wallet,
    params: {
      terraswap_token_code_id?: number;
      stable_denom?: string;
      reserve_factor?: string;
      anc_emission_rate?: string;
      max_borrow_factor?: string;
    },
    fee?: Fee
  ): Promise<void> {
    const mmMarket = await instantiate(
      sender,
      this.contractInfo.moneymarket_market.codeId,
      {
        owner_addr: sender.key.accAddress,
        stable_denom: params.stable_denom || "uusd",
        reserve_factor: params.reserve_factor || "0.05",
        aterra_code_id: params.terraswap_token_code_id,
        anc_emission_rate: params.anc_emission_rate || "1000000",
        max_borrow_factor: params.max_borrow_factor || "0.9",
      },
      new Coins("1000000uusd"),
      fee
    );

    if (isTxError(mmMarket)) {
      throw new Error(
        `Couldn't upload ${this.contractInfo.moneymarket_market.codeId}: ${mmMarket.raw_log}`
      );
    }

    const anchorToken =
      mmMarket.logs[0].eventsByType.instantiate_contract.contract_address[0];
    const marketAddr =
      mmMarket.logs[0].eventsByType.instantiate_contract.contract_address[1];
    this.contractInfo["anchorToken"] = {
      codeId: params.terraswap_token_code_id,
      contractAddress: anchorToken,
    };
    this.contractInfo["moneymarket_market"].contractAddress = marketAddr;
  }

  public async instantiate_overseer(
    sender: Wallet,
    params: {
      ownerAddr?: string;
      stable_denom?: string;
      epoch_period?: number;
      collector_contract: string;
      distributionThreshold?: number;
      targetDepositRate?: number;
      bufferDistributionRate?: number;
      price_timeframe?: number;
    },
    fee?: Fee
  ): Promise<void> {
    const oracleAddr = this.contractInfo["moneymarket_oracle"].contractAddress;
    const marketAddr = this.contractInfo["moneymarket_market"].contractAddress;
    const liquidationAddr = this.contractInfo["moneymarket_liquidation"]
      .contractAddress;
    const mmOverseer = await instantiate(
      sender,
      this.contractInfo.moneymarket_overseer.codeId,
      {
        owner_addr: sender.key.accAddress,
        oracle_contract: oracleAddr,
        market_contract: marketAddr,
        liquidation_contract: liquidationAddr,
        collector_contract: params.collector_contract,
        stable_denom: params.stable_denom || "uusd",
        epoch_period: params.epoch_period || 3600,
        threshold_deposit_rate: "0.0000000203",
        // distribution_threshold:
        //   params.distributionThreshold?.toFixed(10) || "0.00000000951",
        target_deposit_rate:
          params.targetDepositRate?.toFixed(10) || "0.00000003044",
        buffer_distribution_factor:
          params.bufferDistributionRate?.toFixed(10) || "0.1",
        anc_purchase_factor: "0.1",
        price_timeframe: params.price_timeframe || 60,
      },
      undefined,
      fee
    );
    if (isTxError(mmOverseer)) {
      throw new Error(
        `Couldn't upload ${this.contractInfo.moneymarket_overseer.codeId}: ${mmOverseer.raw_log}`
      );
    }
    const overseerAddr =
      mmOverseer.logs[0].eventsByType.instantiate_contract.contract_address[0];
    this.contractInfo["moneymarket_overseer"].contractAddress = overseerAddr;
  }

  // initialize money market contract
  public async instantiate_custody(
    sender: Wallet,
    params: {
      owner: string;
      basset_token: string;
      basset_reward: string;
      stable_denom?: string;
      basset_info: BAssetInfo;
    },
    fee?: Fee
  ): Promise<void> {
    const oracleAddr = this.contractInfo["moneymarket_oracle"].contractAddress;
    const marketAddr = this.contractInfo["moneymarket_market"].contractAddress;
    const liquidationAddr = this.contractInfo["moneymarket_liquidation"]
      .contractAddress;
    const overseerAddr = this.contractInfo["moneymarket_overseer"]
      .contractAddress;

    const mmCustody = await instantiate(
      sender,
      this.contractInfo.moneymarket_custody_bluna.codeId,
      {
        owner: params.owner,
        collateral_token: params.basset_token,
        overseer_contract: overseerAddr,
        market_contract: marketAddr,
        reward_contract: params.basset_reward,
        liquidation_contract: liquidationAddr,
        stable_denom: params.stable_denom || "uusd",
        basset_info: params.basset_info,
      },
      undefined,
      fee
    );
    if (isTxError(mmCustody)) {
      throw new Error(
        `Couldn't upload ${this.contractInfo.moneymarket_custody_bluna.codeId}: ${mmCustody.raw_log}`
      );
    }
    const custodyAddr =
      mmCustody.logs[0].eventsByType.instantiate_contract.contract_address[0];
    this.contractInfo[
      "moneymarket_custody_bluna"
    ].contractAddress = custodyAddr;
  }

  public async instantiate_distribution(
    sender: Wallet,
    params: {
      owner?: string;
      emission_cap?: string;
      emission_floor?: string;
      increment_multiplier?: string;
      decrement_multiplier?: string;
    },
    fee?: Fee
  ): Promise<void> {
    const mmDestribution = await instantiate(
      sender,
      this.contractInfo.moneymarket_distribution_model.codeId,
      {
        owner: params.owner,
        emission_cap: params.emission_cap || "1000000",
        emission_floor: params.emission_floor || "1000000",
        increment_multiplier: params.increment_multiplier || "1.0",
        decrement_multiplier: params.decrement_multiplier || "1.0",
      },
      undefined,
      fee
    );
    if (isTxError(mmDestribution)) {
      throw new Error(
        `Couldn't upload ${this.contractInfo.moneymarket_overseer.codeId}: ${mmDestribution.raw_log}`
      );
    }
    const disAddr =
      mmDestribution.logs[0].eventsByType.instantiate_contract
        .contract_address[0];
    this.contractInfo[
      "moneymarket_distribution_model"
    ].contractAddress = disAddr;

    console.log(
      `moneymarket_distribution_model: { codeId: ${this.contractInfo.moneymarket_distribution_model.codeId}, contractAddress: "${this.contractInfo.moneymarket_distribution_model.contractAddress}"},`
    );
  }

  public async;
  public async borrow(
    sender: Wallet,
    amount: string,
    withdrawTo?: string
  ): Promise<void> {
    let contract = this.contractInfo["moneymarket_market"].contractAddress;
    const borrowExecution = await execute(sender, contract, {
      borrow_stable: {
        borrow_amount: amount,
        to: withdrawTo,
      },
    });
    if (isTxError(borrowExecution)) {
      throw new Error(`Couldn't run: ${borrowExecution.raw_log}`);
    }
  }

  public async market_register_contracts(
    sender: Wallet,
    params: { collector_contract: string; faucet_contract: string }
  ): Promise<void> {
    let contract = this.contractInfo["moneymarket_market"].contractAddress;
    const registerExecution = await execute(sender, contract, {
      register_contracts: {
        overseer_contract: this.contractInfo["moneymarket_overseer"]
          .contractAddress,
        interest_model: this.contractInfo["moneymarket_interest_model"]
          .contractAddress,
        distribution_model: this.contractInfo["moneymarket_distribution_model"]
          .contractAddress,
        collector_contract: params.collector_contract,
        faucet_contract: params.faucet_contract,
      },
    });
    if (isTxError(registerExecution)) {
      throw new Error(`Couldn't run: ${registerExecution.raw_log}`);
    }
  }

  public async market_register_overseer(sender: Wallet): Promise<void> {
    let contract = this.contractInfo["moneymarket_market"].contractAddress;
    const registerExecution = await execute(sender, contract, {
      register_overseer: {
        overseer_contract: this.contractInfo["moneymarket_overseer"]
          .contractAddress,
      },
    });
    if (isTxError(registerExecution)) {
      throw new Error(`Couldn't run: ${registerExecution.raw_log}`);
    }
  }

  public async market_register_anchor_token(sender: Wallet): Promise<void> {
    let contract = this.contractInfo["moneymarket_market"].contractAddress;
    const registerExecution = await execute(sender, contract, {
      register_anchor_token: {},
    });
    if (isTxError(registerExecution)) {
      throw new Error(`Couldn't run: ${registerExecution.raw_log}`);
    }
  }

  public async market_update_config(
    sender: Wallet,
    params: {
      owner_addr?: string;
      reserve_factor?: string;
      interest_model?: string;
    }
  ): Promise<void> {
    let contract = this.contractInfo["moneymarket_market"].contractAddress;
    const updateExecution = await execute(sender, contract, {
      update_config: {
        owner_addr: params.owner_addr,
        reserve_factor: params.reserve_factor,
        interest_model: params.interest_model,
      },
    });
    if (isTxError(updateExecution)) {
      throw new Error(`Couldn't run: ${updateExecution.raw_log}`);
    }
  }

  public async market_claim_rewards(sender: Wallet, to?: string): Promise<void> {
    const contract = this.contractInfo["moneymarket_market"].contractAddress;
    const claim_rewards = await execute(sender, contract, {
      claim_rewards: { to: to },
    });
    if (isTxError(claim_rewards)) {
      throw new Error(`Couldn't run: ${claim_rewards.raw_log}`);
    }
  }

  public async market_repay_stable(
    sender: Wallet,
    borrower: string,
    prev_balance: string
  ): Promise<void> {
    let contract = this.contractInfo["moneymarket_market"].contractAddress;
    const repayExecution = await execute(sender, contract, {
      repay_stable_from_liquidation: {
        borrower: borrower,
        prev_balance: prev_balance,
      },
    });
    if (isTxError(repayExecution)) {
      throw new Error(`Couldn't run: ${repayExecution.raw_log}`);
    }
  }

  public async deposit_stable(sender: Wallet, amount: number): Promise<void> {
    let contract = this.contractInfo["moneymarket_market"].contractAddress;
    const coin = new Coin("uusd", amount);
    const coins = new Coins([coin]);
    const depositExecution = await execute(
      sender,
      contract,
      {
        deposit_stable: {},
      },
      coins
    );
    if (isTxError(depositExecution)) {
      throw new Error(`Couldn't run: ${depositExecution.raw_log}`);
    }
  }

  public async borrow_stable(
    sender: Wallet,
    borrowAmount: number,
    to: string | undefined
  ): Promise<void> {
    let contract = this.contractInfo["moneymarket_market"].contractAddress;
    const borrowExecution = await execute(sender, contract, {
      borrow_stable: {
        borrow_amount: `${borrowAmount}`,
        to: to,
      },
    });
    if (isTxError(borrowExecution)) {
      throw new Error(`Couldn't run: ${borrowExecution.raw_log}`);
    }
  }

  public async repay_stable(sender: Wallet, amount: number): Promise<void> {
    const coin = new Coin("uusd", amount);
    const coins = new Coins([coin]);
    let contract = this.contractInfo["moneymarket_market"].contractAddress;
    const repayExecution = await execute(
      sender,
      contract,
      {
        repay_stable: {},
      },
      coins
    );
    if (isTxError(repayExecution)) {
      throw new Error(`Couldn't run: ${repayExecution.raw_log}`);
    }
  }

  public async custody_update_config(
    sender: Wallet,
    liquidation_contract?: string
  ): Promise<void> {
    let contract = this.contractInfo["moneymarket_custody_bluna"].contractAddress;
    const configExecution = await execute(sender, contract, {
      update_config: {
        liquidation_contract: liquidation_contract,
      },
    });
    if (isTxError(configExecution)) {
      throw new Error(`Couldn't run: ${configExecution.raw_log}`);
    }
  }

  public async custody_lock_collateral(
    sender: Wallet,
    borrower?: string,
    amount?: string
  ): Promise<void> {
    let contract = this.contractInfo["moneymarket_custody_bluna_bluna"].contractAddress;
    const lockExecution = await execute(sender, contract, {
      lock_collateral: {
        borrower: borrower,
        amount: amount,
      },
    });
    if (isTxError(lockExecution)) {
      throw new Error(`Couldn't run: ${lockExecution.raw_log}`);
    }
  }

  public async custody_unlock_collateral(
    sender: Wallet,
    borrower?: string,
    amount?: string
  ): Promise<void> {
    let contract = this.contractInfo["moneymarket_custody_bluna"].contractAddress;
    const lockExecution = await execute(sender, contract, {
      unlock_collateral: {
        borrower: borrower,
        amount: amount,
      },
    });
    if (isTxError(lockExecution)) {
      throw new Error(`Couldn't run: ${lockExecution.raw_log}`);
    }
  }

  public async custody_distribute_rewards(sender: Wallet): Promise<void> {
    let contract = this.contractInfo["moneymarket_custody_bluna"].contractAddress;
    const rewardExecution = await execute(sender, contract, {
      distribute_rewards: {},
    });
    if (isTxError(rewardExecution)) {
      throw new Error(`Couldn't run: ${rewardExecution.raw_log}`);
    }
  }

  public async custody_distribute_hook(sender: Wallet): Promise<void> {
    let contract = this.contractInfo["moneymarket_custody_bluna"].contractAddress;
    const hookExecution = await execute(sender, contract, {
      distribute_hook: {},
    });
    if (isTxError(hookExecution)) {
      throw new Error(`Couldn't run: ${hookExecution.raw_log}`);
    }
  }

  public async custody_swap(sender: Wallet): Promise<void> {
    let contract = this.contractInfo["moneymarket_custody_bluna"].contractAddress;
    const swapExecution = await execute(sender, contract, {
      swap_to_stable_denom: {},
    });
    if (isTxError(swapExecution)) {
      throw new Error(`Couldn't run: ${swapExecution.raw_log}`);
    }
  }

  public async liquidate_collateral(
    sender: Wallet,
    borrower: string
  ): Promise<void> {
    let contract = this.contractInfo["moneymarket_overseer"].contractAddress;
    const liquidateExecution = await execute(sender, contract, {
      liquidate_collateral: {
        borrower: borrower,
      },
    });
    if (isTxError(liquidateExecution)) {
      throw new Error(`Couldn't run: ${liquidateExecution.raw_log}`);
    }
  }

  public async withdraw_collateral(
    sender: Wallet,
    amount?: number
  ): Promise<void> {
    let contract = this.contractInfo["moneymarket_custody_bluna"].contractAddress;
    const withdrawExecution = await execute(sender, contract, {
      withdraw_collateral: {
        amount: `${amount}`,
      },
    });
    if (isTxError(withdrawExecution)) {
      throw new Error(`Couldn't run: ${withdrawExecution.raw_log}`);
    }
  }

  public async overseer_update_config(
    sender: Wallet,
    params: {
      owner_addr?: string;
      oracle_contract?: string;
      liquidation_contract?: string;
      distribution_threshold?: string;
      target_deposit_rate?: string;
      buffer_distribution_rate?: string;
      epoch_period?: number;
      price_timeframe?: number;
    }
  ): Promise<void> {
    const contract = this.contractInfo["moneymarket_overseer"].contractAddress;
    const configExecution = await execute(sender, contract, {
      update_config: {
        owner_addr: params.owner_addr,
        oracle_contract: params.oracle_contract,
        liquidation_contract: params.liquidation_contract,
        distribution_threshold: params.distribution_threshold,
        target_deposit_rate: params.target_deposit_rate,
        buffer_distribution_rate: params.buffer_distribution_rate,
        epoch_period: params.epoch_period,
        price_timeframe: params.price_timeframe,
      },
    });
    if (isTxError(configExecution)) {
      throw new Error(`Couldn't run: ${configExecution.raw_log}`);
    }
  }

  public async overseer_lock_collateral(
    sender: Wallet,
    collaterals: object[]
  ): Promise<void> {
    const contract = this.contractInfo["moneymarket_overseer"].contractAddress;
    const lockCollaterallExecution = await execute(sender, contract, {
      lock_collateral: {
        collaterals: collaterals,
      },
    });
    if (isTxError(lockCollaterallExecution)) {
      throw new Error(`Couldn't run: ${lockCollaterallExecution.raw_log}`);
    }
  }

  public async overseer_unlock_collateral(
    sender: Wallet,
    collaterals: object[]
  ): Promise<void> {
    const contract = this.contractInfo["moneymarket_overseer"].contractAddress;
    const unlockCollaterallExecution = await execute(sender, contract, {
      unlock_collateral: {
        collaterals: collaterals,
      },
    });
    if (isTxError(unlockCollaterallExecution)) {
      throw new Error(`Couldn't run: ${unlockCollaterallExecution.raw_log}`);
    }
  }

  public async overseer_update_whitelist(
    sender: Wallet,
    collateralToken: string,
    ltv?: string
  ): Promise<void> {
    const contract = this.contractInfo["moneymarket_overseer"].contractAddress;
    const unlockCollaterallExecution = await execute(sender, contract, {
      update_whitelist: {
        collateral_token: collateralToken,
        custody_contract: this.contractInfo["moneymarket_custody_bluna"]
          .contractAddress,
        ltv: ltv,
      },
    });
    if (isTxError(unlockCollaterallExecution)) {
      throw new Error(`Couldn't run: ${unlockCollaterallExecution.raw_log}`);
    }
  }

  public async overseer_whitelist(
    sender: Wallet,
    collateralToken: string,
    ltv: string,
    fee?: Fee
  ): Promise<void> {
    const contract = this.contractInfo["moneymarket_overseer"].contractAddress;
    const unlockCollaterallExecution = await execute(
      sender,
      contract,
      {
        whitelist: {
          name: "bondedLuna",
          symbol: "BLUNA",
          collateral_token: collateralToken,
          custody_contract: this.contractInfo["moneymarket_custody_bluna"]
            .contractAddress,
          max_ltv: ltv,
        },
      },
      undefined,
      fee
    );
    if (isTxError(unlockCollaterallExecution)) {
      throw new Error(`Couldn't run: ${unlockCollaterallExecution.raw_log}`);
    }
  }

  public async execute_epoch_operations(sender: Wallet): Promise<void> {
    const contract = this.contractInfo["moneymarket_overseer"].contractAddress;
    const epochOperationExecution = await execute(sender, contract, {
      execute_epoch_operations: {},
    });
    if (isTxError(epochOperationExecution)) {
      throw new Error(`Couldn't run: ${epochOperationExecution.raw_log}`);
    }
  }

  public async liquidation(sender: Wallet, borrower: string): Promise<void> {
    const contract = this.contractInfo["moneymarket_overseer"].contractAddress;
    const liquidationExecution = await execute(sender, contract, {
      liquidate_collateral: {
        borrower: borrower,
      },
    });
    if (isTxError(liquidationExecution)) {
      throw new Error(`Couldn't run: ${liquidationExecution.raw_log}`);
    }
  }

  public async oracle_update_config(
    sender: Wallet,
    owner?: string
  ): Promise<void> {
    const contract = this.contractInfo["moneymarket_oracle"].contractAddress;
    const updateExecution = await execute(sender, contract, {
      update_config: {
        owner: owner,
      },
    });
    if (isTxError(updateExecution)) {
      throw new Error(`Couldn't run: ${updateExecution.raw_log}`);
    }
  }

  public async oracle_feed_price(
    sender: Wallet,
    prices: object[]
  ): Promise<void> {
    const contract = this.contractInfo["moneymarket_oracle"].contractAddress;
    const updateExecution = await execute(sender, contract, {
      feed_price: {
        prices: prices,
      },
    });
    if (isTxError(updateExecution)) {
      throw new Error(`Couldn't run: ${updateExecution.raw_log}`);
    }
  }

  public async oracle_register_feeder(
    sender: Wallet,
    asset: string,
    feeder: string
  ): Promise<void> {
    const contract = this.contractInfo["moneymarket_oracle"].contractAddress;
    const updateExecution = await execute(sender, contract, {
      register_feeder: {
        asset: asset,
        feeder: feeder,
      },
    });
    if (isTxError(updateExecution)) {
      throw new Error(`Couldn't run: ${updateExecution.raw_log}`);
    }
  }

  public async interest_update_config(
    sender: Wallet,
    owner: string,
    base_rate: string,
    interest_multiplier: string
  ): Promise<void> {
    const contract = this.contractInfo["moneymarket_interest_model"]
      .contractAddress;
    const updateExecution = await execute(sender, contract, {
      update_config: {
        owner: owner,
        base_rate: base_rate,
        total_reserves: interest_multiplier,
      },
    });
    if (isTxError(updateExecution)) {
      throw new Error(`Couldn't run: ${updateExecution.raw_log}`);
    }
  }

  public async liquidation_update_config(
    sender: Wallet,
    owner?: string,
    oracle_contract?: string,
    stable_denom?: string,
    safe_ratio?: string,
    bid_fee?: string,
    max_premium_rate?: string,
    liquidation_threshold?: string,
    price_timeframe?: number
  ): Promise<void> {
    const contract = this.contractInfo["moneymarket_liquidation"]
      .contractAddress;
    const updateExecution = await execute(sender, contract, {
      update_config: {
        owner: owner,
        oracle_contract: oracle_contract,
        stable_denom: stable_denom,
        safe_ratio: safe_ratio,
        bid_fee: bid_fee,
        max_premium_rate: max_premium_rate,
        liquidation_threshold: liquidation_threshold,
        price_timeframe: price_timeframe,
      },
    });
    if (isTxError(updateExecution)) {
      throw new Error(`Couldn't run: ${updateExecution.raw_log}`);
    }
  }

  public async liquidation_submit_bid(
    sender: Wallet,
    collateral_token: string,
    premium_rate: string,
    how_much: string
  ): Promise<void> {
    const contract = this.contractInfo["moneymarket_liquidation"]
      .contractAddress;
    const submitExecution = await execute(
      sender,
      contract,
      {
        submit_bid: {
          collateral_token: collateral_token,
          premium_rate: premium_rate,
        },
      },
      new Coins(how_much)
    );
    if (isTxError(submitExecution)) {
      throw new Error(`Couldn't run: ${submitExecution.raw_log}`);
    }
  }

  public async liquidation_retract_bid(
    sender: Wallet,
    collateral_token: string,
    amount?: string
  ): Promise<void> {
    const contract = this.contractInfo["moneymarket_liquidation"]
      .contractAddress;
    const retractExecution = await execute(sender, contract, {
      retract_bid: {
        collateral_token: collateral_token,
        amount: amount,
      },
    });
    if (isTxError(retractExecution)) {
      throw new Error(`Couldn't run: ${retractExecution.raw_log}`);
    }
  }

  // anchor token only
  public async send_cw20_token(
    sender: Wallet,
    amount: number,
    inputMsg: object,
    contracAddr: string
  ): Promise<void> {
    const contract = this.contractInfo.anchorToken.contractAddress;
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

  // update config for overseer

  //distribution update config
  public async distribution_update_config(
    sender: Wallet,
    params: {
      owner: string;
      emission_cap: string;
      emission_floor: string;
      increment_multiplier: string;
      decrement_multiplier?: string;
    }
  ): Promise<void> {
    const contract = this.contractInfo.moneymarket_distribution_model
      .contractAddress;
    const sendExecution = await execute(sender, contract, {
      update_config: {
        owner: params.owner,
        emission_cap: params.emission_cap,
        emission_floor: params.emission_floor,
        increment_multiplier: params.increment_multiplier,
        decrement_multiplier: params.decrement_multiplier,
      },
    });
  }
}
