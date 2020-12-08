import {
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
const wallet = terra.wallet;

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
        base_rate: `${baseRate}`,
        interest_multiplier: `${interestMultiplier}`,
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
    safeRatio: string,
    minLiquidation: string,
    liquidationThreshold: string
  ): Promise<void> {
    const mmLiquidation = await instantiate(
      sender,
      this.contractInfo.moneymarket_liquidation.codeId,
      {
        owner: sender.key.accAddress,
        safe_ratio: safeRatio,
        min_liquidation: minLiquidation,
        liquidation_threshold: liquidationThreshold,
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
    stableDenom: string,
    reserveFactor: number,
    anchorToken: string
  ): Promise<void> {
    const mmInterest = this.contractInfo["moneymarket_interest"]
      .contractAddress;
    const mmMarket = await instantiate(
      sender,
      this.contractInfo.moneymarket_liquidation.codeId,
      {
        owner_addr: sender,
        interest_model: mmInterest,
        stable_denom: stableDenom,
        reserve_factor: reserveFactor,
        anchor_token_code_id: anchorToken,
      }
    );

    if (isTxError(mmMarket)) {
      throw new Error(
        `Couldn't upload ${this.contractInfo.moneymarket_liquidation.codeId}: ${mmMarket.raw_log}`
      );
    }
    const marketAddr =
      mmMarket.logs[0].eventsByType.instantiate_contract.contract_address[0];
    const anchorTokenAddr =
      mmMarket.logs[0].eventsByType.instantiate_contract.contract_address[1];
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
      this.contractInfo.moneymarket_liquidation.codeId,
      {
        owner_addr: sender.key.accAddress,
        oracle_contract: oracleAddr,
        market_contract: marketAddr,
        liquidation_model: liquidationAddr,
        stable_denom: stableDenom,
        epoch_period: epochPeriod,
        distribution_threshold: distributionThreshold,
        target_deposit_rate: targetDepositRate,
        buffer_distribution_rate: bufferDistributionRate,
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
      this.contractInfo.moneymarket_liquidation.codeId,
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
}

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

async function send_transaction(
  sender: Wallet,
  msgs: Msg[]
): ReturnType<typeof terra.tx.broadcast> {
  return Promise.resolve()
    .then(() => sender.createAndSignTx({ msgs }))
    .then((tx) => terra.tx.broadcast(tx));
}
