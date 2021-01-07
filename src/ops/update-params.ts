import { StdFee, Wallet } from "@terra-money/terra.js";
import Anchor from '../helper/spawn'

export async function updatebLunaParams(owner: Wallet, nextParams: {
    epoch_period?: number,
    underlying_coin_denom?: string,
    unbonding_period?: number,
    peg_recovery_fee?: string,
    er_threshold?: string,
    reward_denom?: string,
}): Promise<void> {
    const anchor = new Anchor(owner)

    console.log('reconfiguring bLunaHub', nextParams)

    const testFee = new StdFee(6000000, '2000000uusd')

    await anchor.bAsset.params(owner, {
        ...nextParams
    }, testFee)
}