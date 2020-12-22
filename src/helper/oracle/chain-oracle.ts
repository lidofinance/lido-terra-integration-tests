// chain oracle

import { MsgAggregateExchangeRateVote, StdFee } from "@terra-money/terra.js";
import { Testkit, TestkitInit } from "../../testkit/testkit";

export const registerChainOracleVote = (
    validators: TestkitInit.Validator[],
    validatorsName: string[],
) => {
    return validators.map((validator, i) => {
        const vote = new MsgAggregateExchangeRateVote(
            "1200.000000000000000000ukrw,1.000000000000000000uusd,0.750000000000000000usdr,2400.000000000000000000umnt",
            "abcd",
            validator.Msg.delegator_address,
            validator.Msg.validator_address,
        )
        const prevote = vote.getPrevote()

        return [
            // do prevote
            Testkit.automaticTxRequest({
                accountName: validatorsName[i],
                period: 9999999999999,
                startAt: 2,
                msgs: [prevote],
                fee: new StdFee(10000000, "1000000uusd")
            }),

            // vote w/ offset 1
            Testkit.automaticTxRequest({
                accountName: validatorsName[i],
                period: 1,
                startAt: 3,
                msgs: [vote, prevote],
                fee: new StdFee(10000000, "1000000uusd")
            }),
        ]
    }).flat()
}

