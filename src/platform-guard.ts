import { BigInt, Bytes, Address, log } from "@graphprotocol/graph-ts";
import {
  ExchangeFrom as ExchangeFromEvent,
  ExchangeTo as ExchangeToEvent,
  AddLiquidity as AddLiquidityEvent,
  RemoveLiquidity as RemoveLiquidityEvent,
  UnwrapNativeToken as UnwrapNativeTokenEvent,
  VertexDeposit as VertexDepositEvent,
  VertexSlowMode as VertexSlowModeEvent,
} from "../generated/templates/PlatformGuard/IPlatformGuard";

import {
  ContractCall,
} from "../generated/schema";

// Helper function to update ContractCall with transaction type
function updateContractCallType(txHash: Bytes, transactionType: string): void {
  // Try to find existing ContractCall in same transaction
  // Since we don't know the exact logIndex, we'll search by transaction hash pattern
  let contractCallId = txHash.concatI32(0); // Try common log indices
  let contractCall = ContractCall.load(contractCallId);
  
  if (!contractCall) {
    contractCallId = txHash.concatI32(1);
    contractCall = ContractCall.load(contractCallId);
  }
  
  if (!contractCall) {
    contractCallId = txHash.concatI32(2);
    contractCall = ContractCall.load(contractCallId);
  }
  
  if (contractCall) {
    contractCall.transactionType = transactionType;
    contractCall.save();
    log.info("Updated ContractCall {} with type: {}", [contractCallId.toHexString(), transactionType]);
  } else {
    log.warning("Could not find ContractCall to update for tx: {}", [txHash.toHexString()]);
  }
}

// DEX activities
export function handleExchangeFrom(event: ExchangeFromEvent): void {
  log.info("Handling ExchangeFrom event for vault: {}", [event.params.vault.toHexString()]);
  updateContractCallType(event.transaction.hash, "Exchange");
}

export function handleExchangeTo(event: ExchangeToEvent): void {
  log.info("Handling ExchangeTo event for vault: {}", [event.params.vault.toHexString()]);
  updateContractCallType(event.transaction.hash, "Exchange");
}

export function handleAddLiquidity(event: AddLiquidityEvent): void {
  log.info("Handling AddLiquidity event for vault: {}", [event.params.vault.toHexString()]);
  updateContractCallType(event.transaction.hash, "AddLiquidity");
}

export function handleRemoveLiquidity(event: RemoveLiquidityEvent): void {
  log.info("Handling RemoveLiquidity event for vault: {}", [event.params.vault.toHexString()]);
  updateContractCallType(event.transaction.hash, "RemoveLiquidity");
}

// Other platform activities
export function handleUnwrapNativeToken(event: UnwrapNativeTokenEvent): void {
  log.info("Handling UnwrapNativeToken event for vault: {}", [event.params.vault.toHexString()]);
  updateContractCallType(event.transaction.hash, "UnwrapNativeToken");
}

export function handleVertexDeposit(event: VertexDepositEvent): void {
  log.info("Handling VertexDeposit event for vault: {}", [event.params.vault.toHexString()]);
  updateContractCallType(event.transaction.hash, "Stake"); // Vertex deposits are staking operations
}

export function handleVertexSlowMode(event: VertexSlowModeEvent): void {
  log.info("Handling VertexSlowMode event for vault: {}", [event.params.vault.toHexString()]);
  updateContractCallType(event.transaction.hash, "NotUsed"); // Special vertex operation
} 