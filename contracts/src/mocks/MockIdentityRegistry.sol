// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IIdentityRegistry} from "../interfaces/IIdentityRegistry.sol";

/// @title MockIdentityRegistry
/// @notice Stand-in for the ERC-8004 Identity Registry on Monad testnet, which has no
///         deployed bytecode. Mirrors only `ownerOf(uint256)`, the one function fedis reads.
contract MockIdentityRegistry is IIdentityRegistry {
    mapping(uint256 => address) private _owners;

    event AgentMinted(uint256 indexed agentId, address indexed owner);

    error NonexistentAgent(uint256 agentId);

    /// @notice Permissionless mint so demo agents can be provisioned without an admin step.
    function mint(uint256 agentId, address owner_) external {
        _owners[agentId] = owner_;
        emit AgentMinted(agentId, owner_);
    }

    function ownerOf(uint256 agentId) external view returns (address) {
        address owner_ = _owners[agentId];
        if (owner_ == address(0)) revert NonexistentAgent(agentId);
        return owner_;
    }
}
