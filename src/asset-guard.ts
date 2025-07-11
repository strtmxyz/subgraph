import { BigInt, Bytes, Address, log } from "@graphprotocol/graph-ts";
import {
  ERC20Approval as ERC20ApprovalEvent,
  ERC721Approval as ERC721ApprovalEvent,
  WrapNativeToken as WrapNativeTokenEvent,
  UnwrapNativeToken as UnwrapNativeTokenEvent,
  Initialized as InitializedEvent,
} from "../generated/templates/AssetGuard/ERC20Guard";

import {
  ContractCall,
  ExternalTokenTransfer,
} from "../generated/schema";

export function handleERC20Approval(event: ERC20ApprovalEvent): void {
  log.info("Handling ERC20Approval event for vault: {} token: {} spender: {}", [
    event.params.vault.toHexString(),
    event.params.token.toHexString(),
    event.params.spender.toHexString()
  ]);

  // Create ContractCall event to track this approval
  let contractCall = new ContractCall(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  );
  contractCall.vault = event.params.vault;
  contractCall.target = event.params.token;
  contractCall.data = Bytes.empty();
  contractCall.value = BigInt.zero();
  contractCall.blockNumber = event.block.number;
  contractCall.blockTimestamp = event.block.timestamp;
  contractCall.transactionHash = event.transaction.hash;
  contractCall.save();

  // Create ExternalTokenTransfer event
  let externalTransfer = new ExternalTokenTransfer(
    event.transaction.hash.concatI32(event.logIndex.toI32()).concat(Bytes.fromUTF8("-approval"))
  );
  externalTransfer.vault = event.params.vault;
  externalTransfer.token = event.params.token;
  externalTransfer.transferType = "ERC20_APPROVAL";
  externalTransfer.amount = event.params.amount;
  externalTransfer.destination = event.params.spender;
  externalTransfer.blockNumber = event.block.number;
  externalTransfer.blockTimestamp = event.block.timestamp;
  externalTransfer.transactionHash = event.transaction.hash;
  externalTransfer.save();
}

export function handleERC721Approval(event: ERC721ApprovalEvent): void {
  log.info("Handling ERC721Approval event for vault: {} token: {} spender: {} tokenId: {}", [
    event.params.vault.toHexString(),
    event.params.token.toHexString(),
    event.params.spender.toHexString(),
    event.params.tokenId.toString()
  ]);

  // Create ContractCall event to track this NFT approval
  let contractCall = new ContractCall(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  );
  contractCall.vault = event.params.vault;
  contractCall.target = event.params.token;
  contractCall.data = Bytes.empty();
  contractCall.value = event.params.tokenId;
  contractCall.blockNumber = event.block.number;
  contractCall.blockTimestamp = event.block.timestamp;
  contractCall.transactionHash = event.transaction.hash;
  contractCall.save();

  // Create ExternalTokenTransfer event
  let externalTransfer = new ExternalTokenTransfer(
    event.transaction.hash.concatI32(event.logIndex.toI32()).concat(Bytes.fromUTF8("-nft-approval"))
  );
  externalTransfer.vault = event.params.vault;
  externalTransfer.token = event.params.token;
  externalTransfer.transferType = "ERC721_APPROVAL";
  externalTransfer.amount = event.params.tokenId;
  externalTransfer.destination = event.params.spender;
  externalTransfer.blockNumber = event.block.number;
  externalTransfer.blockTimestamp = event.block.timestamp;
  externalTransfer.transactionHash = event.transaction.hash;
  externalTransfer.save();
}

export function handleWrapNativeToken(event: WrapNativeTokenEvent): void {
  log.info("Handling WrapNativeToken event for vault: {} token: {} amount: {}", [
    event.params.vault.toHexString(),
    event.params.token.toHexString(),
    event.params.amount.toString()
  ]);

  // Create ContractCall event to track this wrapping
  let contractCall = new ContractCall(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  );
  contractCall.vault = event.params.vault;
  contractCall.target = event.params.token;
  contractCall.data = Bytes.empty();
  contractCall.value = event.params.amount;
  contractCall.blockNumber = event.block.number;
  contractCall.blockTimestamp = event.block.timestamp;
  contractCall.transactionHash = event.transaction.hash;
  contractCall.save();

  // Create ExternalTokenTransfer event
  let externalTransfer = new ExternalTokenTransfer(
    event.transaction.hash.concatI32(event.logIndex.toI32()).concat(Bytes.fromUTF8("-wrap"))
  );
  externalTransfer.vault = event.params.vault;
  externalTransfer.token = event.params.token;
  externalTransfer.transferType = "WRAP_NATIVE_TOKEN";
  externalTransfer.amount = event.params.amount;
  externalTransfer.destination = event.params.vault; // wrapped tokens go to vault
  externalTransfer.blockNumber = event.block.number;
  externalTransfer.blockTimestamp = event.block.timestamp;
  externalTransfer.transactionHash = event.transaction.hash;
  externalTransfer.save();
}

export function handleUnwrapNativeToken(event: UnwrapNativeTokenEvent): void {
  log.info("Handling UnwrapNativeToken event for vault: {} token: {} amount: {}", [
    event.params.vault.toHexString(),
    event.params.token.toHexString(),
    event.params.amount.toString()
  ]);

  // Create ContractCall event to track this unwrapping
  let contractCall = new ContractCall(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  );
  contractCall.vault = event.params.vault;
  contractCall.target = event.params.token;
  contractCall.data = Bytes.empty();
  contractCall.value = event.params.amount;
  contractCall.blockNumber = event.block.number;
  contractCall.blockTimestamp = event.block.timestamp;
  contractCall.transactionHash = event.transaction.hash;
  contractCall.save();

  // Create ExternalTokenTransfer event
  let externalTransfer = new ExternalTokenTransfer(
    event.transaction.hash.concatI32(event.logIndex.toI32()).concat(Bytes.fromUTF8("-unwrap"))
  );
  externalTransfer.vault = event.params.vault;
  externalTransfer.token = event.params.token;
  externalTransfer.transferType = "UNWRAP_NATIVE_TOKEN";
  externalTransfer.amount = event.params.amount;
  externalTransfer.destination = event.params.vault; // unwrapped tokens go to vault
  externalTransfer.blockNumber = event.block.number;
  externalTransfer.blockTimestamp = event.block.timestamp;
  externalTransfer.transactionHash = event.transaction.hash;
  externalTransfer.save();
}

export function handleInitialized(event: InitializedEvent): void {
  log.info("Handling Initialized event for ERC20Guard with version: {}", [event.params.version.toString()]);
  
  // Log the initialization but don't need to store as entity
  // This event is typically emitted once when the contract is initialized
} 