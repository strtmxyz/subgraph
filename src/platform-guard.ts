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
function updateContractCallType(txHash: Bytes, transactionType: string, value: BigInt = BigInt.zero()): void {
  // Try to find existing ContractCall in same transaction by searching multiple logIndex values
  // Since platform events typically come after contract calls, we'll search a range of indices
  let contractCall: ContractCall | null = null;
  
  // Search through a wider range of potential logIndex values (0 to 9)
  for (let i = 0; i < 10; i++) {
    let candidateId = txHash.concatI32(i);
    let candidateCall = ContractCall.load(candidateId);
    
    if (candidateCall) {
      contractCall = candidateCall;
      break;
    }
  }
  
  if (contractCall) {
    contractCall.transactionType = transactionType;
    
    // Update value if provided and current value is zero
    if (value.gt(BigInt.zero()) && contractCall.value.equals(BigInt.zero())) {
      contractCall.value = value;
      log.info("Updated ContractCall {} value to: {}", [
        contractCall.id.toHexString(), 
        value.toString()
      ]);
    }
    
    contractCall.save();
    log.info("Updated ContractCall {} with type: {}", [contractCall.id.toHexString(), transactionType]);
  } else {
    // If we still can't find it, try to create a synthetic record
    log.warning("Could not find ContractCall to update for tx: {}", [txHash.toHexString()]);
  }
}

// DEX activities
export function handleExchangeFrom(event: ExchangeFromEvent): void {
  log.info("Handling ExchangeFrom event for vault: {}", [event.params.vault.toHexString()]);
  
  // Pass sourceAmount from the event
  updateContractCallType(event.transaction.hash, "Exchange", event.params.sourceAmount);
}

export function handleExchangeTo(event: ExchangeToEvent): void {
  log.info("Handling ExchangeTo event for vault: {}", [event.params.vault.toHexString()]);
  
  // Pass dstAmount from the event
  updateContractCallType(event.transaction.hash, "Exchange", event.params.dstAmount);
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
  
  // Pass amountMinimum from the event
  updateContractCallType(event.transaction.hash, "UnwrapNativeToken", event.params.amountMinimum);
}

export function handleVertexDeposit(event: VertexDepositEvent): void {
  log.info("Handling VertexDeposit event for vault: {}", [event.params.vault.toHexString()]);
  
  // Pass amount from Vertex deposit
  updateContractCallType(event.transaction.hash, "Stake", event.params.amount); 
}

export function handleVertexSlowMode(event: VertexSlowModeEvent): void {
  log.info("Handling VertexSlowMode event for vault: {}", [event.params.vault.toHexString()]);
  updateContractCallType(event.transaction.hash, "NotUsed");
}