import { BigInt, Bytes, Address, log } from "@graphprotocol/graph-ts";
import {
  StateChanged as StateChangedEvent,
  EpochAdvanced as EpochAdvancedEvent,
  Deposit as DepositEvent,
  Withdraw as WithdrawEvent,
  Deposited as DepositedEvent,
  Withdrawn as WithdrawnEvent,
  ContractCalled as ContractCalledEvent,
  AutoRealizationTriggered as AutoRealizationTriggeredEvent,
  OracleProtectionUpdated as OracleProtectionUpdatedEvent,
  EmergencyOracleModeActivated as EmergencyOracleModeActivatedEvent,
  HarvestBlocked as HarvestBlockedEvent,
  OwnershipTransferred as OwnershipTransferredEvent,
  Paused as PausedEvent,
  Unpaused as UnpausedEvent,
  Transfer as TransferEvent,
  Approval as ApprovalEvent,
  YieldHarvested as YieldHarvestedEvent,
} from "../generated/templates/Vault/Vault";

import {
  Vault,
  User,
  VaultUser,
  Deposit,
  Withdrawal,
  EpochChange,
  StateChange,
  ContractCall,
  AutoRealization,
  VaultValueChange,
  DailyVaultStat,
  DailyProtocolStat,
  YieldHarvested,
  ExternalTokenTransfer,
  VaultFactory,
  ProtocolMetrics,
  ProtocolConstants,
} from "../generated/schema";

import { Vault as VaultContract } from "../generated/templates/Vault/Vault";
import { FACTORY_ADDRESS } from "./constants";

// Helper functions
function getOrCreateUser(address: Address): User {
  let user = User.load(address);
  let isNewUser = false;
  
  if (!user) {
    user = new User(address);
    user.totalDeposited = BigInt.zero();
    user.totalWithdrawn = BigInt.zero();
    user.vaultCount = BigInt.zero();
    user.firstDepositAt = BigInt.zero();
    user.lastActivityAt = BigInt.zero();
    isNewUser = true;
  }
  
  // Update protocol metrics for new users
  if (isNewUser) {
    let protocolMetrics = getOrCreateProtocolMetrics();
    protocolMetrics.totalUsers = protocolMetrics.totalUsers.plus(BigInt.fromI32(1));
    protocolMetrics.save();
  }
  
  return user;
}

function getOrCreateVaultUser(vaultAddress: Address, userAddress: Address): VaultUser {
  let id = vaultAddress.toHexString() + "-" + userAddress.toHexString();
  let vaultUser = VaultUser.load(id);
  
  if (!vaultUser) {
    vaultUser = new VaultUser(id);
    vaultUser.vault = vaultAddress;
    vaultUser.user = userAddress;
    vaultUser.shares = BigInt.zero();
    vaultUser.totalDeposited = BigInt.zero();
    vaultUser.totalWithdrawn = BigInt.zero();
    vaultUser.isActive = false;
    vaultUser.firstDepositAt = BigInt.zero();
    vaultUser.lastActivityAt = BigInt.zero();
  }
  
  return vaultUser;
}

function getVaultStateString(state: i32): string {
  if (state == 0) return "FUNDRAISING";
  if (state == 1) return "ACTIVE";
  if (state == 2) return "LOCKED";
  if (state == 3) return "LIQUIDATED";
  if (state == 4) return "CLOSED";
  return "UNKNOWN";
}

// Helper function to create VaultValueChange entity
function createVaultValueChange(
  vault: Vault, 
  oldTotalAssets: BigInt, 
  oldTotalSupply: BigInt, 
  oldSharePrice: BigInt, 
  oldAum: BigInt,
  oldTotalValueUSD: BigInt,
  changeType: string,
  triggerEvent: string,
  blockNumber: BigInt,
  blockTimestamp: BigInt,
  transactionHash: Bytes,
  logIndex: i32
): void {
  let valueChange = new VaultValueChange(
    transactionHash.concatI32(logIndex)
  );
  
  valueChange.vault = vault.id;
  valueChange.oldTotalAssets = oldTotalAssets;
  valueChange.newTotalAssets = vault.totalAssets;
  valueChange.oldTotalSupply = oldTotalSupply;
  valueChange.newTotalSupply = vault.totalSupply;
  valueChange.oldSharePrice = oldSharePrice;
  valueChange.newSharePrice = vault.sharePrice;
  valueChange.oldAum = oldAum;
  valueChange.newAum = vault.aum;
  valueChange.oldTotalValueUSD = oldTotalValueUSD;
  valueChange.newTotalValueUSD = vault.totalValueUSD;
  valueChange.changeType = changeType;
  valueChange.triggerEvent = triggerEvent;
  valueChange.blockNumber = blockNumber;
  valueChange.blockTimestamp = blockTimestamp;
  valueChange.transactionHash = transactionHash;
  
  valueChange.save();
}

