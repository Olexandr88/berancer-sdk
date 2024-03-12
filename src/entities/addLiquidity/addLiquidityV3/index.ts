import { encodeFunctionData } from 'viem';
import { balancerRouterAbi } from '@/abi';
import { Token } from '@/entities/token';
import { TokenAmount } from '@/entities/tokenAmount';
import { PoolState } from '@/entities/types';
import { getAmounts, getSortedTokens } from '@/entities/utils';
import { Hex } from '@/types';
import {
    BALANCER_ROUTER,
    addLiquidityProportionalUnavailableError,
    addLiquiditySingleTokenShouldHaveTokenInIndexError,
} from '@/utils';

import { getAmountsCall } from '../helpers';
import {
    AddLiquidityBase,
    AddLiquidityBaseBuildCallInput,
    AddLiquidityBaseQueryOutput,
    AddLiquidityBuildCallOutput,
    AddLiquidityInput,
    AddLiquidityKind,
} from '../types';
import { doAddLiquidityUnbalancedQuery } from './doAddLiquidityUnbalancedQuery';
import { doAddLiquiditySingleTokenQuery } from './doAddLiquiditySingleTokenQuery';
import { getValue } from '@/entities/utils/getValue';

export class AddLiquidityV3 implements AddLiquidityBase {
    async query(
        input: AddLiquidityInput,
        poolState: PoolState,
    ): Promise<AddLiquidityBaseQueryOutput> {
        const sortedTokens = getSortedTokens(poolState.tokens, input.chainId);
        const bptToken = new Token(input.chainId, poolState.address, 18);

        let bptOut: TokenAmount;
        let amountsIn: TokenAmount[];
        let tokenInIndex: number | undefined;

        switch (input.kind) {
            case AddLiquidityKind.Proportional:
                throw addLiquidityProportionalUnavailableError;
            case AddLiquidityKind.Unbalanced: {
                const maxAmountsIn = getAmounts(sortedTokens, input.amountsIn);
                const bptAmountOut = await doAddLiquidityUnbalancedQuery(
                    input,
                    poolState.address,
                    maxAmountsIn,
                );
                bptOut = TokenAmount.fromRawAmount(bptToken, bptAmountOut);
                amountsIn = sortedTokens.map((t, i) =>
                    TokenAmount.fromRawAmount(t, maxAmountsIn[i]),
                );
                tokenInIndex = undefined;
                break;
            }
            case AddLiquidityKind.SingleToken: {
                bptOut = TokenAmount.fromRawAmount(
                    bptToken,
                    input.bptOut.rawAmount,
                );
                const maxAmountsIn = await doAddLiquiditySingleTokenQuery(
                    input,
                    poolState.address,
                    input.bptOut.rawAmount,
                );
                amountsIn = sortedTokens.map((t, i) =>
                    TokenAmount.fromRawAmount(t, maxAmountsIn[i]),
                );
                tokenInIndex = sortedTokens.findIndex((t) =>
                    t.isSameAddress(input.tokenIn),
                );
                break;
            }
        }

        const output: AddLiquidityBaseQueryOutput = {
            poolType: poolState.type,
            poolId: poolState.id,
            addLiquidityKind: input.kind,
            bptOut,
            amountsIn,
            vaultVersion: 3,
            tokenInIndex,
        };

        return output;
    }

    buildCall(
        input: AddLiquidityBaseBuildCallInput,
    ): AddLiquidityBuildCallOutput {
        const amounts = getAmountsCall(input);
        let call: Hex;
        switch (input.addLiquidityKind) {
            case AddLiquidityKind.Proportional:
                throw addLiquidityProportionalUnavailableError;
            case AddLiquidityKind.Unbalanced:
                {
                    call = encodeFunctionData({
                        abi: balancerRouterAbi,
                        functionName: 'addLiquidityUnbalanced',
                        args: [
                            input.poolId,
                            input.amountsIn.map((a) => a.amount),
                            amounts.minimumBpt,
                            !!input.wethIsEth,
                            '0x',
                        ],
                    });
                }
                break;
            case AddLiquidityKind.SingleToken:
                {
                    // just a sanity check as this is already checked in InputValidator
                    if (input.tokenInIndex === undefined) {
                        throw addLiquiditySingleTokenShouldHaveTokenInIndexError;
                    }
                    call = encodeFunctionData({
                        abi: balancerRouterAbi,
                        functionName: 'addLiquiditySingleTokenExactOut',
                        args: [
                            input.poolId,
                            input.amountsIn[input.tokenInIndex].token.address,
                            input.amountsIn[input.tokenInIndex].amount,
                            input.bptOut.amount,
                            !!input.wethIsEth,
                            '0x',
                        ],
                    });
                }
                break;
        }

        return {
            call,
            to: BALANCER_ROUTER[input.chainId],
            value: getValue(input.amountsIn, !!input.wethIsEth),
            minBptOut: TokenAmount.fromRawAmount(
                input.bptOut.token,
                amounts.minimumBpt,
            ),
            maxAmountsIn: input.amountsIn.map((a, i) =>
                TokenAmount.fromRawAmount(a.token, amounts.maxAmountsIn[i]),
            ),
        };
    }
}
