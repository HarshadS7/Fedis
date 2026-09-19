// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @title VaultEscrow
/// @notice Holds the USDC backing exactly one agent. One escrow is cloned per agent by
///         `AgentVault`; it owns no logic of its own and only ever pays out on instruction.
///
/// @dev WHY THIS CONTRACT EXISTS -- this is the piece that makes the parallel-execution claim
///      actually true rather than merely asserted.
///
///      Isolating vault accounting into `mapping(bytes32 => Vault)` is necessary but NOT
///      sufficient. If every agent vault shared one custody address, then every `bond()` and
///      every `slash()` in the protocol would read-modify-write the SAME ERC-20 storage slot:
///      `USDC.balanceOf(theOneVault)`. Monad's optimistic scheduler would detect that conflict
///      and re-execute the colliding transactions serially -- the token contract would
///      re-introduce exactly the contention the vault mapping was designed to remove.
///
///      Giving each agent its own escrow address gives each agent its own
///      `USDC.balanceOf(escrow)` slot. Agent A's premium and Agent B's slash then touch
///      disjoint state at BOTH layers -- Fides accounting and the USDC ledger -- so they
///      commit in the same block in parallel.
contract VaultEscrow {
    using SafeERC20 for IERC20;

    /// @notice The AgentVault that cloned this escrow. Set once, at initialization.
    address public vault;

    /// @notice Settlement asset (USDC, 6dp).
    IERC20 public asset;

    error AlreadyInitialized();
    error OnlyVault(address caller);

    /// @notice Called by `AgentVault` immediately after cloning. Clones have no constructor,
    ///         so this stands in for one; the `vault != address(0)` check makes it single-use.
    function initialize(address vault_, address asset_) external {
        if (vault != address(0)) revert AlreadyInitialized();
        vault = vault_;
        asset = IERC20(asset_);
    }

    /// @notice Pay out of this agent's escrow. The only way funds ever leave.
    /// @dev All authorization, accounting and solvency checks live in `AgentVault`; this
    ///      contract exists purely to own a distinct ERC-20 balance slot.
    function pay(address to, uint256 amount) external {
        if (msg.sender != vault) revert OnlyVault(msg.sender);
        asset.safeTransfer(to, amount);
    }

    /// @notice USDC actually sitting in this escrow. Includes unswept protocol fees, so it is
    ///         a superset of the LP-owned `totalAssets` tracked in AgentVault.
    function balance() external view returns (uint256) {
        return asset.balanceOf(address(this));
    }
}
