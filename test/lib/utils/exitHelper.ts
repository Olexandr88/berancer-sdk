import { ExitTxInput } from './types';
import {
    ChainId,
    ComposableStableExitQueryOutput,
    ExitBuildOutput,
    ExitQueryOutput,
    NATIVE_ASSETS,
    PoolStateInput,
    TokenAmount,
    Slippage,
    Token,
    UnbalancedExitInput,
    SingleAssetExitInput,
    BALANCER_VAULT,
    ExitInput,
    ProportionalExitInput,
} from '../../../src';
import { sendTransactionGetBalances, TxResult } from './helper';
import { expect } from 'vitest';
import { zeroAddress } from 'viem';
import { getTokensForBalanceCheck } from './getTokensForBalanceCheck';

type ExitResult = {
    exitQueryOutput: ExitQueryOutput;
    exitBuildOutput: ExitBuildOutput;
    txOutput: TxResult;
};

export const sdkExit = async ({
    poolExit,
    exitInput,
    poolStateInput,
    slippage,
    testAddress,
}: Omit<ExitTxInput, 'client'>): Promise<{
    exitBuildOutput: ExitBuildOutput;
    exitQueryOutput: ExitQueryOutput;
}> => {
    const exitQueryOutput = await poolExit.query(exitInput, poolStateInput);
    const exitBuildOutput = poolExit.buildCall({
        ...exitQueryOutput,
        slippage,
        sender: testAddress,
        recipient: testAddress,
    });

    return {
        exitBuildOutput,
        exitQueryOutput,
    };
};

function isComposableStableExitQueryOutput(result: ExitQueryOutput): boolean {
    return (result as ComposableStableExitQueryOutput).bptIndex !== undefined;
}

function getCheck(result: ExitQueryOutput, isExactIn: boolean) {
    if (isComposableStableExitQueryOutput(result)) {
        if (isExactIn) {
            // Using this destructuring to return only the fields of interest
            // rome-ignore lint/correctness/noUnusedVariables: <explanation>
            const { amountsOut, bptIndex, ...check } =
                result as ComposableStableExitQueryOutput;
            return check;
        } else {
            // rome-ignore lint/correctness/noUnusedVariables: <explanation>
            const { bptIn, bptIndex, ...check } =
                result as ComposableStableExitQueryOutput;
            return check;
        }
    } else {
        if (isExactIn) {
            // rome-ignore lint/correctness/noUnusedVariables: <explanation>
            const { amountsOut, ...check } = result;
            return check;
        } else {
            // rome-ignore lint/correctness/noUnusedVariables: <explanation>
            const { bptIn, ...check } = result;
            return check;
        }
    }
}

/**
 * Create and submit exit transaction.
 * @param txInput
 *     @param client: Client & PublicActions & WalletActions - The RPC client
 *     @param poolExit: PoolExit - The pool exit class, used to query the exit and build the exit call
 *     @param exitInput: ExitInput - The parameters of the exit transaction, example: bptIn, amountsOut, etc.
 *     @param slippage: Slippage - The slippage tolerance for the exit transaction
 *     @param poolStateInput: PoolStateInput - The state of the pool being exited
 *     @param testAddress: Address - The address to send the transaction from
 *  */
export async function doExit(txInput: ExitTxInput) {
    const {
        poolExit,
        poolStateInput,
        exitInput,
        testAddress,
        client,
        slippage,
    } = txInput;

    const { exitQueryOutput, exitBuildOutput } = await sdkExit({
        poolExit,
        exitInput,
        poolStateInput,
        slippage,
        testAddress,
    });

    // get tokens for balance change - pool tokens, BPT, native
    const tokens = getTokensForBalanceCheck(poolStateInput);

    // send transaction and calculate balance changes
    const txOutput = await sendTransactionGetBalances(
        tokens,
        client,
        testAddress,
        exitBuildOutput.to,
        exitBuildOutput.call,
        exitBuildOutput.value,
    );

    return {
        exitQueryOutput,
        exitBuildOutput,
        txOutput,
    };
}