// Enhanced AUM calculation with real-time contract calls
function calculateAndUpdateAUM(vault: Vault, changeType: string = "MANUAL_SYNC", triggerEvent: string = "manual", blockNumber: BigInt = BigInt.zero(), blockTimestamp: BigInt = BigInt.zero(), transactionHash: Bytes = Bytes.empty(), logIndex: i32 = 0): void {
  // Store old values
  let oldTotalAssets = vault.totalAssets;
  let oldTotalSupply = vault.totalSupply;
  let oldSharePrice = vault.sharePrice;
  let oldAum = vault.aum;
  let oldTotalValueUSD = vault.totalValueUSD;
  
  // Try to get real-time data from contract
  let vaultContract = VaultContract.bind(Address.fromBytes(vault.id));
  let totalAssetsCall = vaultContract.try_totalAssets();
  let totalSupplyCall = vaultContract.try_totalSupply();
  let vaultInfoCall = vaultContract.try_getVaultInfo();
  
  // Get fee configuration
  let managerFeeCall = vaultContract.try_managerFee();
  let withdrawalFeeCall = vaultContract.try_withdrawalFee();
  
  if (!totalAssetsCall.reverted) {
    vault.totalAssets = totalAssetsCall.value;
    log.info("Updated totalAssets from contract call: {}", [totalAssetsCall.value.toString()]);
  }
  
  if (!totalSupplyCall.reverted) {
    vault.totalSupply = totalSupplyCall.value;
    log.info("Updated totalSupply from contract call: {}", [totalSupplyCall.value.toString()]);
  }
  
  // Get USD value from getVaultInfo
  if (!vaultInfoCall.reverted) {
    let totalValueUSD = vaultInfoCall.value.getTotalValueUSD();
    log.info("Updated totalValueUSD from getVaultInfo: {}", [totalValueUSD.toString()]);
    
    // Store USD value separately
    vault.totalValueUSD = totalValueUSD;
    
    // AUM = Total Value in USD (real-time USD value)
    vault.aum = totalValueUSD;
  } else {
    // Fallback to totalAssets if getVaultInfo fails
    vault.aum = vault.totalAssets;
    vault.totalValueUSD = BigInt.zero(); // Set to zero if not available
    log.warning("getVaultInfo failed, using totalAssets as fallback for vault: {}", [vault.id.toHexString()]);
  }
  
  // Calculate real-time share price
  if (vault.totalSupply.gt(BigInt.zero())) {
    vault.sharePrice = vault.totalAssets.times(BigInt.fromI32(10).pow(18)).div(vault.totalSupply);
  } else {
    vault.sharePrice = BigInt.fromI32(1).times(BigInt.fromI32(10).pow(18)); // Default 1e18
  }
  
  // Update fee configuration only if not already set (fees don't change per epoch)
  if (vault.managerFee.equals(BigInt.zero()) && !managerFeeCall.reverted) {
    vault.managerFee = BigInt.fromI32(managerFeeCall.value);
    log.info("Initialized managerFee: {}", [vault.managerFee.toString()]);
  }
  
  if (vault.withdrawalFee.equals(BigInt.zero()) && !withdrawalFeeCall.reverted) {
    vault.withdrawalFee = BigInt.fromI32(withdrawalFeeCall.value);
    log.info("Initialized withdrawalFee: {}", [vault.withdrawalFee.toString()]);
  }
  
  // Update tracking fields
  vault.lastValueUpdate = blockTimestamp;
  vault.valueUpdateCount = vault.valueUpdateCount.plus(BigInt.fromI32(1));
  
  log.info("Updated vault metrics - totalAssets: {}, totalSupply: {}, sharePrice: {}, aum: {}, totalValueUSD: {}", [
    vault.totalAssets.toString(),
    vault.totalSupply.toString(),
    vault.sharePrice.toString(),
    vault.aum.toString(),
    vault.totalValueUSD.toString()
  ]);
  
  // Create value change record if values actually changed
  if (!oldTotalAssets.equals(vault.totalAssets) || 
      !oldTotalSupply.equals(vault.totalSupply) || 
      !oldSharePrice.equals(vault.sharePrice) || 
      !oldAum.equals(vault.aum) ||
      !oldTotalValueUSD.equals(vault.totalValueUSD)) {
    createVaultValueChange(
      vault, 
      oldTotalAssets, 
      oldTotalSupply, 
      oldSharePrice, 
      oldAum,
      oldTotalValueUSD,
      changeType,
      triggerEvent,
      blockNumber,
      blockTimestamp,
      transactionHash,
      logIndex
    );
    
    // Update protocol metrics when AUM changes
    updateProtocolMetrics(vault.id, oldAum, vault.aum);
  }
}

