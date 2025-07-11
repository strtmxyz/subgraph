# Stratum Vault Subgraph

A subgraph for indexing and querying data from the Stratum Vault protocol on Sepolia and Arbitrum.

## 🏗️ **Architecture**

### **Core Entities:**
- **`Vault`** - Investment vaults with ERC4626 standard
- **`VaultFactory`** - Factory contract managing vault creation
- **`User`** - Users and their portfolios
- **`VaultUser`** - User positions in each vault
- **`Deposit/Withdrawal`** - Deposit and withdrawal transactions

### **Events Tracking:**
- Vault lifecycle (StateChanged, EpochAdvanced)
- User interactions (Deposit, Withdraw)
- Platform activities (ContractCalled, AutoRealization)
- Factory configuration (Asset whitelisting, Admin changes)

## 🚀 **Setup**

### **1. Install dependencies:**
```bash
yarn install
```

### **2. Update config files:**

#### **Sepolia:**
```json
// config/sepolia.json
{
  "network": "sepolia",
  "address": "0xYourVaultFactoryAddress",
  "startBlock": 123456,
  "governance": "0xYourGovernanceAddress", 
  "governanceStartBlock": 123456
}
```

#### **Arbitrum:**
```json
// config/arbitrum.json
{
  "network": "arbitrum-one",
  "address": "0xYourVaultFactoryAddress",
  "startBlock": 123456,
  "governance": "0xYourGovernanceAddress",
  "governanceStartBlock": 123456
}
```

### **3. Setup The Graph Studio:**

#### **Authenticate:**
```bash
export GRAPH_DEPLOY_KEY="your-graph-studio-api-key"
yarn auth
```

#### **Create subgraphs:**
```bash
yarn create:sepolia
yarn create:arbitrum
```

## 📦 **Build & Deploy**

### **Deploy to Sepolia:**
```bash
yarn build:sepolia
```

### **Deploy to Arbitrum:**
```bash
yarn build:arbitrum
```

### **Manual steps:**
```bash
# Generate types from schema
yarn codegen

# Build subgraph
yarn build

# Deploy (after preparing config)
yarn deploy:sepolia
# or
yarn deploy:arbitrum
```

## 🔧 **Development**

### **Available Scripts:**

```bash
# Config preparation
yarn prepare:sepolia          # Generate subgraph.yaml for Sepolia
yarn prepare:arbitrum         # Generate subgraph.yaml for Arbitrum

# Build
yarn codegen                  # Generate AssemblyScript types
yarn build                    # Build subgraph

# Deploy
yarn deploy:sepolia          # Deploy to Sepolia subgraph
yarn deploy:arbitrum         # Deploy to Arbitrum subgraph

# The Graph Studio
yarn auth                    # Authenticate with Studio
yarn create:sepolia          # Create Sepolia subgraph in Studio
yarn create:arbitrum         # Create Arbitrum subgraph in Studio
```

### **File Structure:**
```
/abi/                        # Contract ABIs
  - VaultFactory.json
  - Vault.json
  - Governance.json
  - IPlatformGuard.json
  - IAssetGuard.json

/config/                     # Network configurations
  - sepolia.json
  - arbitrum.json

/src/                        # TypeScript mappings
  - vault-factory.ts         # VaultFactory events
  - vault.ts                 # Vault template events
  - governance.ts            # Governance events
  - platform-guard.ts       # Platform Guard events
  - asset-guard.ts           # Asset Guard events

schema.graphql               # GraphQL schema definition
subgraph.template.yaml       # Subgraph configuration template
```

## 📊 **Example Queries**

### **Get Vaults:**
```graphql
{
  vaults {
    id
    name
    symbol
    manager
    underlyingAsset
    maxCapacity
    totalAssets
    totalSupply
    sharePrice
    state
    currentEpoch
  }
}
```

### **Get User Portfolio:**
```graphql
{
  user(id: "0x...") {
    id
    totalDeposited
    totalWithdrawn
    vaultCount
    vaultPositions {
      vault {
        name
        symbol
      }
      shares
      totalDeposited
      totalWithdrawn
      isActive
    }
  }
}
```

### **Get Vault Activity:**
```graphql
{
  vault(id: "0x...") {
    id
    name
    totalAssets
    deposits(first: 10, orderBy: blockTimestamp, orderDirection: desc) {
      user { id }
      assets
      shares
      blockTimestamp
    }
    epochHistory {
      oldEpoch
      newEpoch
      totalAssetsReturned
      blockTimestamp
    }
  }
}
```

### **Daily Statistics:**
```graphql
{
  dailyVaultStats(first: 30, orderBy: date, orderDirection: desc) {
    vault
    date
    dailyDeposits
    dailyWithdrawals
    dailyVolume
    totalAssets
    sharePrice
    activeUsers
  }
}
```

## 🐛 **Troubleshooting**

### **Common Issues:**

1. **Linter errors about modules:**
   ```bash
   # Normal before running codegen
   yarn codegen  # Will generate types and fix errors
   ```

2. **ABI mismatch:**
   ```bash
   # Check that events in ABI match with subgraph.template.yaml
   # Update template if needed
   ```

3. **Network mismatch:**
   ```bash
   # Check network name in config files
   # Sepolia: "sepolia"
   # Arbitrum: "arbitrum-one"  
   ```

4. **Start block too early:**
   ```bash
   # Set startBlock = deployment block of contract
   # Avoid syncing too many empty blocks
   ```

## 📝 **Notes**

- Subgraph uses **ERC4626 standard** for vault interactions
- **Daily statistics** are automatically calculated
- **Platform activities** are tracked via ContractCall entities
- **Oracle protection** events are handled separately
- Supports both **Flexible** and **Non-Flexible** vaults in the same template

## 🔗 **Links**

- [The Graph Studio](https://thegraph.com/studio/)
- [Graph CLI Documentation](https://thegraph.com/docs/en/developer/graph-cli/)
- [AssemblyScript Documentation](https://www.assemblyscript.org/) 