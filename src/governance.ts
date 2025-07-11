import { BigInt, Bytes, Address, log } from "@graphprotocol/graph-ts";
import {
  AssetGuardSet as AssetGuardSetEvent,
  ContractGuardSet as ContractGuardSetEvent,
} from "../generated/Governance/Governance";

import {
  WhitelistedAsset,
} from "../generated/schema";

export function handleAssetGuardSet(event: AssetGuardSetEvent): void {
  log.info("Handling AssetGuardSet event for assetType: {}", [event.params.assetType.toString()]);
  
  // This event sets asset guards for specific token types
  // We can use this to track which assets have guards set
  // The actual asset whitelisting is handled in VaultFactory
}

export function handleContractGuardSet(event: ContractGuardSetEvent): void {
  log.info("Handling ContractGuardSet event for contract: {}", [event.params.extContract.toHexString()]);
  
  // This event sets contract guards for specific contracts
  // Log the guard being set but don't need to store as entity
} 