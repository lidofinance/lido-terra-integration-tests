import basset from "./basset_helper";
import mMarket from "./money_market_helper";
import terraswap from "./terraswap_helper";
import { LocalTerra } from "@terra-money/terra.js";

const terra = new LocalTerra();
const admin = terra.wallets.test9;
const bassetLocation = "";
const mmLocation = "";
const terraswapLocation = "";

export default class Anchor {
  public bAsset: basset;
  public moneyMarket: mMarket;
  public terraswap: terraswap;

  constructor() {
    this.bAsset = new basset();
    this.moneyMarket = new mMarket();
    this.terraswap = new terraswap();
  }

  public async store_contracts(): Promise<void> {
    this.bAsset.storeCodes(admin, bassetLocation);
    this.moneyMarket.storeCodes(admin, mmLocation);
    this.terraswap.storeCodes(admin, terraswapLocation);
  }

  public async instantiate(): Promise<void> {
    await this.bAsset.instantiate(admin, "Bonded LUNA Token", "UBLUNA", 6);
    await this.bAsset.params(admin);
    await this.terraswap.instantiate_terraswap(admin);
    await this.moneyMarket.instantiate_interest(admin, 0.02, 0.2);
    await this.moneyMarket.instantiate_oracle(admin, "uusd");
    await this.moneyMarket.instantiate_liquidation(admin, 0.8, 10, 200);
    const anchorToken = this.terraswap.contractInfo["terraswap_token"]
      .contractAddress;
    await this.moneyMarket.instantiate_money(admin, "uusd", 0.2, anchorToken);
    await this.moneyMarket.instantiate_overseer(
      admin,
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
      admin,
      bassetToken,
      bassetReward,
      "uusd",
      terraswapPair
    );
    await this.moneyMarket.overseer_whitelist(admin, bassetToken, "0.5");
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
