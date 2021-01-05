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
            epoch_period: 86,
            unbonding_period: 602,
        },
        overseer: {
            epoch_period: 60,
            price_timeframe: 60,
        },
        liquidation: {
            price_timeframe: 60
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