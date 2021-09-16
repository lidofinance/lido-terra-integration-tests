
export type Validator = {
    validator: string;
    amount: number;
}

export type Redelegation = {
    srcVal: string;
    dstVal: string;
    amount: number;
}


export const get_redelegations = (
    validators: Array<Validator>,
    validators_incoming_validations: Array<string>
): Array<Redelegation> => {
    const target = Math.floor(validators.reduce(
        (acc, {amount}) => {
            return acc + amount
        },
        0
    ) / validators.length)

    const validators_delegate_to = validators.filter((v) => {if (v.amount < target) {return true} })
    const validators_undelegate_from = validators.filter(
        (v) => {
            // we are unable redelegate from validators handling incoming redelegate transaction
            // filter them out 
            if (v.amount > target && validators_incoming_validations.indexOf(v.validator) == -1) {
                return true
            }
        }
    )

    let redelegations: Array<Redelegation> = []
    let u = validators_undelegate_from.pop()
    while (u.amount > target) {
        let can_to_undelegate = u.amount - target
        let candidat_delegate_to_idx = 0
        let best_to_delegate = target - validators_delegate_to[candidat_delegate_to_idx].amount
        for (let i = 0; i < validators_delegate_to.length; i++) {
            let d = validators_delegate_to[i]
            let need_to_delegate = target - d.amount
            //looking for closest need_to_delegate value to can_to_undelegate value
            if (
                Math.abs(need_to_delegate - can_to_undelegate)
                < Math.abs(best_to_delegate - can_to_undelegate)
            ) {
                candidat_delegate_to_idx = i
                best_to_delegate = target - validators_delegate_to[candidat_delegate_to_idx].amount
            }
        }
        // candidate deligate_to found
        let redelegate_amount = Math.min(best_to_delegate, can_to_undelegate)
        u.amount -= redelegate_amount
        validators_delegate_to[candidat_delegate_to_idx].amount += redelegate_amount
        redelegations.push({
            srcVal: u.validator,
            dstVal: validators_delegate_to[candidat_delegate_to_idx].validator,
            amount: redelegate_amount
        })

        if (validators_delegate_to[candidat_delegate_to_idx].amount == target) {
            validators_delegate_to.splice(candidat_delegate_to_idx, 1)
            if (validators_delegate_to.length == 0) {
                break
            }
        }

        if (u.amount == target) {
            if (validators_undelegate_from.length == 0) {
                break
            }
            u = validators_undelegate_from.pop()
        }

    }
    return redelegations
}