// Enhanced daily stats update with real-time data
function updateDailyStats(vaultAddress: Address, timestamp: BigInt, depositAmount: BigInt, withdrawAmount: BigInt): void {
  // Round timestamp to day
  let day = timestamp.toI32() / 86400 * 86400;
  let dayId = vaultAddress.toHexString() + "-" + day.toString();
  
  let dailyStat = DailyVaultStat.load(dayId);
  if (!dailyStat) {
    dailyStat = new DailyVaultStat(dayId);
    dailyStat.vault = vaultAddress;
    dailyStat.date = day;
    dailyStat.dailyDeposits = BigInt.zero();
    dailyStat.dailyWithdrawals = BigInt.zero();
    dailyStat.dailyVolume = BigInt.zero();
    dailyStat.totalAssets = BigInt.zero();
    dailyStat.sharePrice = BigInt.zero();
    dailyStat.totalSupply = BigInt.zero();
    dailyStat.activeUsers = BigInt.zero();
    dailyStat.newUsers = BigInt.zero();
  }
  
  dailyStat.dailyDeposits = dailyStat.dailyDeposits.plus(depositAmount);
  dailyStat.dailyWithdrawals = dailyStat.dailyWithdrawals.plus(withdrawAmount);
  dailyStat.dailyVolume = dailyStat.dailyVolume.plus(depositAmount).plus(withdrawAmount);
  
  // Update vault data with real-time values
  let vault = Vault.load(vaultAddress);
  if (vault) {
    // Force refresh vault data (manual sync for daily stats)
    calculateAndUpdateAUM(vault, "MANUAL_SYNC", "DailyStatsUpdate", BigInt.zero(), timestamp, Bytes.empty(), 0);
    
    dailyStat.totalAssets = vault.totalAssets;
    dailyStat.sharePrice = vault.sharePrice;
    dailyStat.totalSupply = vault.totalSupply;
    
    vault.save();
  }
  
  dailyStat.save();
  
  // Update protocol stats
  updateProtocolStats(timestamp, depositAmount, withdrawAmount);
}

// Protocol-level daily stats update
function updateProtocolStats(timestamp: BigInt, depositAmount: BigInt, withdrawAmount: BigInt): void {
  // Round timestamp to day
  let day = timestamp.toI32() / 86400 * 86400;
  let dayId = day.toString();
  
  let protocolStat = DailyProtocolStat.load(dayId);
  if (!protocolStat) {
    protocolStat = new DailyProtocolStat(dayId);
    protocolStat.date = day;
    protocolStat.totalValueLocked = BigInt.zero();
    protocolStat.totalVaults = BigInt.zero();
    protocolStat.activeVaults = BigInt.zero();
    protocolStat.dailyVolume = BigInt.zero();
    protocolStat.dailyDeposits = BigInt.zero();
    protocolStat.dailyWithdrawals = BigInt.zero();
    protocolStat.totalUsers = BigInt.zero();
    protocolStat.activeUsers = BigInt.zero();
    protocolStat.newUsers = BigInt.zero();
  }
  
  // Update volume metrics
  protocolStat.dailyDeposits = protocolStat.dailyDeposits.plus(depositAmount);
  protocolStat.dailyWithdrawals = protocolStat.dailyWithdrawals.plus(withdrawAmount);
  protocolStat.dailyVolume = protocolStat.dailyVolume.plus(depositAmount).plus(withdrawAmount);
  
  // Calculate protocol-level metrics
  calculateProtocolMetrics(protocolStat);
  
  protocolStat.save();
}

