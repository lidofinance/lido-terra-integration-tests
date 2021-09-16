import {Coin, isTxError, LCDClient, Wallet} from "@terra-money/terra.js";
import {execute} from "../helper/flow/execution";
import {sleep} from "../testcases/common_localtestnet";
import {get_redelegations, Redelegation, Validator} from "./redelegations";

const incoming_redelegations_inprogress = async (
    wallet: Wallet,
    hubContract: string,
    validators: Array<Validator>
): Promise<Array<string>> => {
    let validators_incoming_redelegations: Array<string> = []
    let redelegations = await wallet.lcd.staking.redelegations(hubContract)
    let validators_address = validators.map((v) => {return v.validator})
    for (let i = 0; i < redelegations.length; i++) {
        let r = redelegations[i]
        if (validators_address.indexOf(r.validator_dst_address) != -1) {
            validators_incoming_redelegations.push(r.validator_dst_address)
        }
    }
    return validators_incoming_redelegations
}

export const redistribute = async (
    lcd: LCDClient,
    owner: Wallet,
    hubContract: string,
    validators: Array<Validator>,
): Promise<void> => {
    let inprogress = await incoming_redelegations_inprogress(owner, hubContract, validators)
    let redelegations = get_redelegations(validators, inprogress)
    for (let i = 0; i < redelegations.length; i++) {
        let r = redelegations[i]
        const redelegateExecution = await execute(
            owner,
            hubContract,
            {
                redelegate_proxy: {
                    src_validator: r.srcVal,
                    redelegations: [[r.dstVal, {denom: "uluna", amount: `${r.amount}`}]],
                },
            },
            undefined
        );
        if (isTxError(redelegateExecution)) {
            throw new Error(`Couldn't run: ${redelegateExecution.raw_log}`);
        }
    }
}