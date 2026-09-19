// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuardTransient} from "@openzeppelin/contracts/utils/ReentrancyGuardTransient.sol";

import {VaultEscrow} from "./VaultEscrow.sol";
import {IIdentityRegistry} from "./interfaces/IIdentityRegistry.sol";

/// @title AgentVault
/// @notice The agent side of Fides. Liquidity Providers underwrite individual AI agents by
///         depositing USDC into that agent's isolated vault. LPs collect the insurance
///         premiums paid on that agent's tasks; when the agent hallucinates, misfires, or
///         misses a task, the vault is slashed to make the buyer whole.
///
/// @dev PARALLEL EXECUTION -- the whole reason this protocol is on Monad.
///
///      A conventional DeFi insurance pool keeps one `totalTreasury` variable. Five hundred
///      agents transacting at once means five hundred writes to one storage slot: the
///      optimistic scheduler detects the conflict, re-executes serially, and throughput
///      collapses to Ethereum's.
///
///      Fides has no such variable. State is partitioned two ways:
///        1. Accounting lives in `_vaults[agentId]` and `sharesOf[agentId][lp]` -- slots
///           derived from the agent id, so agents never collide with each other.
///        2. Custody lives in a per-agent `VaultEscrow` clone, so the USDC ledger itself is
///           partitioned too (see VaultEscrow for why this second step is load-bearing).
///
///      Two consequences enforced throughout this file:
///        - The protocol's 10% take-rate accrues into `v.protocolFees` (per agent) and is
///          swept later per agent. Transferring it to a single treasury address on every
///          bond would re-serialize every bond in the protocol through one balance slot.
///        - Reentrancy protection uses EIP-1153 transient storage. A classic
///          `ReentrancyGuard` writes one persistent slot on every single call -- a global
///          write barrier that would serialize the entire contract.
///
///      The one deliberately global write is `agentIds.push()` in `registerAgent`. It is not
///      in the hot path: agents register once, then bond and slash forever after.
contract AgentVault is Ownable, ReentrancyGuardTransient {
    using SafeERC20 for IERC20;

    // ---------------------------------------------------------------------
    // Curve + fee parameters
    // ---------------------------------------------------------------------

    uint256 public constant BPS = 10_000;

    /// @notice Protocol take-rate on premiums (the Stripe model). LPs keep the other 90%.
    uint256 public constant PROTOCOL_FEE_BPS = 1_000;

    /// @notice Kinked utilization curve. Utilization is insured job volume over TVL, so a
    ///         vault that is over-capitalized relative to the work its agent actually does
    ///         sits at low utilization and earns close to nothing. That is the mechanism that
    ///         stops every LP from crowding into one "safe" agent and starves new agents of
    ///         capital -- yield is highest exactly where coverage is scarcest.
    uint256 public constant KINK_BPS = 8_000; // 80% utilization
    uint256 public constant BASE_APY_BPS = 200; // 2% at zero utilization
    uint256 public constant SLOPE1_APY_BPS = 1_800; // -> 20% APY at the kink
    uint256 public constant SLOPE2_APY_BPS = 13_000; // -> 150% APY at full utilization

    /// @notice Agent base risk band, in bps of task cost, before the user multiplier.
    uint256 public constant MIN_AGENT_RISK_BPS = 50; // 0.5% for a flawless veteran
    uint256 public constant MAX_AGENT_RISK_BPS = 2_000; // 20% for a serial failure
    uint256 public constant NEW_AGENT_RISK_BPS = 300; // 3% while unproven

    /// @notice Jobs an agent must complete before its own track record outweighs the
    ///         unproven-agent floor.
    uint256 public constant SEASONING_JOBS = 10;

    // ---------------------------------------------------------------------
    // Storage
    // ---------------------------------------------------------------------

    struct Vault {
        address escrow; // per-agent USDC custody (distinct ERC-20 balance slot)
        address operator; // who registered / runs the agent
        uint256 registryAgentId; // ERC-8004 token id, 0 when unlinked
        bool identityVerified; // true when the ERC-8004 registry confirmed the operator
        uint256 totalAssets; // LP-owned USDC (excludes unswept protocol fees)
        uint256 totalShares; // LP shares outstanding
        uint256 jobVolume; // cumulative insured notional
        uint256 premiumsEarned; // cumulative premiums credited to LPs
        uint256 totalSlashed; // cumulative paid out on claims
        uint256 protocolFees; // accrued take-rate, unswept
        uint64 jobCount;
        uint64 slashCount;
    }

    /// @notice Flattened vault view with the derived curve values folded in, so the
    ///         middleware never recomputes protocol math off-chain and drifts from the chain.
    struct VaultInfo {
        bytes32 agentId;
        address escrow;
        address operator;
        uint256 registryAgentId;
        bool identityVerified;
        uint256 tvl;
        uint256 totalShares;
        uint256 jobVolume;
        uint256 premiumsEarned;
        uint256 totalSlashed;
        uint256 protocolFees;
        uint256 utilizationBps;
        uint256 apyBps;
        uint256 riskBps;
        uint64 jobCount;
        uint64 slashCount;
    }

    mapping(bytes32 => Vault) private _vaults;

    /// @notice LP share ledger, partitioned by agent then by LP.
    mapping(bytes32 => mapping(address => uint256)) public sharesOf;

    /// @notice Enumeration for the middleware's GET /vaults. Written once per agent at
    ///         registration -- never in the bond/slash hot path.
    bytes32[] public agentIds;

    /// @notice Settlement asset (USDC, 6 decimals).
    IERC20 public immutable asset;

    /// @notice Implementation the per-agent escrows are cloned from.
    address public immutable escrowImplementation;

    /// @notice ERC-8004 Agent Identity Registry. The canonical deployment is
    ///         0x8004A169FB4a3325136EB29fA0ceB6D2e539a432 on Monad mainnet; on Monad testnet
    ///         that address has no bytecode, so deployments there point at
    ///         `MockIdentityRegistry`. May be address(0) to skip identity checks entirely.
    IIdentityRegistry public identityRegistry;

    /// @notice Accounts allowed to call `bond` / `slash` (the Fides middleware).
    mapping(address => bool) public authorized;

    // ---------------------------------------------------------------------
    // Events
    // ---------------------------------------------------------------------

    event AgentRegistered(
        bytes32 indexed agentId,
        address indexed operator,
        address escrow,
        uint256 registryAgentId,
        bool identityVerified
    );
    event Deposited(bytes32 indexed agentId, address indexed lp, uint256 assets, uint256 shares);
    event Withdrawn(bytes32 indexed agentId, address indexed lp, uint256 assets, uint256 shares);
    event Bonded(
        bytes32 indexed agentId,
        address indexed payer,
        uint256 premium,
        uint256 lpShare,
        uint256 protocolFee,
        uint256 coverage
    );
    event Slashed(
        bytes32 indexed agentId, address indexed user, uint256 requested, uint256 paid, uint256 shortfall
    );
    event ProtocolFeesSwept(bytes32 indexed agentId, address indexed to, uint256 amount);
    event AuthorizationSet(address indexed account, bool allowed);
    event IdentityRegistrySet(address indexed registry);

    // ---------------------------------------------------------------------
    // Errors
    // ---------------------------------------------------------------------

    error NotAuthorized(address caller);
    error AgentAlreadyRegistered(bytes32 agentId);
    error AgentNotRegistered(bytes32 agentId);
    error ZeroAmount();
    error ZeroAddress();
    error InsufficientShares(uint256 have, uint256 want);
    error IdentityMismatch(uint256 registryAgentId, address registryOwner, address operator);

    modifier onlyAuthorized() {
        if (!authorized[msg.sender]) revert NotAuthorized(msg.sender);
        _;
    }

    modifier registered(bytes32 agentId) {
        if (_vaults[agentId].escrow == address(0)) revert AgentNotRegistered(agentId);
        _;
    }

    constructor(address asset_, address identityRegistry_, address owner_) Ownable(owner_) {
        if (asset_ == address(0)) revert ZeroAddress();
        asset = IERC20(asset_);
        identityRegistry = IIdentityRegistry(identityRegistry_);
        escrowImplementation = address(new VaultEscrow());
        authorized[owner_] = true;
        emit AuthorizationSet(owner_, true);
        emit IdentityRegistrySet(identityRegistry_);
    }

    // ---------------------------------------------------------------------
    // Admin
    // ---------------------------------------------------------------------

    function setAuthorized(address account, bool allowed) external onlyOwner {
        if (account == address(0)) revert ZeroAddress();
        authorized[account] = allowed;
        emit AuthorizationSet(account, allowed);
    }

    /// @notice Authorize many signers at once.
    /// @dev Needed for the 500-transaction demo: 500 transactions from one EOA serialize on
    ///      that account's nonce no matter how well the contract state is partitioned, so the
    ///      firing script has to fan out across many signers. This is how they get authorized
    ///      in one transaction instead of N.
    function setAuthorizedBatch(address[] calldata accounts, bool allowed) external onlyOwner {
        for (uint256 i = 0; i < accounts.length; ++i) {
            address account = accounts[i];
            if (account == address(0)) revert ZeroAddress();
            authorized[account] = allowed;
            emit AuthorizationSet(account, allowed);
        }
    }

    function setIdentityRegistry(address registry) external onlyOwner {
        identityRegistry = IIdentityRegistry(registry);
        emit IdentityRegistrySet(registry);
    }

    /// @notice Sweep one agent's accrued take-rate. Per agent by design: a sweep that touched
    ///         a shared treasury balance on every bond would serialize every bond.
    function sweepProtocolFees(bytes32 agentId, address to)
        external
        onlyOwner
        registered(agentId)
        returns (uint256 amount)
    {
        if (to == address(0)) revert ZeroAddress();
        Vault storage v = _vaults[agentId];
        amount = v.protocolFees;
        if (amount == 0) return 0;
        v.protocolFees = 0;
        VaultEscrow(v.escrow).pay(to, amount);
        emit ProtocolFeesSwept(agentId, to, amount);
    }

    // ---------------------------------------------------------------------
    // Agent registration
    // ---------------------------------------------------------------------

    /// @notice Open an isolated vault for an agent. Permissionless: whoever claims an unused
    ///         agent id operates it.
    /// @param agentId Protocol-level id. Convention across the stack: keccak256 of the agent
    ///        name, e.g. `keccak256("gpt-researcher-v2")`.
    /// @param operator Address that runs the agent.
    /// @param registryAgentId ERC-8004 token id to bind to, or 0 to skip the identity link.
    /// @dev When a registry is configured and a token id is supplied, ownership is checked via
    ///      `ownerOf`. A registry that reverts or has no code does not block registration --
    ///      the vault is simply marked `identityVerified = false`. That keeps testnet (where
    ///      the canonical ERC-8004 registry is not deployed) working on the same code path
    ///      mainnet uses.
    function registerAgent(bytes32 agentId, address operator, uint256 registryAgentId)
        external
        returns (address escrow)
    {
        if (agentId == bytes32(0)) revert ZeroAmount();
        if (operator == address(0)) revert ZeroAddress();
        Vault storage v = _vaults[agentId];
        if (v.escrow != address(0)) revert AgentAlreadyRegistered(agentId);

        bool verified = false;
        // The code-length guard is load-bearing, not defensive noise: for a call with a
        // declared return value Solidity emits an extcodesize check that reverts in THIS
        // frame, before the call, so `try/catch` below would never see it. On Monad testnet
        // the canonical ERC-8004 address has no bytecode, which is exactly this case.
        if (
            address(identityRegistry) != address(0) && registryAgentId != 0
                && address(identityRegistry).code.length > 0
        ) {
            try identityRegistry.ownerOf(registryAgentId) returns (address registryOwner) {
                if (registryOwner != operator) {
                    revert IdentityMismatch(registryAgentId, registryOwner, operator);
                }
                verified = true;
            } catch {
                // Registry absent or reverting: record the link, leave it unverified.
                verified = false;
            }
        }

        escrow = Clones.clone(escrowImplementation);
        VaultEscrow(escrow).initialize(address(this), address(asset));

        v.escrow = escrow;
        v.operator = operator;
        v.registryAgentId = registryAgentId;
        v.identityVerified = verified;

        agentIds.push(agentId);
        emit AgentRegistered(agentId, operator, escrow, registryAgentId, verified);
    }

    // ---------------------------------------------------------------------
    // LP flows
    // ---------------------------------------------------------------------

    /// @notice Underwrite an agent. USDC in, LP shares out.
    /// @dev Share math carries a virtual offset of 1 on both sides, which keeps the first
    ///      deposit honest and keeps a fully-slashed vault (assets 0, shares > 0) re-fundable
    ///      instead of bricked by a division by zero.
    function deposit(bytes32 agentId, uint256 amount)
        external
        nonReentrant
        registered(agentId)
        returns (uint256 shares)
    {
        if (amount == 0) revert ZeroAmount();
        Vault storage v = _vaults[agentId];

        shares = (amount * (v.totalShares + 1)) / (v.totalAssets + 1);
        if (shares == 0) revert ZeroAmount();

        v.totalAssets += amount;
        v.totalShares += shares;
        sharesOf[agentId][msg.sender] += shares;

        // Straight to the agent's own escrow: never through a shared protocol balance.
        asset.safeTransferFrom(msg.sender, v.escrow, amount);
        emit Deposited(agentId, msg.sender, amount, shares);
    }

    /// @notice Redeem LP shares for the underlying USDC, net of any slashing taken.
    function withdraw(bytes32 agentId, uint256 shares)
        external
        nonReentrant
        registered(agentId)
        returns (uint256 amount)
    {
        if (shares == 0) revert ZeroAmount();
        uint256 held = sharesOf[agentId][msg.sender];
        if (held < shares) revert InsufficientShares(held, shares);

        Vault storage v = _vaults[agentId];
        amount = (shares * (v.totalAssets + 1)) / (v.totalShares + 1);
        if (amount > v.totalAssets) amount = v.totalAssets;

        sharesOf[agentId][msg.sender] = held - shares;
        v.totalShares -= shares;
        v.totalAssets -= amount;

        VaultEscrow(v.escrow).pay(msg.sender, amount);
        emit Withdrawn(agentId, msg.sender, amount, shares);
    }

    // ---------------------------------------------------------------------
    // Policy flows (middleware)
    // ---------------------------------------------------------------------

    /// @notice Record a premium payment into an agent's vault. Frozen integration signature.
    /// @dev Carries no coverage notional, so it leaves `jobVolume` -- and therefore the
    ///      utilization curve -- untouched. The x402 interceptor knows the task cost, so it
    ///      should call `bondWithCoverage` instead; this overload exists so anything holding
    ///      the frozen two-argument ABI keeps working.
    function bond(bytes32 agentId, uint256 premium) external onlyAuthorized nonReentrant {
        _bond(agentId, msg.sender, premium, 0);
    }

    /// @notice Record a premium and the task notional it insures.
    /// @param coverage Task cost being insured, in USDC (6dp). Feeds utilization and APY.
    function bondWithCoverage(bytes32 agentId, uint256 premium, uint256 coverage)
        external
        onlyAuthorized
        nonReentrant
    {
        _bond(agentId, msg.sender, premium, coverage);
    }

    /// @notice Bond a premium charged to an explicit payer. THE PREFERRED ENTRY POINT.
    ///
    /// @dev Separating "who is allowed to open a policy" from "whose USDC funds it" is not a
    ///      convenience -- it is the difference between the protocol scaling and not.
    ///
    ///      With `bond`/`bondWithCoverage` the authorized relayer is also the payer, so every
    ///      premium in the protocol read-modify-writes one slot: `USDC.balanceOf(relayer)`.
    ///      Monad's scheduler serializes on exactly that, and all the vault-level isolation
    ///      upstream buys nothing. Charging each buyer's own wallet keeps the token ledger
    ///      partitioned the same way the vaults are.
    ///
    /// @param payer Buying agent/user; must have approved this contract for `premium`.
    function bondFor(bytes32 agentId, address payer, uint256 premium, uint256 coverage)
        external
        onlyAuthorized
        nonReentrant
    {
        if (payer == address(0)) revert ZeroAddress();
        _bond(agentId, payer, premium, coverage);
    }

    function _bond(bytes32 agentId, address payer, uint256 premium, uint256 coverage)
        private
        registered(agentId)
    {
        if (premium == 0) revert ZeroAmount();
        Vault storage v = _vaults[agentId];

        uint256 protocolFee = (premium * PROTOCOL_FEE_BPS) / BPS;
        uint256 lpShare = premium - protocolFee;

        v.totalAssets += lpShare;
        v.premiumsEarned += lpShare;
        v.protocolFees += protocolFee; // accrued per agent, swept per agent
        v.jobVolume += coverage;
        v.jobCount += 1;

        asset.safeTransferFrom(payer, v.escrow, premium);
        emit Bonded(agentId, payer, premium, lpShare, protocolFee, coverage);
    }

    /// @notice Pay a user out of the failing agent's vault on a verified claim.
    /// @dev Pays what the vault can cover rather than reverting on an underfunded vault. A
    ///      revert here would abort the caller's whole batch; the shortfall is emitted instead
    ///      so the middleware can escalate it.
    function slash(bytes32 agentId, address user, uint256 amount)
        external
        onlyAuthorized
        nonReentrant
        registered(agentId)
        returns (uint256 paid)
    {
        if (user == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();

        Vault storage v = _vaults[agentId];
        paid = amount > v.totalAssets ? v.totalAssets : amount;

        v.totalAssets -= paid;
        v.totalSlashed += paid;
        v.slashCount += 1;

        if (paid > 0) VaultEscrow(v.escrow).pay(user, paid);
        emit Slashed(agentId, user, amount, paid, amount - paid);
    }

    // ---------------------------------------------------------------------
    // Views
    // ---------------------------------------------------------------------

    /// @notice Frozen integration signature, backing GET /vaults.
    /// @return tvl LP-owned USDC in the vault (6dp)
    /// @return apy Current LP yield in bps, off the kinked utilization curve
    /// @return jobVolume Cumulative insured notional (6dp)
    function getVaultStats(bytes32 agentId)
        external
        view
        returns (uint256 tvl, uint256 apy, uint256 jobVolume)
    {
        Vault storage v = _vaults[agentId];
        tvl = v.totalAssets;
        jobVolume = v.jobVolume;
        apy = _apyBps(_utilizationBps(tvl, jobVolume));
    }

    /// @notice Everything the LP Terminal needs about one vault, in a single call.
    function getVaultInfo(bytes32 agentId) public view returns (VaultInfo memory info) {
        Vault storage v = _vaults[agentId];
        uint256 util = _utilizationBps(v.totalAssets, v.jobVolume);
        info = VaultInfo({
            agentId: agentId,
            escrow: v.escrow,
            operator: v.operator,
            registryAgentId: v.registryAgentId,
            identityVerified: v.identityVerified,
            tvl: v.totalAssets,
            totalShares: v.totalShares,
            jobVolume: v.jobVolume,
            premiumsEarned: v.premiumsEarned,
            totalSlashed: v.totalSlashed,
            protocolFees: v.protocolFees,
            utilizationBps: util,
            apyBps: _apyBps(util),
            riskBps: _riskBps(v),
            jobCount: v.jobCount,
            slashCount: v.slashCount
        });
    }

    /// @notice Every vault in one call, so GET /vaults is a single RPC round-trip instead of
    ///         one per agent. Fine at hackathon scale; production would paginate.
    function getAllVaultInfo() external view returns (VaultInfo[] memory infos) {
        uint256 n = agentIds.length;
        infos = new VaultInfo[](n);
        for (uint256 i = 0; i < n; ++i) {
            infos[i] = getVaultInfo(agentIds[i]);
        }
    }

    function getVault(bytes32 agentId) external view returns (Vault memory) {
        return _vaults[agentId];
    }

    function isRegistered(bytes32 agentId) external view returns (bool) {
        return _vaults[agentId].escrow != address(0);
    }

    function agentCount() external view returns (uint256) {
        return agentIds.length;
    }

    /// @notice All registered agent ids, for the middleware to enumerate GET /vaults.
    function getAllAgentIds() external view returns (bytes32[] memory) {
        return agentIds;
    }

    /// @notice USDC value of an LP's position in one agent's vault.
    function assetsOf(bytes32 agentId, address lp) external view returns (uint256) {
        Vault storage v = _vaults[agentId];
        if (v.totalShares == 0) return 0;
        return (sharesOf[agentId][lp] * (v.totalAssets + 1)) / (v.totalShares + 1);
    }

    /// @notice Insured job volume as bps of TVL, capped at 100%.
    function getUtilizationBps(bytes32 agentId) external view returns (uint256) {
        Vault storage v = _vaults[agentId];
        return _utilizationBps(v.totalAssets, v.jobVolume);
    }

    /// @notice Agent base risk in bps of task cost -- the first half of a premium quote.
    ///         Read by `PremiumEngine.calculatePremium`.
    function getAgentRiskBps(bytes32 agentId) external view returns (uint256) {
        return _riskBps(_vaults[agentId]);
    }

    /// @notice The kinked curve as a pure function, so the LP Terminal can plot the whole
    ///         thing client-side without one RPC round-trip per point.
    /// @param utilizationBps Utilization to evaluate, 0-10000.
    /// @return LP APY in bps at that utilization.
    function previewApyAt(uint256 utilizationBps) external pure returns (uint256) {
        return _apyBps(utilizationBps > BPS ? BPS : utilizationBps);
    }

    // ---------------------------------------------------------------------
    // Curve internals
    // ---------------------------------------------------------------------

    function _utilizationBps(uint256 tvl, uint256 jobVolume) private pure returns (uint256) {
        // An unfunded vault reads as fully utilized: maximum advertised yield is exactly the
        // signal that should pull LPs toward an agent with no coverage.
        if (tvl == 0) return BPS;
        uint256 u = (jobVolume * BPS) / tvl;
        return u > BPS ? BPS : u;
    }

    /// @dev Gentle below the kink, steep above it: 2% at idle, 20% at the 80% kink, 150% at
    ///      full utilization. Over-capitalize a quiet agent and your yield decays toward the
    ///      2% floor, which is what pushes capital to agents that are actually underwriting.
    function _apyBps(uint256 utilizationBps) private pure returns (uint256) {
        if (utilizationBps <= KINK_BPS) {
            return BASE_APY_BPS + (utilizationBps * SLOPE1_APY_BPS) / KINK_BPS;
        }
        uint256 excess = utilizationBps - KINK_BPS;
        return BASE_APY_BPS + SLOPE1_APY_BPS + (excess * SLOPE2_APY_BPS) / (BPS - KINK_BPS);
    }

    function _riskBps(Vault storage v) private view returns (uint256) {
        if (v.jobCount == 0 || v.jobVolume == 0) return NEW_AGENT_RISK_BPS;

        uint256 failureBps = (v.totalSlashed * BPS) / v.jobVolume;
        if (failureBps > BPS) failureBps = BPS;

        uint256 risk = MIN_AGENT_RISK_BPS + ((MAX_AGENT_RISK_BPS - MIN_AGENT_RISK_BPS) * failureBps) / BPS;

        // An agent with a short history cannot price below the unproven floor, however clean
        // its record looks -- ten flawless jobs is not evidence of reliability.
        if (v.jobCount < SEASONING_JOBS && risk < NEW_AGENT_RISK_BPS) return NEW_AGENT_RISK_BPS;
        return risk;
    }
}