// Get or create protocol metrics entity
function getOrCreateProtocolMetrics(): ProtocolMetrics {
  let metrics = ProtocolMetrics.load("protocol");
  if (!metrics) {
    metrics = new ProtocolMetrics("protocol");
    metrics.totalValueLocked = BigInt.zero();
    metrics.totalVaults = BigInt.zero();
    metrics.activeVaults = BigInt.zero();
    metrics.totalUsers = BigInt.zero();
    metrics.lastUpdate = BigInt.zero();
  }
  return metrics;
}

// Helper function to get or create ProtocolConstants
function getOrCreateProtocolConstants(): ProtocolConstants {
  let constants = ProtocolConstants.load("constants");
  if (!constants) {
    constants = new ProtocolConstants("constants");
    constants.protocolManagementFee = BigInt.zero();
    constants.protocolPerformanceFee = BigInt.zero();
    constants.managerPerformanceFee = BigInt.zero();
    constants.maxManagerFee = BigInt.zero();
    constants.maxWithdrawalFee = BigInt.zero();
    constants.feeDenominator = BigInt.zero();
    constants.lastUpdate = BigInt.zero();
  }
  return constants;
}

// Function to update vault fees (only called when fees actually change)
function updateVaultFees(vault: Vault, vaultContract: VaultContract): void {
  let managerFeeCall = vaultContract.try_managerFee();
  let withdrawalFeeCall = vaultContract.try_withdrawalFee();
  
  if (!managerFeeCall.reverted) {
    let newManagerFee = BigInt.fromI32(managerFeeCall.value);
    if (!vault.managerFee.equals(newManagerFee)) {
      vault.managerFee = newManagerFee;
      log.info("Updated managerFee for vault {}: {}", [vault.id.toHexString(), vault.managerFee.toString()]);
    }
  }
  
  if (!withdrawalFeeCall.reverted) {
    let newWithdrawalFee = BigInt.fromI32(withdrawalFeeCall.value);
    if (!vault.withdrawalFee.equals(newWithdrawalFee)) {
      vault.withdrawalFee = newWithdrawalFee;
      log.info("Updated withdrawalFee for vault {}: {}", [vault.id.toHexString(), vault.withdrawalFee.toString()]);
    }
  }
}

// Function to update protocol constants (fixed fees, only called once)
function updateProtocolConstants(vaultContract: VaultContract): void {
  let constants = getOrCreateProtocolConstants();
  
  // Only update if not already set (constants don't change)
  if (constants.protocolManagementFee.equals(BigInt.zero())) {
    let protocolManagementFeeCall = vaultContract.try_PROTOCOL_MANAGEMENT_FEE();
    if (!protocolManagementFeeCall.reverted) {
      constants.protocolManagementFee = protocolManagementFeeCall.value;
      log.info("Initialized protocolManagementFee: {}", [constants.protocolManagementFee.toString()]);
    }
  }
  
  if (constants.protocolPerformanceFee.equals(BigInt.zero())) {
    let protocolPerformanceFeeCall = vaultContract.try_PROTOCOL_PERFORMANCE_FEE();
    if (!protocolPerformanceFeeCall.reverted) {
      constants.protocolPerformanceFee = protocolPerformanceFeeCall.value;
      log.info("Initialized protocolPerformanceFee: {}", [constants.protocolPerformanceFee.toString()]);
    }
  }
  
  if (constants.managerPerformanceFee.equals(BigInt.zero())) {
    let managerPerformanceFeeCall = vaultContract.try_MANAGER_PERFORMANCE_FEE();
    if (!managerPerformanceFeeCall.reverted) {
      constants.managerPerformanceFee = managerPerformanceFeeCall.value;
      log.info("Initialized managerPerformanceFee: {}", [constants.managerPerformanceFee.toString()]);
    }
  }
  
  if (constants.maxManagerFee.equals(BigInt.zero())) {
    let maxManagerFeeCall = vaultContract.try_MAX_MANAGER_FEE();
    if (!maxManagerFeeCall.reverted) {
      constants.maxManagerFee = maxManagerFeeCall.value;
      log.info("Initialized maxManagerFee: {}", [constants.maxManagerFee.toString()]);
    }
  }
  
  if (constants.maxWithdrawalFee.equals(BigInt.zero())) {
    let maxWithdrawalFeeCall = vaultContract.try_MAX_WITHDRAWAL_FEE();
    if (!maxWithdrawalFeeCall.reverted) {
      constants.maxWithdrawalFee = maxWithdrawalFeeCall.value;
      log.info("Initialized maxWithdrawalFee: {}", [constants.maxWithdrawalFee.toString()]);
    }
  }
  
  if (constants.feeDenominator.equals(BigInt.zero())) {
    let feeDenominatorCall = vaultContract.try_FEE_DENOMINATOR();
    if (!feeDenominatorCall.reverted) {
      constants.feeDenominator = feeDenominatorCall.value;
      log.info("Initialized feeDenominator: {}", [constants.feeDenominator.toString()]);
    }
  }
  
  constants.lastUpdate = BigInt.fromI32(0); // Placeholder timestamp
  constants.save();
}

