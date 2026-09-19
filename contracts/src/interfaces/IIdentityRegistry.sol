// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title IIdentityRegistry
/// @notice Minimal view surface of the ERC-8004 Agent Identity Registry.
/// @dev The canonical registry on Monad mainnet lives at
///      0x8004A169FB4a3325136EB29fA0ceB6D2e539a432 ("AgentIdentity"/"AGENT") and is an
///      ERC-721 keyed by a uint256 agent id. As of this build it has NO bytecode on Monad
///      testnet (chain 10143), which is why `MockIdentityRegistry` exists. Everything Fides
///      needs from the registry is behind this interface, so pointing at the real registry on
///      mainnet is a constructor argument, not a code change.
interface IIdentityRegistry {
    /// @notice Owner of the ERC-8004 agent id. Reverts for an unminted id.
    function ownerOf(uint256 agentId) external view returns (address);
}
