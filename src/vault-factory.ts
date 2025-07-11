import { BigInt, Bytes, Address, log } from "@graphprotocol/graph-ts";
import {
  VaultCreated as VaultCreatedEvent,
  VaultUpgraded as VaultUpgradedEvent,
  VaultImplementationUpdated as VaultImplementationUpdatedEvent,
  AssetWhitelisted as AssetWhitelistedEvent,
  AssetWhitelistedRemoved as AssetWhitelistedRemovedEvent,
  UnderlyingAssetAdded as UnderlyingAssetAddedEvent,
  UnderlyingAssetRemoved as UnderlyingAssetRemovedEvent,
  AdminAddressSet as AdminAddressSetEvent,
  TreasuryAddressSet as TreasuryAddressSetEvent,
  GovernanceAddressSet as GovernanceAddressSetEvent,
  SetAssetHandler as SetAssetHandlerEvent,
  SetVaultStorageVersion as SetVaultStorageVersionEvent,
  OwnershipTransferred as OwnershipTransferredEvent,
  Paused as PausedEvent,
  Unpaused as UnpausedEvent,
} from "../generated/VaultFactory/VaultFactory";

import {
  VaultFactory,
  Vault,
  WhitelistedAsset,
  UnderlyingAsset,
  VaultCreated,
  VaultUpgraded,
  AdminAddressSet,
  TreasuryAddressSet,
  GovernanceAddressSet,
  OwnershipTransferred,
  Paused,
  Unpaused,
} from "../generated/schema";

import { Vault as VaultTemplate } from "../generated/templates";

// Helper function to get or create VaultFactory
function getOrCreateVaultFactory(address: Address): VaultFactory {
  let factory = VaultFactory.load(address);
  if (!factory) {
    factory = new VaultFactory(address);
    factory.admin = Bytes.empty();
    factory.treasury = Bytes.empty();
    factory.governance = Bytes.empty();
    factory.assetHandler = Bytes.empty();
    factory.vaultStorageVersion = BigInt.zero();
    factory.totalVaults = BigInt.zero();
    factory.creationFee = BigInt.zero();
    factory.isPaused = false;
  }
  return factory;
}

// Core vault creation event
export function handleVaultCreated(event: VaultCreatedEvent): void {
  log.info("Handling VaultCreated event for vault: {}", [event.params.vault.toHexString()]);

  // Update factory
  let factory = getOrCreateVaultFactory(event.address);
  factory.totalVaults = factory.totalVaults.plus(BigInt.fromI32(1));
  factory.save();

  // Create vault entity
  let vault = new Vault(event.params.vault);
  vault.manager = event.params.manager;
  vault.underlyingAsset = event.params.underlyingAsset;
  vault.name = event.params.name;
  vault.symbol = event.params.symbol;
  vault.maxCapacity = event.params.maxCapacity;
  
  // Initialize state
  vault.totalAssets = BigInt.zero();
  vault.totalSupply = BigInt.zero();
  vault.sharePrice = BigInt.fromI32(1).times(BigInt.fromI32(10).pow(18)); // 1e18
  vault.aum = BigInt.zero(); // Assets Under Management starts at 0
  vault.currentEpoch = BigInt.zero();
  vault.state = "FUNDRAISING";
  
  // Oracle protection defaults
  vault.harvestCooldown = BigInt.zero();
  vault.maxPriceDeviationBps = BigInt.zero();
  vault.emergencyMode = false;
  
  // Status
  vault.isPaused = false;
  
  // Real-time tracking initialization
  vault.lastValueUpdate = event.block.timestamp;
  vault.valueUpdateCount = BigInt.zero();
  vault.lastContractCall = BigInt.zero();
  
  // Metadata
  vault.blockNumber = event.block.number;
  vault.blockTimestamp = event.block.timestamp;
  vault.transactionHash = event.transaction.hash;
  
  vault.save();

  // Create VaultCreated event
  let vaultCreatedEvent = new VaultCreated(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  );
  vaultCreatedEvent.vault = event.params.vault;
  vaultCreatedEvent.manager = event.params.manager;
  vaultCreatedEvent.underlyingAsset = event.params.underlyingAsset;
  vaultCreatedEvent.name = event.params.name;
  vaultCreatedEvent.symbol = event.params.symbol;
  vaultCreatedEvent.maxCapacity = event.params.maxCapacity;
  vaultCreatedEvent.blockNumber = event.block.number;
  vaultCreatedEvent.blockTimestamp = event.block.timestamp;
  vaultCreatedEvent.transactionHash = event.transaction.hash;
  vaultCreatedEvent.save();

  // Start indexing the new vault
  VaultTemplate.create(event.params.vault);
}