// Calculate protocol-level metrics
function calculateProtocolMetrics(protocolStat: DailyProtocolStat): void {
  // Get total vaults from factory
  let factory = VaultFactory.load(Bytes.fromHexString(FACTORY_ADDRESS));
  if (factory) {
    protocolStat.totalVaults = factory.totalVaults;
  }
  
  // Get running totals from ProtocolMetrics entity
  let protocolMetrics = getOrCreateProtocolMetrics();
  
  // Use running totals for daily stats
  protocolStat.totalValueLocked = protocolMetrics.totalValueLocked;
  protocolStat.activeVaults = protocolMetrics.activeVaults;
  protocolStat.totalUsers = protocolMetrics.totalUsers;
  
  // For now, set active users and new users to zero
  // These would need more complex tracking logic
  protocolStat.activeUsers = BigInt.zero();
  protocolStat.newUsers = BigInt.zero();
}

// Update protocol metrics when vault AUM changes
function updateProtocolMetrics(vaultAddress: Bytes, oldAum: BigInt, newAum: BigInt, isNewVault: boolean = false): void {
  let protocolMetrics = getOrCreateProtocolMetrics();
  
  // Update TVL
  if (oldAum.gt(BigInt.zero())) {
    protocolMetrics.totalValueLocked = protocolMetrics.totalValueLocked.minus(oldAum);
  }
  if (newAum.gt(BigInt.zero())) {
    protocolMetrics.totalValueLocked = protocolMetrics.totalValueLocked.plus(newAum);
  }
  
  // Update vault count if it's a new vault
  if (isNewVault) {
    protocolMetrics.totalVaults = protocolMetrics.totalVaults.plus(BigInt.fromI32(1));
  }
  
  // Update active vaults count (simplified approach)
  let factory = VaultFactory.load(Bytes.fromHexString(FACTORY_ADDRESS));
  if (factory) {
    protocolMetrics.activeVaults = factory.totalVaults; // Simplified: assume all vaults are active
  }
  
  protocolMetrics.lastUpdate = BigInt.fromI32(0); // Will be set to actual timestamp when called
  protocolMetrics.save();
}

// Core vault lifecycle
export function handleStateChanged(event: StateChangedEvent): void {
  log.info("Handling StateChanged event for vault: {}", [event.address.toHexString()]);

  let vault = Vault.load(event.address);
  if (!vault) {
    log.error("Vault not found: {}", [event.address.toHexString()]);
    return;
  }

  let oldState = getVaultStateString(event.params.oldState);
  let newState = getVaultStateString(event.params.newState);
  
  vault.currentEpoch = event.params.epoch;
  vault.state = newState;
  vault.save();

  // Create StateChange event
  let stateChange = new StateChange(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  );
  stateChange.vault = event.address;
  stateChange.epoch = event.params.epoch;
  stateChange.oldState = oldState;
  stateChange.newState = newState;
  stateChange.blockNumber = event.block.number;
  stateChange.blockTimestamp = event.block.timestamp;
  stateChange.transactionHash = event.transaction.hash;
  stateChange.save();
}

export function handleEpochAdvanced(event: EpochAdvancedEvent): void {
  log.info("Handling EpochAdvanced event for vault: {}", [event.address.toHexString()]);

  let vault = Vault.load(event.address);
  if (!vault) {
    log.error("Vault not found: {}", [event.address.toHexString()]);
    return;
  }

  vault.currentEpoch = event.params.newEpoch;
  vault.totalAssets = event.params.totalAssetsReturned;
  // Update AUM after totalAssets change from epoch advancement
  calculateAndUpdateAUM(vault, "EPOCH_CHANGE", "EpochAdvanced", event.block.number, event.block.timestamp, event.transaction.hash, event.logIndex.toI32());
  vault.save();

  // Create EpochChange event
  let epochChange = new EpochChange(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  );
  epochChange.vault = event.address;
  epochChange.oldEpoch = event.params.oldEpoch;
  epochChange.newEpoch = event.params.newEpoch;
  epochChange.totalAssetsReturned = event.params.totalAssetsReturned;
  epochChange.blockNumber = event.block.number;
  epochChange.blockTimestamp = event.block.timestamp;
  epochChange.transactionHash = event.transaction.hash;
  epochChange.save();
}