export function assertUnbalancedExit(
    chainId: ChainId,
    poolStateInput: PoolStateInput,
    exitInput: UnbalancedExitInput,
    exitResult: ExitResult,
    slippage: Slippage,
) {
    const { txOutput, exitQueryOutput, exitBuildOutput } = exitResult;

    // Get an amount for each pool token defaulting to 0 if not provided as input (this will include BPT token if in tokenList)
    const expectedAmountsOut = poolStateInput.tokens.map((t) => {
        let token;
        if (
            exitInput.exitWithNativeAsset &&
            t.address === NATIVE_ASSETS[chainId].wrapped
        )
            token = new Token(chainId, zeroAddress, t.decimals);
        else token = new Token(chainId, t.address, t.decimals);
        const input = exitInput.amountsOut.find((a) => a.address === t.address);
        if (input === undefined) return TokenAmount.fromRawAmount(token, 0n);
        else return TokenAmount.fromRawAmount(token, input.rawAmount);
    });

    const expectedQueryOutput: Omit<ExitQueryOutput, 'bptIn' | 'bptIndex'> = {
        // Query should use same amountsOut as input
        amountsOut: expectedAmountsOut,
        tokenOutIndex: undefined,
        // Should match inputs
        poolId: poolStateInput.id,
        poolType: poolStateInput.type,
        toInternalBalance: !!exitInput.toInternalBalance,
        exitKind: exitInput.kind,
    };

    const queryCheck = getCheck(exitQueryOutput, false);

    expect(queryCheck).to.deep.eq(expectedQueryOutput);

    // Expect some bpt amount
    expect(exitQueryOutput.bptIn.amount > 0n).to.be.true;

    assertExitBuildOutput(exitQueryOutput, exitBuildOutput, false, slippage);

    assertTokenDeltas(poolStateInput, exitInput, exitQueryOutput, txOutput);
}

export function assertSingleTokenExit(
    chainId: ChainId,
    poolStateInput: PoolStateInput,
    exitInput: SingleAssetExitInput,
    exitResult: ExitResult,
    slippage: Slippage,
) {
    const { txOutput, exitQueryOutput, exitBuildOutput } = exitResult;

    if (exitQueryOutput.tokenOutIndex === undefined) throw Error('No index');

    const bptToken = new Token(chainId, poolStateInput.address, 18);

    const tokensWithoutBpt = poolStateInput.tokens.filter(
        (t) => t.address !== poolStateInput.address,
    );

    const expectedQueryOutput: Omit<
        ExitQueryOutput,
        'amountsOut' | 'bptIndex'
    > = {
        // Query should use same bpt out as user sets
        bptIn: TokenAmount.fromRawAmount(bptToken, exitInput.bptIn.rawAmount),
        tokenOutIndex: tokensWithoutBpt.findIndex(
            (t) => t.address === exitInput.tokenOut,
        ),
        // Should match inputs
        poolId: poolStateInput.id,
        poolType: poolStateInput.type,
        toInternalBalance: !!exitInput.toInternalBalance,
        exitKind: exitInput.kind,
    };

    const queryCheck = getCheck(exitQueryOutput, true);

    expect(queryCheck).to.deep.eq(expectedQueryOutput);

    // Expect only tokenOut to have amount > 0
    // (Note exitQueryOutput also has value for bpt if pre-minted)
    exitQueryOutput.amountsOut.forEach((a) => {
        if (
            !exitInput.exitWithNativeAsset &&
            a.token.address === exitInput.tokenOut
        )
            expect(a.amount > 0n).to.be.true;
        else if (
            exitInput.exitWithNativeAsset &&
            a.token.address === zeroAddress
        )
            expect(a.amount > 0n).to.be.true;
        else expect(a.amount).toEqual(0n);
    });

    assertExitBuildOutput(exitQueryOutput, exitBuildOutput, true, slippage);

    assertTokenDeltas(poolStateInput, exitInput, exitQueryOutput, txOutput);
}

