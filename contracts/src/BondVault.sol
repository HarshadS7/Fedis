// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuardTransient} from "@openzeppelin/contracts/utils/ReentrancyGuardTransient.sol";

import {VaultEscrow} from "./VaultEscrow.sol";
import {TaskPolicy} from "./TaskPolicy.sol";

/// @title BondVault
/// @notice Custody for the collateral an agent puts at risk on one protected task. The bond
///         is locked before work begins, returned in full when validation passes, and used
///         to compensate the buyer when it fails. This is the "skin in the game" half of
///         Fedis; `TaskPolicy` holds the promise, this contract holds the money.
///
/// @dev CUSTODY IS PER TASK, and that is a deliberate cost. Each bond gets its own
///      `VaultEscrow` clone rather than sharing one pooled balance.
///
///      A pooled design -- `mapping(bytes32 => uint256)` against a single
///      `USDC.balanceOf(BondVault)` -- would be simpler and cheaper per call. It would also
///      make every lock, release and slash in the protocol read-modify-write one ERC-20
///      storage slot. Monad's optimistic scheduler would detect that conflict and
///      re-execute the colliding transactions serially, which is precisely the contention
///      `VaultEscrow` was written to eliminate for `AgentVault` (read its NatSpec -- the
///      argument is identical). It would land on the single most-repeated call in the
///      parallelism benchmark.
///
///      Per-AGENT custody would not be enough either: two tasks run by one busy agent would
///      still collide. `project_plan.md` partitions at the task, so custody does too.
///
///      `VaultEscrow` needed no changes to be reused here. It only ever checks
///      `msg.sender == vault` and is otherwise agnostic about who controls it, so the same
///      already-tested, already-frozen implementation backs both protocols.
///
/// @dev WHO POSTS THE BOND is deliberately not restricted to the agent's own operator. The
///      payer is recorded per task and refunded to exactly that address. That keeps the
///      token ledger partitioned across many payer accounts instead of routing every bond
///      through one relayer balance, and it is the hook `project_plan.md` section 2D needs
///      for Phase 4, where an LP underwrites an agent's bond instead of the agent funding
///      it. Whoever posts the collateral carries the risk and collects the refund.
contract BondVault is Ownable, ReentrancyGuardTransient {
    using SafeERC20 for IERC20;

    struct Bond {
        address escrow;
        address bondedBy;
        uint256 amount;
        bool settled;
    }

    // ---------------------------------------------------------------------
    // Storage
    // ---------------------------------------------------------------------

    /// @notice Bonds partitioned by task id. No pooled total, by design.
    mapping(bytes32 => Bond) private _bonds;

    /// @notice Settlement asset (USDC, 6 decimals).
    IERC20 public immutable asset;

    /// @notice Implementation the per-task escrows are cloned from.
    address public immutable escrowImplementation;

    /// @notice The obligation ledger this vault settles against.
    TaskPolicy public immutable taskPolicy;

    /// @notice The only contract allowed to release or slash. Set after deployment because
    ///         `ValidationRouter` needs this vault's address in its own constructor.
    address public validationRouter;

    // ---------------------------------------------------------------------
    // Events
    // ---------------------------------------------------------------------

    event BondLocked(
        bytes32 indexed taskId, bytes32 indexed agentId, address indexed bondedBy, address escrow, uint256 amount
    );
    event BondReleased(bytes32 indexed taskId, bytes32 indexed agentId, address indexed to, uint256 amount);
    event BondSlashed(
        bytes32 indexed taskId,
        bytes32 indexed agentId,
        address indexed buyer,
        uint256 paidToBuyer,
        uint256 refundedToBonder
    );
    event ValidationRouterSet(address indexed router);

    // ---------------------------------------------------------------------
    // Errors
    // ---------------------------------------------------------------------

    error NotValidationRouter(address caller);
    error ValidationRouterNotSet();
    error BondAlreadyLocked(bytes32 taskId);
    error BondNotLocked(bytes32 taskId);
    error BondAlreadySettled(bytes32 taskId);
    error ZeroAddress();

    modifier onlyValidationRouter() {
        if (validationRouter == address(0)) revert ValidationRouterNotSet();
        if (msg.sender != validationRouter) revert NotValidationRouter(msg.sender);
        _;
    }

    constructor(address asset_, address taskPolicy_, address owner_) Ownable(owner_) {
        if (asset_ == address(0) || taskPolicy_ == address(0)) revert ZeroAddress();
        asset = IERC20(asset_);
        taskPolicy = TaskPolicy(taskPolicy_);
        escrowImplementation = address(new VaultEscrow());
    }

    // ---------------------------------------------------------------------
    // Admin
    // ---------------------------------------------------------------------

    function setValidationRouter(address router) external onlyOwner {
        if (router == address(0)) revert ZeroAddress();
        validationRouter = router;
        emit ValidationRouterSet(router);
    }

    // ---------------------------------------------------------------------
    // Bonding
    // ---------------------------------------------------------------------

    /// @notice Lock the collateral a task requires. Pulls `requiredBond` from the caller,
    ///         so the caller must have approved this contract first.
    /// @dev Advances the task to `Bonded`, which means this contract must be authorized on
    ///      `TaskPolicy`. `markBonded` enforces the state machine and the deadline, so a
    ///      task that is already bonded, already settled, or expired reverts there.
    /// @return escrow The address now holding this task's collateral.
    function lockBond(bytes32 taskId) external nonReentrant returns (address escrow) {
        Bond storage b = _bonds[taskId];
        if (b.escrow != address(0)) revert BondAlreadyLocked(taskId);

        TaskPolicy.Policy memory p = taskPolicy.getPolicy(taskId);

        escrow = Clones.clone(escrowImplementation);
        VaultEscrow(escrow).initialize(address(this), address(asset));

        b.escrow = escrow;
        b.bondedBy = msg.sender;
        b.amount = p.requiredBond;

        // Advance the policy before taking the money: if the task is not bondable, this
        // reverts and nothing has moved.
        taskPolicy.markBonded(taskId);

        asset.safeTransferFrom(msg.sender, escrow, p.requiredBond);

        emit BondLocked(taskId, p.agentId, msg.sender, escrow, p.requiredBond);
    }

    /// @notice Validation passed: return the whole bond to whoever posted it.
    function release(bytes32 taskId) external onlyValidationRouter nonReentrant {
        Bond storage b = _settleable(taskId);
        bytes32 agentId = taskPolicy.getPolicy(taskId).agentId;

        address to = b.bondedBy;
        uint256 amount = b.amount;
        address escrow = b.escrow;
        b.settled = true;

        taskPolicy.markReleased(taskId);
        VaultEscrow(escrow).pay(to, amount);

        emit BondReleased(taskId, agentId, to, amount);
    }

    /// @notice Validation failed: compensate the buyer out of the bond.
    /// @dev The buyer receives at most `maxCompensation` -- the ceiling the policy committed
    ///      to before the work happened. Anything the bond holds above that ceiling is
    ///      returned to the bonder rather than kept: the policy promised the buyer a capped
    ///      remedy, not the entire collateral.
    /// @return paidToBuyer USDC actually transferred to the buyer.
    function slash(bytes32 taskId) external onlyValidationRouter nonReentrant returns (uint256 paidToBuyer) {
        Bond storage b = _settleable(taskId);
        TaskPolicy.Policy memory p = taskPolicy.getPolicy(taskId);

        uint256 amount = b.amount;
        paidToBuyer = amount > p.maxCompensation ? p.maxCompensation : amount;
        uint256 refund = amount - paidToBuyer;
        address bonder = b.bondedBy;
        address escrow = b.escrow;

        b.settled = true;

        taskPolicy.markSlashed(taskId);
        if (paidToBuyer > 0) VaultEscrow(escrow).pay(p.buyer, paidToBuyer);
        if (refund > 0) VaultEscrow(escrow).pay(bonder, refund);

        emit BondSlashed(taskId, p.agentId, p.buyer, paidToBuyer, refund);
    }

    // ---------------------------------------------------------------------
    // Views
    // ---------------------------------------------------------------------

    function getBond(bytes32 taskId) external view returns (Bond memory) {
        return _bonds[taskId];
    }

    /// @notice Collateral currently at risk on a task; zero once it has settled.
    function activeBond(bytes32 taskId) external view returns (uint256) {
        Bond storage b = _bonds[taskId];
        if (b.settled || b.escrow == address(0)) return 0;
        return b.amount;
    }

    /// @notice USDC actually sitting in this task's escrow.
    /// @dev Should be this contract's own balance mirror-image: `BondVault` itself never
    ///      holds funds, which is the invariant the custody-partitioning claim rests on.
    function escrowBalance(bytes32 taskId) external view returns (uint256) {
        address escrow = _bonds[taskId].escrow;
        if (escrow == address(0)) return 0;
        return asset.balanceOf(escrow);
    }

    // ---------------------------------------------------------------------
    // Internal
    // ---------------------------------------------------------------------

    function _settleable(bytes32 taskId) internal view returns (Bond storage b) {
        b = _bonds[taskId];
        if (b.escrow == address(0)) revert BondNotLocked(taskId);
        if (b.settled) revert BondAlreadySettled(taskId);
    }
}
