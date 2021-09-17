import {get_redelegations, Redelegation, Validator} from "./redelegations"
var assert = require('assert');

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
        let redistributed_validators = apply_redelegations(validators, redelegations)
        let sum_redelegated = redistributed_validators.reduce(
            (acc, {amount}) => {
                return acc + amount
            },
            0
        )
        assert.equal(sum_redelegated, sum_orig)

        let DistributionSet = {}
        for (let i = 0; i < redistributed_validators.length; i++) {
            if (!DistributionSet.hasOwnProperty(redistributed_validators[i].amount)) {
                DistributionSet[redistributed_validators[i].amount] = 0
            }
            DistributionSet[redistributed_validators[i].amount]++
        }
        // at the end, in case there are no `inprogress_redelegations`
        // every validator should have th same amount of delegated coins
        // except may be one due to Math.floor at the beginning of the `get_redelegations` function
        assert.ok(Object.keys(DistributionSet).length <= 2)
    }
}

test_redelegations()