// User interactions (ERC4626 standard)
export function handleDeposit(event: DepositEvent): void {
  log.info("Handling Deposit event for vault: {}", [event.address.toHexString()]);

  let vault = Vault.load(event.address);
  if (!vault) {
    log.error("Vault not found: {}", [event.address.toHexString()]);
    return;
  }

  // Update user
  let user = getOrCreateUser(event.params.owner);
  user.totalDeposited = user.totalDeposited.plus(event.params.assets);
  user.lastActivityAt = event.block.timestamp;
  if (user.firstDepositAt.equals(BigInt.zero())) {
    user.firstDepositAt = event.block.timestamp;
  }
  user.save();

  // Update vault user
  let vaultUser = getOrCreateVaultUser(event.address, event.params.owner);
  vaultUser.shares = vaultUser.shares.plus(event.params.shares);
  vaultUser.totalDeposited = vaultUser.totalDeposited.plus(event.params.assets);
  vaultUser.isActive = true;
  vaultUser.lastActivityAt = event.block.timestamp;
  if (vaultUser.firstDepositAt.equals(BigInt.zero())) {
    vaultUser.firstDepositAt = event.block.timestamp;
  }
  vaultUser.save();

  // Update vault
  vault.totalAssets = vault.totalAssets.plus(event.params.assets);
  vault.totalSupply = vault.totalSupply.plus(event.params.shares);
  if (vault.totalSupply.gt(BigInt.zero())) {
    vault.sharePrice = vault.totalAssets.times(BigInt.fromI32(10).pow(18)).div(vault.totalSupply);
  }
  // Update AUM after totalAssets change
  calculateAndUpdateAUM(vault, "DEPOSIT", "Deposit", event.block.number, event.block.timestamp, event.transaction.hash, event.logIndex.toI32());
  vault.save();

  // Create Deposit event
  let deposit = new Deposit(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  );
  deposit.vault = event.address;
  deposit.user = event.params.owner;
  deposit.sender = event.params.sender;
  deposit.owner = event.params.owner;
  deposit.assets = event.params.assets;
  deposit.shares = event.params.shares;
  deposit.blockNumber = event.block.number;
  deposit.blockTimestamp = event.block.timestamp;
  deposit.transactionHash = event.transaction.hash;
  deposit.save();

  // Update daily stats
  updateDailyStats(event.address, event.block.timestamp, event.params.assets, BigInt.zero());
}

export function handleWithdraw(event: WithdrawEvent): void {
  log.info("Handling Withdraw event for vault: {}", [event.address.toHexString()]);

  let vault = Vault.load(event.address);
  if (!vault) {
    log.error("Vault not found: {}", [event.address.toHexString()]);
    return;
  }

  // Update user
  let user = getOrCreateUser(event.params.owner);
  user.totalWithdrawn = user.totalWithdrawn.plus(event.params.assets);
  user.lastActivityAt = event.block.timestamp;
  user.save();

  // Update vault user
  let vaultUser = getOrCreateVaultUser(event.address, event.params.owner);
  vaultUser.shares = vaultUser.shares.minus(event.params.shares);
  vaultUser.totalWithdrawn = vaultUser.totalWithdrawn.plus(event.params.assets);
  vaultUser.lastActivityAt = event.block.timestamp;
  if (vaultUser.shares.equals(BigInt.zero())) {
    vaultUser.isActive = false;
  }
  vaultUser.save();

  // Update vault
  vault.totalAssets = vault.totalAssets.minus(event.params.assets);
  vault.totalSupply = vault.totalSupply.minus(event.params.shares);
  if (vault.totalSupply.gt(BigInt.zero())) {
    vault.sharePrice = vault.totalAssets.times(BigInt.fromI32(10).pow(18)).div(vault.totalSupply);
  }
  // Update AUM after totalAssets change
  calculateAndUpdateAUM(vault, "WITHDRAW", "Withdraw", event.block.number, event.block.timestamp, event.transaction.hash, event.logIndex.toI32());
  vault.save();

  // Create Withdrawal event
  let withdrawal = new Withdrawal(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  );
  withdrawal.vault = event.address;
  withdrawal.user = event.params.owner;
  withdrawal.sender = event.params.sender;
  withdrawal.receiver = event.params.receiver;
  withdrawal.owner = event.params.owner;
  withdrawal.assets = event.params.assets;
  withdrawal.shares = event.params.shares;
  withdrawal.blockNumber = event.block.number;
  withdrawal.blockTimestamp = event.block.timestamp;
  withdrawal.transactionHash = event.transaction.hash;
  withdrawal.save();

  // Update daily stats
  updateDailyStats(event.address, event.block.timestamp, BigInt.zero(), event.params.assets);
}

