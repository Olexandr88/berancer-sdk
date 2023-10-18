import { Address, Hex } from '../../types';
import { Slippage } from '../slippage';
import { Token } from '../token';
import { TokenAmount } from '../tokenAmount';

export type NestedExitInput = {
    bptAmountIn: bigint;
    chainId: number;
    rpcUrl: string;
    accountAddress: Address;
    tokenOut?: Address;
    useNativeAssetAsWrappedAmountOut?: boolean;
    toInternalBalance?: boolean;
};

export type NestedExitCall = {
    chainId: number;
    useNativeAssetAsWrappedAmountOut: boolean;
    sortedTokens: Token[];
    poolId: Address;
    poolType: string;
    kind: number;
    sender: Address;
    recipient: Address;
    bptAmountIn: {
        amount: bigint;
        isRef: boolean;
    };
    minAmountsOut: bigint[];
    toInternalBalance: boolean;
    outputReferenceKeys: bigint[];
    tokenOutIndex?: number;
};

export type NestedExitQueryResult = {
    calls: NestedExitCall[];
    bptAmountIn: TokenAmount;
    amountsOut: TokenAmount[];
};

export type NestedExitCallInput = NestedExitQueryResult & {
    chainId: number;
    slippage: Slippage;
    sender: Address;
    recipient: Address;
    relayerApprovalSignature?: Hex;
};
