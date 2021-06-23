import basset from "./basset_helper";
import mMarket, { BAssetInfo } from "./money_market_helper";
import terraswap from "./terraswap_helper";
import { StdFee, Validator, Wallet } from "@terra-money/terra.js";
import { execute } from "./flow/execution";
import AnchorToken from "./anchor_token_helper";
import { Testkit, TestkitInit } from "../testkit/testkit";

// https://terra-money.quip.com/lR4sAHcX3yiB/WebApp-Dev-Page-Deployment#UKCACAa6MDK
export interface CustomInstantiationParam {
  testAccount: string;
  basset?: {
    epoch_period?: number;
    unbonding_period?: number;
    underlying_coin_denom?: string;
    peg_recovery_fee?: string;
    er_threshold?: string;
    reward_denom?: string;
    validator?: string;
  };
  overseer?: {
    stable_denom?: string;
    epoch_period?: number;
    distribution_threshold?: string;
    target_deposit_rate?: string;
    buffer_distribution_rate?: string;
    price_timeframe?: number;
  };
  market?: {
    stable_denom?: string;
    reserve_factor?: string;
  };
  custody?: {
    stable_denom?: string;
  };
  interest?: {
    owner?: string;
    base_rate?: string;
    interest_multiplier?: string;
  };
  oracle?: {
    base_asset?: string;
  };
  liquidation?: {
    stable_denom?: string;
    safe_ratio?: string;
    bid_fee?: string;
    max_premium_rate?: string;
    liquidation_threshold?: string;
    price_timeframe?: number;
  };
}

export default class Anchor {
  public bAsset: basset;
  public moneyMarket: mMarket;
  public terraswap: terraswap;
  public ANC: AnchorToken;
  private owner: Wallet;

  constructor(owner: Wallet) {
    this.owner = owner;
    this.bAsset = new basset();
    this.moneyMarket = new mMarket();
    this.terraswap = new terraswap();
    this.ANC = new AnchorToken();
  }

  public async store_contracts(
    bassetLocation: string,
    mmLocation: string,
    terraswapLocation: string,
    ancLocation: string,
    fee?: StdFee
  ): Promise<void> {
    await this.bAsset.storeCodes(this.owner, bassetLocation, fee);
    await this.moneyMarket.storeCodes(this.owner, mmLocation, fee);
    await this.terraswap.storeCodes(this.owner, terraswapLocation, fee);
    await this.ANC.storeCodes(this.owner, ancLocation, fee);
  }