// Custom vault events
export function handleDeposited(event: DepositedEvent): void {
  log.info("Handling Deposited event for vault: {}", [event.address.toHexString()]);
  // This is handled by handleDeposit for ERC4626 standard
  // Custom logic can be added here if needed
}

export function handleWithdrawn(event: WithdrawnEvent): void {
  log.info("Handling Withdrawn event for vault: {}", [event.address.toHexString()]);
  // This is handled by handleWithdraw for ERC4626 standard
  // Custom logic can be added here if needed
}

// Vault operations
export function handleContractCalled(event: ContractCalledEvent): void {
  log.info("Handling ContractCalled event for vault: {} targeting: {}", [
    event.address.toHexString(),
    event.params.target.toHexString()
  ]);

  let vault = Vault.load(event.address);
  if (vault) {
    // Update real-time metrics after contract call
    vault.lastContractCall = event.block.timestamp;
    calculateAndUpdateAUM(vault, "CONTRACT_CALL", "ContractCalled", event.block.number, event.block.timestamp, event.transaction.hash, event.logIndex.toI32());
    vault.save();
  }

  // Create ContractCall event
  let contractCall = new ContractCall(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  );
  contractCall.vault = event.address;
  contractCall.target = event.params.target;
  contractCall.data = event.params.data;
  contractCall.value = event.params.value;
  contractCall.transactionType = "NotUsed"; // Default type, will be updated by PlatformGuard handlers
  contractCall.blockNumber = event.block.number;
  contractCall.blockTimestamp = event.block.timestamp;
  contractCall.transactionHash = event.transaction.hash;
  contractCall.save();
}

export function handleAutoRealizationTriggered(event: AutoRealizationTriggeredEvent): void {
  log.info("Handling AutoRealizationTriggered event for vault: {}", [event.address.toHexString()]);

  let vault = Vault.load(event.address);
  if (vault) {
    // Update real-time metrics after profit realization
    calculateAndUpdateAUM(vault, "AUTO_REALIZATION", "AutoRealizationTriggered", event.block.number, event.block.timestamp, event.transaction.hash, event.logIndex.toI32());
    vault.save();
  }

  // Create AutoRealization event
  let autoRealization = new AutoRealization(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  );
  autoRealization.vault = event.address;
  autoRealization.triggeredBy = event.params.triggeredBy;
  autoRealization.preRealizationValue = event.params.preRealizationValue;
  autoRealization.totalFeesExtracted = event.params.totalFeesExtracted;
  autoRealization.blockNumber = event.block.number;
  autoRealization.blockTimestamp = event.block.timestamp;
  autoRealization.transactionHash = event.transaction.hash;
  autoRealization.save();
}

// Oracle protection
export function handleOracleProtectionUpdated(event: OracleProtectionUpdatedEvent): void {
  log.info("Handling OracleProtectionUpdated event for vault: {}", [event.address.toHexString()]);

  let vault = Vault.load(event.address);
  if (vault) {
    vault.harvestCooldown = event.params.harvestCooldown;
    vault.maxPriceDeviationBps = event.params.maxPriceDeviationBps;
    vault.emergencyMode = event.params.emergencyMode;
    vault.save();
  }
}

export function handleEmergencyOracleModeActivated(event: EmergencyOracleModeActivatedEvent): void {
  log.info("Handling EmergencyOracleModeActivated event for vault: {}", [event.address.toHexString()]);

  let vault = Vault.load(event.address);
  if (vault) {
    vault.emergencyMode = true;
    vault.save();
  }
}

export function handleHarvestBlocked(event: HarvestBlockedEvent): void {
  log.info("Handling HarvestBlocked event for vault: {}", [event.address.toHexString()]);
  // Log the harvest blocking but don't need to store as entity
}

// Access control
export function handleOwnershipTransferred(event: OwnershipTransferredEvent): void {
  log.info("Handling OwnershipTransferred event for vault: {}", [event.address.toHexString()]);
  // Vault ownership transfer - could update manager if needed
}