// Vault management
export function handleVaultUpgraded(event: VaultUpgradedEvent): void {
  log.info("Handling VaultUpgraded event for vault: {}", [event.params.vault.toHexString()]);

  // Create VaultUpgraded event
  let vaultUpgradedEvent = new VaultUpgraded(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  );
  vaultUpgradedEvent.vault = event.params.vault;
  vaultUpgradedEvent.newImplementation = event.params.newImplementation;
  vaultUpgradedEvent.blockNumber = event.block.number;
  vaultUpgradedEvent.blockTimestamp = event.block.timestamp;
  vaultUpgradedEvent.transactionHash = event.transaction.hash;
  vaultUpgradedEvent.save();
}

export function handleVaultImplementationUpdated(event: VaultImplementationUpdatedEvent): void {
  log.info("Handling VaultImplementationUpdated event", []);
  
  // Update factory
  let factory = getOrCreateVaultFactory(event.address);
  factory.save();
}

// Asset management
export function handleAssetWhitelisted(event: AssetWhitelistedEvent): void {
  log.info("Handling AssetWhitelisted event for asset: {}", [event.params.asset.toHexString()]);

  let assetId = event.params.asset;
  let whitelistedAsset = WhitelistedAsset.load(assetId);
  
  if (!whitelistedAsset) {
    whitelistedAsset = new WhitelistedAsset(assetId);
    whitelistedAsset.factory = event.address;
    whitelistedAsset.asset = event.params.asset;
    whitelistedAsset.addedAt = event.block.timestamp;
    whitelistedAsset.addedInBlock = event.block.number;
    whitelistedAsset.addedInTx = event.transaction.hash;
  }
  
  whitelistedAsset.tokenType = event.params.tokenType;
  whitelistedAsset.allowed = event.params.allowed;
  
  if (!event.params.allowed) {
    whitelistedAsset.removedAt = event.block.timestamp;
  }
  
  whitelistedAsset.save();
}

export function handleAssetWhitelistedRemoved(event: AssetWhitelistedRemovedEvent): void {
  log.info("Handling AssetWhitelistedRemoved event for asset: {}", [event.params.asset.toHexString()]);

  let assetId = event.params.asset;
  let whitelistedAsset = WhitelistedAsset.load(assetId);
  
  if (whitelistedAsset) {
    whitelistedAsset.allowed = false;
    whitelistedAsset.removedAt = event.block.timestamp;
    whitelistedAsset.save();
  }
}

export function handleUnderlyingAssetAdded(event: UnderlyingAssetAddedEvent): void {
  log.info("Handling UnderlyingAssetAdded event for asset: {}", [event.params.asset.toHexString()]);

  let assetId = event.params.asset;
  let underlyingAsset = new UnderlyingAsset(assetId);
  underlyingAsset.factory = event.address;
  underlyingAsset.asset = event.params.asset;
  underlyingAsset.tokenType = event.params.tokenType;
  underlyingAsset.isActive = true;
  underlyingAsset.addedAt = event.block.timestamp;
  underlyingAsset.addedInBlock = event.block.number;
  underlyingAsset.addedInTx = event.transaction.hash;
  underlyingAsset.save();
}

export function handleUnderlyingAssetRemoved(event: UnderlyingAssetRemovedEvent): void {
  log.info("Handling UnderlyingAssetRemoved event for asset: {}", [event.params.asset.toHexString()]);

  let assetId = event.params.asset;
  let underlyingAsset = UnderlyingAsset.load(assetId);
  
  if (underlyingAsset) {
    underlyingAsset.isActive = false;
    underlyingAsset.removedAt = event.block.timestamp;
    underlyingAsset.save();
  }
}

