import {get_redelegations, Redelegation, Validator} from "./redelegations"

export const apply_redelegations = (validators: Array<Validator>, redelegations: Array<Redelegation>): Array<Validator> => {
    for (let i = 0; i < redelegations.length; i++) {
        let r = redelegations[i]
        let srcVal = validators.find((v) => {if (v.validator == r.srcVal) {return true} })
        let dstVal = validators.find((v) => {if (v.validator == r.dstVal) {return true} })
        srcVal.amount -= r.amount
        dstVal.amount += r.amount
    }
    return validators
}

const generate_validators = (amount: number): Array<Validator> => {
    let validators: Array<Validator> = []
    for (let i = 0; i < amount; i++) {
        validators.push({
            validator: `validator${i}`,
            amount: Math.floor((Math.random() + 1) * 10_000_000_000_000)
        })
    }
    return validators
}

const test_redelegations = () => {
    // kind of property based testing
    for (let i = 2; i < 20; i++) {
        let validators = generate_validators(i)
        let sum_orig = validators.reduce(
            (acc, {amount}) => {
                return acc + amount
            },
            0
        )
        let copyValidators: Array<Validator> = JSON.parse(JSON.stringify(validators))
        let redelegations = get_redelegations(copyValidators, [])
        validators = apply_redelegations(validators, redelegations)
        let sum_redelegated = validators.reduce(
            (acc, {amount}) => {
                return acc + amount
            },
            0
        )
        if (sum_orig != sum_redelegated) {
            throw new Error(`expected ${sum_orig}, got ${sum_redelegated}`);
        }
    }
}

test_redelegations()