export function handlePaused(event: PausedEvent): void {
  log.info("Handling Paused event for vault: {}", [event.address.toHexString()]);

  let vault = Vault.load(event.address);
  if (vault) {
    vault.isPaused = true;
    vault.save();
  }
}

export function handleUnpaused(event: UnpausedEvent): void {
  log.info("Handling Unpaused event for vault: {}", [event.address.toHexString()]);

  let vault = Vault.load(event.address);
  if (vault) {
    vault.isPaused = false;
    vault.save();
  }
}

// ERC20 events for share tracking
export function handleTransfer(event: TransferEvent): void {
  // Handle minting (from zero address) and burning (to zero address)
  if (event.params.from.equals(Address.zero()) || event.params.to.equals(Address.zero())) {
    let vault = Vault.load(event.address);
    if (vault) {
      // Update real-time metrics for mint/burn operations
      calculateAndUpdateAUM(vault, "TRANSFER", "Transfer", event.block.number, event.block.timestamp, event.transaction.hash, event.logIndex.toI32());
      vault.save();
    }
  }
  
  // Only log transfers between non-zero addresses (exclude mint/burn)
  if (!event.params.from.equals(Address.zero()) && !event.params.to.equals(Address.zero())) {
    log.info("Handling Transfer event for vault: {} from {} to {}", [
      event.address.toHexString(),
      event.params.from.toHexString(),
      event.params.to.toHexString()
    ]);
    
    // Update sender
    let fromVaultUser = getOrCreateVaultUser(event.address, event.params.from);
    fromVaultUser.shares = fromVaultUser.shares.minus(event.params.value);
    fromVaultUser.lastActivityAt = event.block.timestamp;
    if (fromVaultUser.shares.equals(BigInt.zero())) {
      fromVaultUser.isActive = false;
    }
    fromVaultUser.save();

    // Update receiver
    let toVaultUser = getOrCreateVaultUser(event.address, event.params.to);
    toVaultUser.shares = toVaultUser.shares.plus(event.params.value);
    toVaultUser.isActive = true;
    toVaultUser.lastActivityAt = event.block.timestamp;
    if (toVaultUser.firstDepositAt.equals(BigInt.zero())) {
      toVaultUser.firstDepositAt = event.block.timestamp;
    }
    toVaultUser.save();
  }
}

export function handleApproval(event: ApprovalEvent): void {
  // Log approval events but don't store them
  log.info("Handling Approval event for vault: {}", [event.address.toHexString()]);
}

// External transfer events
export function handleYieldHarvested(event: YieldHarvestedEvent): void {
  log.info("Handling YieldHarvested event for vault: {} asset: {} amount: {}", [
    event.address.toHexString(),
    event.params.asset.toHexString(),
    event.params.amount.toString()
  ]);

  let vault = Vault.load(event.address);
  if (vault) {
    // Update real-time metrics after yield harvest
    calculateAndUpdateAUM(vault, "YIELD_HARVEST", "YieldHarvested", event.block.number, event.block.timestamp, event.transaction.hash, event.logIndex.toI32());
    vault.save();
  }

  // Create YieldHarvested event
  let yieldHarvested = new YieldHarvested(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  );
  yieldHarvested.vault = event.address;
  yieldHarvested.asset = event.params.asset;
  yieldHarvested.amount = event.params.amount;
  yieldHarvested.managementFee = event.params.managementFee;
  yieldHarvested.performanceFee = event.params.performanceFee;
  yieldHarvested.protocolFee = event.params.protocolFee;
  yieldHarvested.blockNumber = event.block.number;
  yieldHarvested.blockTimestamp = event.block.timestamp;
  yieldHarvested.transactionHash = event.transaction.hash;
  yieldHarvested.save();

  // Create external token transfer record
  let externalTransfer = new ExternalTokenTransfer(
    event.transaction.hash.concatI32(event.logIndex.toI32()).concat(Bytes.fromUTF8("-harvest"))
  );
  externalTransfer.vault = event.address;
  externalTransfer.token = event.params.asset;
  externalTransfer.transferType = "YIELD_HARVEST";
  externalTransfer.amount = event.params.amount;
  externalTransfer.destination = event.address; // harvested to vault
  externalTransfer.blockNumber = event.block.number;
  externalTransfer.blockTimestamp = event.block.timestamp;
  externalTransfer.transactionHash = event.transaction.hash;
  externalTransfer.save();
}

 