export function assertProportionalExit(
    chainId: ChainId,
    poolStateInput: PoolStateInput,
    exitInput: ProportionalExitInput,
    exitResult: ExitResult,
    slippage: Slippage,
) {
    const { txOutput, exitQueryOutput, exitBuildOutput } = exitResult;

    const bptToken = new Token(chainId, poolStateInput.address, 18);

    const expectedQueryOutput: Omit<
        ExitQueryOutput,
        'amountsOut' | 'bptIndex'
    > = {
        // Query should use same bpt out as user sets
        bptIn: TokenAmount.fromRawAmount(bptToken, exitInput.bptIn.rawAmount),
        // Only expect tokenInIndex for AddLiquiditySingleAsset
        tokenOutIndex: undefined,
        // Should match inputs
        poolId: poolStateInput.id,
        poolType: poolStateInput.type,
        toInternalBalance: !!exitInput.toInternalBalance,
        exitKind: exitInput.kind,
    };

    const queryCheck = getCheck(exitQueryOutput, true);

    expect(queryCheck).to.deep.eq(expectedQueryOutput);

    // Expect all assets in to have an amount > 0 apart from BPT if it exists
    exitQueryOutput.amountsOut.forEach((a) => {
        if (a.token.address === poolStateInput.address)
            expect(a.amount).toEqual(0n);
        else expect(a.amount > 0n).to.be.true;
    });

    assertExitBuildOutput(exitQueryOutput, exitBuildOutput, true, slippage);

    assertTokenDeltas(poolStateInput, exitInput, exitQueryOutput, txOutput);
}

function assertTokenDeltas(
    poolStateInput: PoolStateInput,
    exitInput: ExitInput,
    exitQueryOutput: ExitQueryOutput,
    txOutput: TxResult,
) {
    expect(txOutput.transactionReceipt.status).to.eq('success');

    // exitQueryOutput amountsOut will have a value for the BPT token if it is a pre-minted pool
    const amountsWithoutBpt = [...exitQueryOutput.amountsOut].filter(
        (t) => t.token.address !== poolStateInput.address,
    );

    // Matching order of getTokens helper: [poolTokens, BPT, native]
    const expectedDeltas = [
        ...amountsWithoutBpt.map((a) => a.amount),
        exitQueryOutput.bptIn.amount,
        0n,
    ];

    // If input is exit with native we must replace it with 0 and update native value instead
    if (exitInput.exitWithNativeAsset) {
        const index = amountsWithoutBpt.findIndex(
            (a) => a.token.address === zeroAddress,
        );
        expectedDeltas[expectedDeltas.length - 1] = expectedDeltas[index];
        expectedDeltas[index] = 0n;
    }

    expect(txOutput.balanceDeltas).to.deep.eq(expectedDeltas);
}

function assertExitBuildOutput(
    exitQueryOutput: ExitQueryOutput,
    exitBuildOutput: ExitBuildOutput,
    isExactIn: boolean,
    slippage: Slippage,
) {
    // if exactIn minAmountsOut should use amountsOut with slippage applied, else should use same amountsOut as input
    const minAmountsOut = isExactIn
        ? exitQueryOutput.amountsOut.map((a) => slippage.removeFrom(a.amount))
        : exitQueryOutput.amountsOut.map((a) => a.amount);

    // if exactIn slippage cannot be applied to bptIn, else should use bptIn with slippage applied
    const maxBptIn = isExactIn
        ? exitQueryOutput.bptIn.amount
        : slippage.applyTo(exitQueryOutput.bptIn.amount);

    const expectedBuildOutput: Omit<ExitBuildOutput, 'call'> = {
        minAmountsOut,
        maxBptIn,
        to: BALANCER_VAULT,
        // Value should always be 0 for exits
        value: 0n,
    };

    // rome-ignore lint/correctness/noUnusedVariables: <explanation>
    const { call, ...buildCheck } = exitBuildOutput;
    expect(buildCheck).to.deep.eq(expectedBuildOutput);
}
