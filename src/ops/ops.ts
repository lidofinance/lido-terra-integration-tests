import { StdFee, Wallet } from "@terra-money/terra.js";
import * as path from 'path'
import Anchor from "../helper/spawn";
import { Contracts } from "../mantle-querier/types"

const locationBase = path.resolve(__dirname, "../../")

export async function anchor(owner: Wallet): Promise<Contracts> {
    const anchor = new Anchor(owner)
    const fixedFeeForInit = new StdFee(6000000, "2000000uusd")
    await anchor.store_contracts(
        path.resolve(locationBase, './anchor-bAsset-contracts/artifacts'),
        path.resolve(locationBase, './money-market-contracts/artifacts'),
        path.resolve(locationBase, './terraswap/artifacts'),
        fixedFeeForInit
    )

    await anchor.instantiate(fixedFeeForInit, {
        basset: {
            epoch_period: 12345,
            underlying_coin_denom: "uluna",
            unbonding_period: 86415,
            peg_recovery_fee: "0.001",
            er_threshold: "1.0",
            reward_denom: "uusd"
        },
        overseer: {
            stable_denom: "uusd",
            epoch_period: 12,
            distribution_threshold: "0.00000000951",
            target_deposit_rate: "0.00000001522",
            buffer_distribution_rate: "0.1",
            price_timeframe: 60,
        },
        market: {
            stable_denom: "uusd",
            reserve_factor: "0.05",
        },
        custody: {
            stable_denom: "uusd"
        },
        interest: {
            base_rate: "0.00000000381",
            interest_multiplier: "0.00000004",
        },
        oracle: {
            base_asset: "uusd"
        },
        liquidation: {
            stable_denom: "uusd",
            safe_ratio: "0.8",
            bid_fee: "0.01",
            max_premium_rate: "0.2",
            liquidation_threshold: "200",
            price_timeframe: 60,
        }
    })

    const basset = anchor.bAsset;
    const moneyMarket = anchor.moneyMarket;
    const terraswap = anchor.terraswap;

    // register ALL validators
    const validators = await owner.lcd.staking.validators()

    console.log("registering validators...")
    await validators.reduce((t, v) => t.then(() => {
        console.log(v.operator_address)
        return basset.register_validator(owner, v.operator_address, fixedFeeForInit)
    }), Promise.resolve())

    return {
        "bLunaHub": basset.contractInfo["anchor_basset_hub"].contractAddress,
        "bAssetToken": basset.contractInfo["anchor_basset_token"].contractAddress,
        "bAssetReward": basset.contractInfo["anchor_basset_reward"].contractAddress,
        "mmInterest": moneyMarket.contractInfo["moneymarket_interest"].contractAddress,
        "mmOracle": moneyMarket.contractInfo["moneymarket_oracle"].contractAddress,
        "mmMarket": moneyMarket.contractInfo["moneymarket_market"].contractAddress,
        "mmOverseer": moneyMarket.contractInfo["moneymarket_overseer"].contractAddress,
        "mmCustody": moneyMarket.contractInfo["moneymarket_custody"].contractAddress,
        "mmLiquidation": moneyMarket.contractInfo["moneymarket_liquidation"].contractAddress,
        "anchorToken": moneyMarket.contractInfo["anchorToken"].contractAddress,
        "terraswapFactory": terraswap.contractInfo["terraswap_factory"].contractAddress,
        "terraswapPair": "unused",
    }
}