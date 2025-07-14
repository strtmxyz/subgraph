import { BigInt, Bytes, Address, log } from "@graphprotocol/graph-ts";
import {
  AssetGuardSet as AssetGuardSetEvent,
  ContractGuardSet as ContractGuardSetEvent,
} from "../generated/Governance/Governance";

import {
  WhitelistedAsset,
} from "../generated/schema";

// Import templates for asset guards
import { AssetGuard as AssetGuardTemplate } from "../generated/templates";
// Note: ETHGuard template will be available after subgraph is generated with the updated template

export function handleAssetGuardSet(event: AssetGuardSetEvent): void {
  log.info("Handling AssetGuardSet event for assetType: {}", [event.params.assetType.toString()]);
  
  // This event sets asset guards for specific token types
  // Create data source templates for the new guard addresses
  let guardAddress = event.params.guardAddress;
  let assetType = event.params.assetType;
  
  if (guardAddress.notEqual(Address.zero())) {
    // For now, we're using AssetGuardTemplate for all guard types
    // After deployment and code generation, ETHGuard template will be available
    log.info("Creating AssetGuard template for guard address: {} (assetType: {})", 
      [guardAddress.toHexString(), assetType.toString()]);
    AssetGuardTemplate.create(guardAddress);
  }
  
  // We can use this to track which assets have guards set
  // The actual asset whitelisting is handled in VaultFactory
}

export function handleContractGuardSet(event: ContractGuardSetEvent): void {
  log.info("Handling ContractGuardSet event for contract: {}", [event.params.extContract.toHexString()]);
  
  // This event sets contract guards for specific contracts
  // Log the guard being set but don't need to store as entity
} 