  public async instantiate(
    fee?: StdFee,
    params?: CustomInstantiationParam,
    validators?: Array<TestkitInit.Validator>
  ): Promise<void> {
    
    await this.bAsset.instantiate_hub(this.owner, params?.basset, fee);
    await this.bAsset.instantiate_validators_registry(this.owner, {
      hub_contract: this.bAsset.contractInfo.anchor_basset_hub.contractAddress,
      registry: validators.map((val) => {return {active:true,total_delegated: "100",address:val.validator_address}})
    }, fee);
    await this.bAsset.instantiate_st_luna(this.owner, {}, fee);
    await this.bAsset.instantiate_reward(this.owner, {}, fee);
    await this.bAsset.instantiate_token(this.owner, {}, fee);
    await this.bAsset.instantiate_airdrop(this.owner, {}, fee);
    await this.bAsset.instantiate_anchor_basset_rewards_dispatcher(this.owner,{},fee)

    await this.bAsset.register_contracts(this.owner, {}, fee);

    await this.terraswap.instantiate_terraswap(this.owner, fee);

    //instantiate ARC token
    await this.ANC.instantiate_token(this.owner, {}, fee);
    await this.ANC.airdrop_instantiation(this.owner, {}, fee);
    await this.ANC.gov_instantiate(this.owner, {}, fee);
    await this.ANC.community_instantiation(this.owner, {}, fee);

    //TODO Create Pair
    await this.terraswap.create_anchor_pair(
      this.owner,
      this.ANC.contractInfo["token"].contractAddress,
      "uusd"
    );

    await this.ANC.staking_instantiation(
      this.owner,
      {
        staking_token: this.terraswap.contractInfo["token_token"]
          .contractAddress,
      },
      fee
    );

    await this.moneyMarket.instantiate_oracle(this.owner, params?.oracle, fee);

    await this.moneyMarket.instantiate_liquidation(
      this.owner,
      { owner: this.ANC.contractInfo["gov"].contractAddress },
      fee
    );

    await this.moneyMarket.instantiate_interest(
      this.owner,
      { owner: this.ANC.contractInfo["gov"].contractAddress },
      fee
    );

    await this.moneyMarket.instantiate_distribution(
      this.owner,
      { owner: this.ANC.contractInfo["gov"].contractAddress },
      fee
    );

    await this.moneyMarket.instantiate_money(
      this.owner,
      {
        terraswap_token_code_id: this.terraswap.contractInfo["terraswap_token"]
          .codeId,
      },
      fee
    );

    await this.ANC.faucet_instantiation(
      this.owner,
      {
        whitelist: [
          this.moneyMarket.contractInfo["moneymarket_market"].contractAddress,
        ],
      },
      fee
    );

    await this.ANC.collector_instantiation(
      this.owner,
      {
        terraswap_factory: this.terraswap.contractInfo["terraswap_factory"]
          .contractAddress,
      },
      fee
    );

    await this.moneyMarket.instantiate_overseer(
      this.owner,
      {
        ...params?.overseer,
        collector_contract: this.ANC.contractInfo["collector"].contractAddress,
      },
      fee
    );

    await this.moneyMarket.market_register_contracts(this.owner, {
      collector_contract: this.ANC.contractInfo["collector"].contractAddress,
      faucet_contract: this.ANC.contractInfo["faucet"].contractAddress,
    });

    const bassetReward = this.bAsset.contractInfo["anchor_basset_reward"]
      .contractAddress;
    const bassetToken = this.bAsset.contractInfo["anchor_basset_token"]
      .contractAddress;

    const gov = this.ANC.contractInfo["gov"].contractAddress;

    const basset_info: BAssetInfo = {
      name: "bondedLuna",
      symbol: "BLUNA",
      decimals: 6,
    };

    await this.moneyMarket.instantiate_custody(
      this.owner,
      {
        ...params?.custody,
        owner: this.ANC.contractInfo["collector"].contractAddress,
        basset_token: bassetToken,
        basset_reward: bassetReward,
        basset_info: basset_info,
      },
      fee
    );

    await this.moneyMarket.overseer_whitelist(
      this.owner,
      bassetToken,
      "0.5",
      fee
    );

    await this.moneyMarket.oracle_register_feeder(
      this.owner,
      this.bAsset.contractInfo["anchor_basset_token"].contractAddress,
      this.owner.key.accAddress
    );

    await this.moneyMarket.overseer_update_config(this.owner, {
      owner_addr: gov,
    });
    await this.moneyMarket.market_update_config(this.owner, {
      owner_addr: gov,
    });
    await this.moneyMarket.oracle_update_config(this.owner, gov);
    await this.ANC.gov_update_config(this.owner, { owner: gov });

    await this.ANC.transfer_cw20_token(
      this.owner,
      this.ANC.contractInfo["airdrop"].contractAddress,
      100000000000
    );
    await this.ANC.transfer_cw20_token(
      this.owner,
      this.ANC.contractInfo["community"].contractAddress,
      100000000000
    );
    await this.ANC.transfer_cw20_token(
      this.owner,
      this.ANC.contractInfo["staking"].contractAddress,
      100000000000
    );
    await this.ANC.transfer_cw20_token(
      this.owner,
      this.ANC.contractInfo["faucet"].contractAddress,
      100000000000
    );

    //await this.terraswap.instantiate_terraswap(this.owner, fee);

    // luna <> bluna Terraswap pair cration
    // ----------------------------------------------------------
    await this.terraswap.create_pair(
      this.owner,
      this.bAsset.contractInfo["anchor_basset_token"].contractAddress,
      "uluna"
    );

    await this.bAsset.bond(this.owner, 100000000000);

    await this.bAsset.increase_allowance(
      this.owner,
      this.terraswap.contractInfo["terraswap_pair"].contractAddress,
      100000000000,
      { never: {} }
    );

    await this.terraswap.provide_liquidity(
      this.owner,
      this.bAsset.contractInfo["anchor_basset_token"].contractAddress,
      "uluna",
      100000000000,
      100000000000
    );
    // ----------------------------------------------------------

    await this.bAsset.add_airdrop_info(
      this.owner,
      this.ANC.contractInfo["token"].contractAddress,
      this.ANC.contractInfo["airdrop"].contractAddress,
      this.terraswap.contractInfo["terraswap_pair"].contractAddress
    );

    await this.terraswap.transfer_cw20_token(
      this.owner,
      params.testAccount,
      100000000000
    );
    await this.ANC.transfer_cw20_token(
      this.owner,
      params.testAccount,
      100000000000
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
