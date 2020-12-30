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
  StdFee,
  Wallet,
} from "@terra-money/terra.js";
import * as fs from "fs";
import { execute, instantiate, send_transaction } from "./flow/execution";

// TODO: anchor_token should be added in contracts.
const contracts = [
  "moneymarket_custody",
  "moneymarket_interest",
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
  // initialize interest contract
  public async instantiate_interest(
    sender: Wallet,
    baseRate: number,
    interestMultiplier: number
  ): Promise<void> {
    const mmInterest = await instantiate(
      sender,
      this.contractInfo.moneymarket_interest.codeId,
      {
        owner: sender.key.accAddress,
        base_rate: `${baseRate.toFixed(18)}`,
        interest_multiplier: `${interestMultiplier.toFixed(18)}`,
      }
    );

    if (isTxError(mmInterest)) {
      throw new Error(
        `Couldn't upload ${this.contractInfo.moneymarket_interest.codeId}: ${mmInterest.raw_log}`
      );
    }
    const interestAddr =
      mmInterest.logs[0].eventsByType.instantiate_contract.contract_address[0];
    this.contractInfo["moneymarket_interest"].contractAddress = interestAddr;
  }

  // initialize oracle contract
  public async instantiate_oracle(
    sender: Wallet,
    baseAsset: string
  ): Promise<void> {
    const mmOracle = await instantiate(
      sender,
      this.contractInfo.moneymarket_oracle.codeId,
      {
        owner: sender.key.accAddress,
        base_asset: "uusd",
      }
    );

    if (isTxError(mmOracle)) {
      throw new Error(
        `Couldn't upload ${this.contractInfo.moneymarket_.codeId}: ${mmOracle.raw_log}`
      );
    }
    const oracleAddr =
      mmOracle.logs[0].eventsByType.instantiate_contract.contract_address[0];
    this.contractInfo["moneymarket_oracle"].contractAddress = oracleAddr;
  }

  // initialize liquidation contract
  public async instantiate_liquidation(
    sender: Wallet,
    safeRatio: number,
    minLiquidation: number,
    liquidationThreshold: number
  ): Promise<void> {
    const mmLiquidation = await instantiate(
      sender,
      this.contractInfo.moneymarket_liquidation.codeId,
      {
        owner: sender.key.accAddress,
        safe_ratio: `${safeRatio}`,
        min_liquidation: `${minLiquidation}`,
        liquidation_threshold: `${liquidationThreshold}`,
      }
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
    terraswapTokenCodeId: number,
    stableDenom: string,
    reserveFactor: number
  ): Promise<void> {
    const mmInterest = this.contractInfo["moneymarket_interest"]
      .contractAddress;
    const mmMarket = await instantiate(
      sender,
      this.contractInfo.moneymarket_market.codeId,
      {
        owner_addr: sender.key.accAddress,
        anchor_token_code_id: terraswapTokenCodeId,
        interest_model: mmInterest,
        stable_denom: stableDenom,
        reserve_factor: reserveFactor.toFixed(10),
      }
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
      codeId: terraswapTokenCodeId,
      contractAddress: anchorToken,
    };
    this.contractInfo["moneymarket_market"].contractAddress = marketAddr;
  }

  public async instantiate_overseer(
    sender: Wallet,
    stableDenom: string,
    epochPeriod: number,
    distributionThreshold: number,
    targetDepositRate: number,
    bufferDistributionRate: number
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
        liquidation_model: liquidationAddr,
        stable_denom: stableDenom,
        epoch_period: epochPeriod,
        distribution_threshold: distributionThreshold.toFixed(10),
        target_deposit_rate: targetDepositRate.toFixed(10),
        buffer_distribution_rate: bufferDistributionRate.toFixed(10),
      }
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
    bAssetToken: string,
    bAssetReward: string,
    stableDenom: string,
    terraswapPair: string
  ): Promise<void> {
    const oracleAddr = this.contractInfo["moneymarket_oracle"].contractAddress;
    const marketAddr = this.contractInfo["moneymarket_market"].contractAddress;
    const liquidationAddr = this.contractInfo["moneymarket_liquidation"]
      .contractAddress;
    const overseerAddr = this.contractInfo["moneymarket_overseer"]
      .contractAddress;

    const mmCustody = await instantiate(
      sender,
      this.contractInfo.moneymarket_custody.codeId,
      {
        collateral_token: bAssetToken,
        overseer_contract: overseerAddr,
        market_contract: marketAddr,
        liquidation_contract: liquidationAddr,
        reward_contract: bAssetReward,
        stable_denom: stableDenom,
        terraswap_contract: terraswapPair,
      }
    );
    if (isTxError(mmCustody)) {
      throw new Error(
        `Couldn't upload ${this.contractInfo.moneymarket_overseer.codeId}: ${mmCustody.raw_log}`
      );
    }
    const custodyAddr =
      mmCustody.logs[0].eventsByType.instantiate_contract.contract_address[0];
    this.contractInfo["moneymarket_custody"].contractAddress = custodyAddr;
  }

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

  public async withdraw_collateral(
    sender: Wallet,
    amount?: number
  ): Promise<void> {
    let contract = this.contractInfo["moneymarket_custody"].contractAddress;
    const withdrawExecution = await execute(sender, contract, {
      withdraw_collateral: {
        amount: `${amount}`,
      },
    });
    if (isTxError(withdrawExecution)) {
      throw new Error(`Couldn't run: ${withdrawExecution.raw_log}`);
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

  public async overseer_whitelist(
    sender: Wallet,
    collateralToken: string,
    ltv: string
  ): Promise<void> {
    const contract = this.contractInfo["moneymarket_overseer"].contractAddress;
    const unlockCollaterallExecution = await execute(sender, contract, {
      whitelist: {
        collateral_token: collateralToken,
        custody_contract: this.contractInfo["moneymarket_custody"]
          .contractAddress,
        ltv: ltv,
      },
    });
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
}
