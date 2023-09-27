import { JoinInput, JoinKind } from '../types';
import { PoolStateInput } from '../../types';
import { areTokensInArray } from '../../utils/areTokensInArray';

export function validateInputs(input: JoinInput, poolState: PoolStateInput) {
    switch (input.kind) {
        case JoinKind.Init:
        case JoinKind.Unbalanced:
            areTokensInArray(
                input.amountsIn.map((a) => a.token.address),
                poolState.tokens.map((t) => t.address),
            );
            break;
        case JoinKind.SingleAsset:
            areTokensInArray(
                [input.tokenIn],
                poolState.tokens.map((t) => t.address),
            );
        case JoinKind.Proportional:
            areTokensInArray([input.bptOut.token.address], [poolState.address]);
        default:
            break;
    }
}
