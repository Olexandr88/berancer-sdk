import { TokenAmount } from '../tokenAmount';
import { Slippage } from '../slippage';
import { Address } from '../../types';

export enum JoinKind {
    Init = 'Init',
    Unbalanced = 'Unbalanced',
    SingleAsset = 'SingleAsset',
    Proportional = 'Proportional',
}

// Returned from API and used as input
export type PoolState = {
    id: Address;
    address: Address;
    type: string;
    tokens: {
        address: Address;
        decimals: number;
        index: number;
    }[];
};

// This will be extended for each pools specific input requirements
export type BaseJoinInput = {
    chainId: number;
    rpcUrl?: string;
    joinWithNativeAsset?: boolean;
};

export type InitJoinInput = BaseJoinInput & {
    initAmountsIn: TokenAmount[];
    kind: JoinKind.Init;
};

export type UnbalancedJoinInput = BaseJoinInput & {
    amountsIn: TokenAmount[];
    kind: JoinKind.Unbalanced;
};

export type SingleAssetJoinInput = BaseJoinInput & {
    bptOut: TokenAmount;
    tokenIn: Address;
    kind: JoinKind.SingleAsset;
};

export type ProportionalJoinInput = BaseJoinInput & {
    bptOut: TokenAmount;
    kind: JoinKind.Proportional;
};

export type JoinInput =
    | InitJoinInput
    | UnbalancedJoinInput
    | SingleAssetJoinInput
    | ProportionalJoinInput;

// Returned from a join query
export type JoinQueryResult = {
    id: Address;
    joinKind: JoinKind;
    bptOut: TokenAmount;
    amountsIn: TokenAmount[];
    tokenInIndex?: number;
};

export type JoinCallInput = JoinQueryResult & {
    slippage: Slippage;
    sender: Address;
    recipient: Address;
};

export interface BaseJoin {
    query(input: JoinInput, poolState: PoolState): Promise<JoinQueryResult>;
    buildCall(input: JoinCallInput): {
        call: Address;
        to: Address;
        value: bigint | undefined;
        minBptOut: bigint;
        maxAmountsIn: bigint[];
    };
}
