import basset from "./basset_helper";
import mMarket from "./money_market_helper";
import terraswap from "./terraswap_helper";
import { StdFee, Wallet } from "@terra-money/terra.js";
import { execute } from "./flow/execution";

export default class Anchor {
  public bAsset: basset;
  public moneyMarket: mMarket;
  public terraswap: terraswap;
  private owner: Wallet;

  constructor(owner: Wallet) {
    this.owner = owner;
    this.bAsset = new basset();
    this.moneyMarket = new mMarket();
    this.terraswap = new terraswap();
  }

  public async store_contracts(
    bassetLocation: string,
    mmLocation: string,
    terraswapLocation: string,
    fee?: StdFee
  ): Promise<void> {
    await this.bAsset.storeCodes(this.owner, bassetLocation, fee);
    await this.moneyMarket.storeCodes(this.owner, mmLocation, fee);
    await this.terraswap.storeCodes(this.owner, terraswapLocation, fee);
  }

  public async instantiate(fee?: StdFee): Promise<void> {
    await this.bAsset.instantiate_hub(this.owner, {}, fee);
    await this.bAsset.instantiate_reward(this.owner, {}, fee);
    await this.bAsset.instantiate_token(this.owner, {}, fee);
    await this.bAsset.register_contracts(this.owner,{}, fee);

    await this.terraswap.instantiate_terraswap(this.owner, fee);

    await this.moneyMarket.instantiate_interest(
      this.owner,
        {},
      fee,
    );
    await this.moneyMarket.instantiate_oracle(this.owner, {}, fee);
    await this.moneyMarket.instantiate_liquidation(
      this.owner,
        {},
      fee
    );

    await this.moneyMarket.instantiate_money(
      this.owner,{terraswapTokenCodeId : this.terraswap.contractInfo["terraswap_token"].codeId,
          stableDenom: null,
          reserveFactor: null
        },
      fee
    );

    await this.moneyMarket.instantiate_overseer(
      this.owner, {},
      fee
    );
    const bassetReward = this.bAsset.contractInfo["anchor_basset_reward"]
      .contractAddress;
    const bassetToken = this.bAsset.contractInfo["anchor_basset_token"]
      .contractAddress;
    const terraswapPair = this.terraswap.contractInfo["terraswap_pair"]
      .contractAddress;
    await this.moneyMarket.instantiate_custody(
      this.owner,
        {
          bAssetToken: bassetToken,
          bAssetReward: bassetReward,
          stableDenom: null,
          terraswapPair: terraswapPair,
        },
      fee
    );
    await this.moneyMarket.overseer_whitelist(this.owner, bassetToken, "0.5", fee);
    await execute(
      this.owner,
      this.moneyMarket.contractInfo["moneymarket_market"].contractAddress,
      {
        register_overseer: {
          overseer_contract: this.moneyMarket.contractInfo[
            "moneymarket_overseer"
          ].contractAddress,
        },
      },
      undefined,
      fee
    );
  }
}

export class Asset {
  public info: AccessInfo;
  public amount: string;

  constructor(tokenContractAddr: string, ntokenDenom: string, amount: string) {
    this.info = new AccessInfo(tokenContractAddr, ntokenDenom);
    this.amount = amount;
  }
}

class AccessInfo {
  Token: Token;
  NativeToken: NativeToken;
  constructor(contractAddr: string, ntokenDenom: string) {
    this.Token = new Token(contractAddr);
    this.NativeToken = new NativeToken(ntokenDenom);
  }
}

class Token {
  public contrctAddr: string;
  constructor(contracAddr: string) {
    this.contrctAddr = contracAddr;
  }
}

class NativeToken {
  public denom: string;
  constructor(denom: string) {
    this.denom = denom;
  }
}