// Factory configuration
export function handleAdminAddressSet(event: AdminAddressSetEvent): void {
  log.info("Handling AdminAddressSet event", []);

  let factory = getOrCreateVaultFactory(event.address);
  factory.admin = event.params.adminAddress;
  factory.save();

  // Create event
  let adminEvent = new AdminAddressSet(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  );
  adminEvent.adminAddress = event.params.adminAddress;
  adminEvent.blockNumber = event.block.number;
  adminEvent.blockTimestamp = event.block.timestamp;
  adminEvent.transactionHash = event.transaction.hash;
  adminEvent.save();
}

export function handleTreasuryAddressSet(event: TreasuryAddressSetEvent): void {
  log.info("Handling TreasuryAddressSet event", []);

  let factory = getOrCreateVaultFactory(event.address);
  factory.treasury = event.params.treasuryAddress;
  factory.save();

  // Create event
  let treasuryEvent = new TreasuryAddressSet(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  );
  treasuryEvent.treasuryAddress = event.params.treasuryAddress;
  treasuryEvent.blockNumber = event.block.number;
  treasuryEvent.blockTimestamp = event.block.timestamp;
  treasuryEvent.transactionHash = event.transaction.hash;
  treasuryEvent.save();
}

export function handleGovernanceAddressSet(event: GovernanceAddressSetEvent): void {
  log.info("Handling GovernanceAddressSet event", []);

  let factory = getOrCreateVaultFactory(event.address);
  factory.governance = event.params.governanceAddress;
  factory.save();

  // Create event
  let governanceEvent = new GovernanceAddressSet(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  );
  governanceEvent.governanceAddress = event.params.governanceAddress;
  governanceEvent.blockNumber = event.block.number;
  governanceEvent.blockTimestamp = event.block.timestamp;
  governanceEvent.transactionHash = event.transaction.hash;
  governanceEvent.save();
}

export function handleSetAssetHandler(event: SetAssetHandlerEvent): void {
  log.info("Handling SetAssetHandler event", []);

  let factory = getOrCreateVaultFactory(event.address);
  factory.assetHandler = event.params.assetHandler;
  factory.save();
}

export function handleSetVaultStorageVersion(event: SetVaultStorageVersionEvent): void {
  log.info("Handling SetVaultStorageVersion event", []);

  let factory = getOrCreateVaultFactory(event.address);
  factory.vaultStorageVersion = event.params.version;
  factory.save();
}

// Access control
export function handleOwnershipTransferred(event: OwnershipTransferredEvent): void {
  log.info("Handling OwnershipTransferred event", []);

  // Create event
  let ownershipEvent = new OwnershipTransferred(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  );
  ownershipEvent.previousOwner = event.params.previousOwner;
  ownershipEvent.newOwner = event.params.newOwner;
  ownershipEvent.blockNumber = event.block.number;
  ownershipEvent.blockTimestamp = event.block.timestamp;
  ownershipEvent.transactionHash = event.transaction.hash;
  ownershipEvent.save();
}

export function handlePaused(event: PausedEvent): void {
  log.info("Handling Paused event", []);

  let factory = getOrCreateVaultFactory(event.address);
  factory.isPaused = true;
  factory.save();

  // Create event
  let pausedEvent = new Paused(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  );
  pausedEvent.account = event.params.account;
  pausedEvent.blockNumber = event.block.number;
  pausedEvent.blockTimestamp = event.block.timestamp;
  pausedEvent.transactionHash = event.transaction.hash;
  pausedEvent.save();
}

export function handleUnpaused(event: UnpausedEvent): void {
  log.info("Handling Unpaused event", []);

  let factory = getOrCreateVaultFactory(event.address);
  factory.isPaused = false;
  factory.save();

  // Create event
  let unpausedEvent = new Unpaused(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  );
  unpausedEvent.account = event.params.account;
  unpausedEvent.blockNumber = event.block.number;
  unpausedEvent.blockTimestamp = event.block.timestamp;
  unpausedEvent.transactionHash = event.transaction.hash;
  unpausedEvent.save();
} 