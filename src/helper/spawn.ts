import basset from "./basset_helper";
import mMarket, { execute } from "./money_market_helper";
import terraswap from "./terraswap_helper";
import { Wallet } from "@terra-money/terra.js";

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
  ): Promise<void> {
    await this.bAsset.storeCodes(this.owner, bassetLocation);
    await this.moneyMarket.storeCodes(this.owner, mmLocation);
    await this.terraswap.storeCodes(this.owner, terraswapLocation);
  }

  public async instantiate(): Promise<void> {
    await this.bAsset.instantiate_hub(this.owner);
    await this.bAsset.instantiate_reward(this.owner);
    await this.bAsset.instantiate_token(this.owner);
    await this.bAsset.register_contracts(this.owner);

    await this.terraswap.instantiate_terraswap(this.owner);

    await this.moneyMarket.instantiate_interest(this.owner, 0.02, 0.2);
    await this.moneyMarket.instantiate_oracle(this.owner, "uusd");
    await this.moneyMarket.instantiate_liquidation(this.owner, 0.8, 10, 200);
    await this.moneyMarket.instantiate_money(
      this.owner,
      this.terraswap.contractInfo["terraswap_token"].codeId,
      "uusd",
      0.05
    );
    await this.moneyMarket.instantiate_overseer(
      this.owner,
      "uusd",
      60,
      0.00000001585,
      0.00000002537,
      0.1
    );
    const bassetReward = this.bAsset.contractInfo["anchor_basset_reward"]
      .contractAddress;
    const bassetToken = this.bAsset.contractInfo["anchor_basset_token"]
      .contractAddress;
    const terraswapPair = this.terraswap.contractInfo["terraswap_pair"]
      .contractAddress;
    await this.moneyMarket.instantiate_custody(
      this.owner,
      bassetToken,
      bassetReward,
      "uusd",
      terraswapPair
    );
    await this.moneyMarket.overseer_whitelist(this.owner, bassetToken, "0.5");
    await execute(this.owner, this.moneyMarket.contractInfo["moneymarket_market"].contractAddress, {
      register_overseer: {
        overseer_contract: this.moneyMarket.contractInfo["moneymarket_overseer"].contractAddress
      }
    })
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
