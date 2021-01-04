import { Wallet } from "@terra-money/terra.js";
import * as path from 'path'
import Anchor from "../helper/spawn";
import { Contracts } from "../mantle-querier/types"

const locationBase = path.resolve(__dirname, "../../")

export async function anchor(owner: Wallet): Promise<Contracts> {

    const anchor = new Anchor(owner)

    await anchor.store_contracts(
        path.resolve(locationBase, './anchor-bAsset-contracts'),
        path.resolve(locationBase, './money-market-contracts'),
        path.resolve(locationBase, './terraswap')
    )
    await anchor.instantiate()

    const basset = anchor.bAsset;
    const moneyMarket = anchor.moneyMarket;
    const terraswap = anchor.terraswap;

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