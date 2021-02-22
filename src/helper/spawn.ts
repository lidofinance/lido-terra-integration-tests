import basset from "./basset_helper";
import mMarket from "./money_market_helper";
import terraswap from "./terraswap_helper";
import { StdFee, Wallet } from "@terra-money/terra.js";
import { execute } from "./flow/execution";

// https://terra-money.quip.com/lR4sAHcX3yiB/WebApp-Dev-Page-Deployment#UKCACAa6MDK
export interface CustomInstantiationParam {
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

    public async instantiate(
        fee?: StdFee,
        params?: CustomInstantiationParam
    ): Promise<void> {
        await this.bAsset.instantiate_hub(this.owner, params?.basset, fee);
        await this.bAsset.instantiate_reward(this.owner, {}, fee);
        await this.bAsset.instantiate_token(this.owner, {}, fee);
        await this.bAsset.instantiate_airdrop(this.owner, {}, fee);
        await this.bAsset.register_contracts(this.owner, {}, fee);

        await this.terraswap.instantiate_terraswap(this.owner, fee);

        // luna <> bluna Terraswap pair cration
        // ----------------------------------------------------------
        // await this.terraswap.create_pair(
        //   this.owner,
        //   this.bAsset.contractInfo["anchor_basset_token"].contractAddress,
        //   "uluna"
        // );
        //
        // await this.bAsset.bond(this.owner, 1100000000000, params.basset.validator);
        //
        // await this.bAsset.increase_allowance(
        //   this.owner,
        //   this.terraswap.contractInfo["terraswap_pair"].contractAddress,
        //   1000000000000,
        //   { never: {} }
        // );
        //
        // await this.terraswap.provide_liquidity(
        //   this.owner,
        //     this.bAsset.contractInfo["anchor_basset_token"].contractAddress,
        //   "uluna",
        //   1000000000000,
        //     1000000000000,
        // );
        // ----------------------------------------------------------

        await this.moneyMarket.instantiate_interest(
            this.owner,
            params?.interest,
            fee
        );
        await this.moneyMarket.instantiate_oracle(this.owner, params?.oracle, fee);
        await this.moneyMarket.instantiate_liquidation(
            this.owner,
            params?.liquidation,
            fee
        );

        await this.moneyMarket.instantiate_money(
            this.owner,
            {
                ...params?.market,
                terraswap_token_code_id: this.terraswap.contractInfo["terraswap_token"]
                    .codeId,
            },
            fee
        );

        await this.moneyMarket.instantiate_overseer(
            this.owner,
            params?.overseer,
            fee
        );

        const bassetReward = this.bAsset.contractInfo["anchor_basset_reward"]
            .contractAddress;
        const bassetToken = this.bAsset.contractInfo["anchor_basset_token"]
            .contractAddress;
        await this.moneyMarket.instantiate_custody(
            this.owner,
            {
                ...params?.custody,
                basset_token: bassetToken,
                basset_reward: bassetReward,
            },
            fee
        );
        await this.moneyMarket.overseer_whitelist(
            this.owner,
            bassetToken,
            "0.5",
            fee
        );
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
