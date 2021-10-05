import {Coin, Fee, isTxError, LCDClient, LegacyAminoMultisigPublicKey, MnemonicKey, MsgExecuteContract, SignDoc, Wallet} from "@terra-money/terra.js";
import {MultiSignature} from "@terra-money/terra.js/dist/core/MultiSignature";
import {SignatureV2} from "@terra-money/terra.js/dist/core/SignatureV2";
import {execute} from "../helper/flow/execution";
import {TestState} from "../testcases/common";
import {get_redelegations, Validator} from "./redelegations";

const incoming_redelegations_inprogress = async (
    lcd: LCDClient,
    hubContract: string,
    validators: Array<Validator>
): Promise<Array<string>> => {
    let validators_incoming_redelegations: Array<string> = []
    // TODO: stop ignoring pagination?
    let [redelegations, pagination] = await lcd.staking.redelegations(hubContract)
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
    multisigPubkey: LegacyAminoMultisigPublicKey,
    keys: Array<MnemonicKey>,
    hubContract: string,
    validators: Array<Validator>,
): Promise<void> => {
    let inprogress = await incoming_redelegations_inprogress(lcd, hubContract, validators)
    let redelegations = get_redelegations(validators, inprogress)
    for (let i = 0; i < redelegations.length; i++) {

        let r = redelegations[i]
        await redelegate_proxy_multisig(lcd, hubContract, multisigPubkey, keys, r.srcVal, [[r.dstVal, new Coin("uluna", r.amount)]])
    }
}


export const redelegate_proxy_multisig = async (
    lcd: LCDClient,
    hubcontract: string,
    multisigPubkey: LegacyAminoMultisigPublicKey,
    keys: Array<MnemonicKey>,
    src_validator_address: string,
    redelegations: Array<[string, Coin]>,
): Promise<void> => {

    const multisigAddr = multisigPubkey.address()
    const multisig = new MultiSignature(multisigPubkey);
    const accInfo = await lcd.auth.accountInfo(multisigAddr);
    const msg = new MsgExecuteContract(
        multisigAddr,
        hubcontract,
        {
            redelegate_proxy: {
                src_validator: src_validator_address,
                redelegations: redelegations.map(([dst_addr, coin]) => {return [dst_addr, {amount: `${coin.amount}`, denom: coin.denom}]}),
            },
        })
    
    const tx = await lcd.tx.create(
        [
            {
                address: multisigAddr,
                sequenceNumber: accInfo.getSequenceNumber(),
                publicKey: accInfo.getPublicKey(),
            },
        ],
        {
            msgs: [msg],
            memo: 'memo',
            fee: new Fee(10000000, "10000000uusd")
        }
    );

    const sigs = await Promise.all(keys.map(async (mk) => {
        const sig = await mk.createSignatureAmino(
            new SignDoc(
                lcd.config.chainID,
                accInfo.getAccountNumber(),
                accInfo.getSequenceNumber(),
                tx.auth_info,
                tx.body
            )
        );
        return sig
    }))

    multisig.appendSignatureV2s(sigs)
    tx.appendSignatures([
        new SignatureV2(
            multisigPubkey,
            multisig.toSignatureDescriptor(),
            accInfo.getSequenceNumber()
        ),
    ]);

    const multisigRedelegationTxResult = await lcd.tx.broadcast(tx)
    if (isTxError(multisigRedelegationTxResult)) {
        throw new Error(`Couldn't run: ${multisigRedelegationTxResult.raw_log}`);
    }
}