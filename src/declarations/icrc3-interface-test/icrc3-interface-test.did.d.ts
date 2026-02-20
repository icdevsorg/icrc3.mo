import type { Principal } from '@dfinity/principal';
import type { ActorMethod } from '@dfinity/agent';
import type { IDL } from '@dfinity/candid';

export interface Account {
  'owner' : Principal,
  'subaccount' : [] | [Uint8Array | number[]],
}
export interface Approve {
  'fee' : [] | [bigint],
  'from' : Account,
  'memo' : [] | [Uint8Array | number[]],
  'created_at_time' : [] | [bigint],
  'amount' : bigint,
  'expected_allowance' : [] | [bigint],
  'expires_at' : [] | [bigint],
  'spender' : Account,
}
export interface ArchivedTransactionResponse {
  'args' : Array<TransactionRange>,
  'callback' : [Principal, string],
}
export interface BlockType { 'url' : string, 'block_type' : string }
export interface Burn {
  'from' : Account,
  'memo' : [] | [Uint8Array | number[]],
  'created_at_time' : [] | [bigint],
  'amount' : bigint,
  'spender' : [] | [Account],
}
export interface DataCertificate {
  'certificate' : Uint8Array | number[],
  'hash_tree' : Uint8Array | number[],
}
export interface GetArchiveTransactionsResponse {
  'transactions' : Array<Transaction>,
}
export interface GetArchivesArgs { 'from' : [] | [Principal] }
export type GetArchivesResult = Array<GetArchivesResultItem>;
export interface GetArchivesResultItem {
  'end' : bigint,
  'canister_id' : Principal,
  'start' : bigint,
}
export type GetBlocksArgs = Array<TransactionRange>;
export interface GetBlocksRequest { 'start' : bigint, 'length' : bigint }
export interface GetBlocksResult {
  'log_length' : bigint,
  'blocks' : Array<{ 'id' : bigint, 'block' : Value }>,
  'archived_blocks' : Array<ArchivedTransactionResponse>,
}
export type GetLegacyArchiveTransactionFunction = ActorMethod<
  [GetBlocksRequest],
  GetArchiveTransactionsResponse
>;
export type GetTransactionsFn = ActorMethod<
  [Array<TransactionRange>],
  GetTransactionsResult
>;
export interface GetTransactionsResponse {
  'first_index' : bigint,
  'log_length' : bigint,
  'transactions' : Array<Transaction>,
  'archived_transactions' : Array<LegacyArchivedRange>,
}
export interface GetTransactionsResult {
  'log_length' : bigint,
  'blocks' : Array<{ 'id' : bigint, 'block' : Value }>,
  'archived_blocks' : Array<ArchivedTransactionResponse>,
}
export type IndexType = { 'Stable' : null } |
  { 'StableTyped' : null } |
  { 'Managed' : null };
export interface InitArgs {
  'maxRecordsToArchive' : bigint,
  'archiveIndexType' : IndexType,
  'maxArchivePages' : bigint,
  'settleToRecords' : bigint,
  'archiveCycles' : bigint,
  'maxActiveRecords' : bigint,
  'maxRecordsInArchiveInstance' : bigint,
  'archiveControllers' : [] | [[] | [Array<Principal>]],
  'supportedBlocks' : Array<BlockType>,
}
export interface InterfaceTestToken {
  'archives' : ActorMethod<
    [],
    Array<
      {
        'block_range_end' : bigint,
        'canister_id' : Principal,
        'block_range_start' : bigint,
      }
    >
  >,
  'enableMockGetBlocksHook' : ActorMethod<[], undefined>,
  'get_blocks' : ActorMethod<
    [{ 'start' : bigint, 'length' : bigint }],
    RosettaGetBlocksResponse
  >,
  'get_tip' : ActorMethod<[], Tip>,
  'get_transactions' : ActorMethod<
    [{ 'start' : bigint, 'length' : bigint }],
    GetTransactionsResponse
  >,
  'icrc3_get_archives' : ActorMethod<[GetArchivesArgs], GetArchivesResult>,
  'icrc3_get_blocks' : ActorMethod<[GetBlocksArgs], GetBlocksResult>,
  'icrc3_get_tip_certificate' : ActorMethod<[], [] | [DataCertificate]>,
  'icrc3_supported_block_types' : ActorMethod<[], Array<BlockType>>,
  'removeAllHooks' : ActorMethod<[], undefined>,
}
export interface LegacyArchivedRange {
  'callback' : [Principal, string],
  'start' : bigint,
  'length' : bigint,
}
export type Map = Array<[string, Value__1]>;
export interface Mint {
  'to' : Account,
  'memo' : [] | [Uint8Array | number[]],
  'created_at_time' : [] | [bigint],
  'amount' : bigint,
}
export interface RosettaArchivedRange {
  'callback' : [Principal, string],
  'start' : bigint,
  'length' : bigint,
}
export interface RosettaBlockRange { 'blocks' : Array<Value__1> }
export interface RosettaGetBlocksResponse {
  'certificate' : [] | [Uint8Array | number[]],
  'first_index' : bigint,
  'blocks' : Array<Value__1>,
  'chain_length' : bigint,
  'archived_blocks' : Array<RosettaArchivedRange>,
}
export interface Tip {
  'last_block_index' : Uint8Array | number[],
  'hash_tree' : Uint8Array | number[],
  'last_block_hash' : Uint8Array | number[],
}
export interface Transaction {
  'burn' : [] | [Burn],
  'kind' : string,
  'mint' : [] | [Mint],
  'approve' : [] | [Approve],
  'timestamp' : bigint,
  'transfer' : [] | [Transfer],
}
export interface TransactionRange { 'start' : bigint, 'length' : bigint }
export interface Transfer {
  'to' : Account,
  'fee' : [] | [bigint],
  'from' : Account,
  'memo' : [] | [Uint8Array | number[]],
  'created_at_time' : [] | [bigint],
  'amount' : bigint,
  'spender' : [] | [Account],
}
export type Value = { 'Int' : bigint } |
  { 'Map' : Array<[string, Value]> } |
  { 'Nat' : bigint } |
  { 'Blob' : Uint8Array | number[] } |
  { 'Text' : string } |
  { 'Array' : Array<Value> };
export type Value__1 = { 'Int' : bigint } |
  { 'Map' : Map } |
  { 'Nat' : bigint } |
  { 'Nat64' : bigint } |
  { 'Blob' : Uint8Array | number[] } |
  { 'Text' : string } |
  { 'Array' : Array<Value__1> };
export interface _SERVICE extends InterfaceTestToken {}
export declare const idlFactory: IDL.InterfaceFactory;
export declare const init: (args: { IDL: typeof IDL }) => IDL.Type[];
