// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

import {AgentVault} from "./AgentVault.sol";
import {UserUnderwriting} from "./UserUnderwriting.sol";

/// @title PremiumEngine
/// @notice Prices a policy at the moment an agent-to-agent task is about to execute. This is
///         the bilateral part of fedis: one side of the quote is how badly the AGENT has
///         failed in the past, the other is how likely the USER is to fake a claim.
///
///         premium = taskCost x agentRisk x userMultiplier
///
/// @dev PARALLEL EXECUTION: this contract holds no per-task state and writes nothing in the
///      quote path. Every call is a pure read over two already-partitioned mappings, so a
///      thousand simultaneous quotes conflict on nothing at all.
contract PremiumEngine is Ownable {
    uint256 public constant BPS = 10_000;

    /// @notice Premium floor, in USDC (6dp). Without it, rounding takes the premium on a
    ///         sub-cent x402 micro-payment to exactly zero and the policy is free.
    ///         0.001 USDC -- three orders of magnitude under the ~$0.30 card fee that makes
    ///         micro-commerce impossible in the first place.
    uint256 public constant MIN_PREMIUM = 1_000;

    AgentVault public immutable agentVault;
    UserUnderwriting public immutable userUnderwriting;

    event PremiumQuoted(
        bytes32 indexed agentId,
        address indexed user,
        uint256 taskCost,
        uint256 premium,
        uint256 agentRiskBps,
        uint256 multiplierBps
    );

    error ZeroAddress();
    error AgentNotRegistered(bytes32 agentId);

    constructor(address agentVault_, address userUnderwriting_, address owner_) Ownable(owner_) {
        if (agentVault_ == address(0) || userUnderwriting_ == address(0)) revert ZeroAddress();
        agentVault = AgentVault(agentVault_);
        userUnderwriting = UserUnderwriting(userUnderwriting_);
    }

    // ---------------------------------------------------------------------
    // Quoting
    // ---------------------------------------------------------------------

    /// @notice Frozen integration signature. The one call the x402 interceptor makes before
    ///         approving any task.
    /// @param agentId Agent being hired (keccak256 of the agent name).
    /// @param user Buyer whose trust score sets the multiplier.
    /// @param taskCost Task price in USDC (6dp).
    /// @return premium Insurance premium in USDC (6dp), floored at MIN_PREMIUM.
    function calculatePremium(bytes32 agentId, address user, uint256 taskCost)
        external
        view
        returns (uint256 premium)
    {
        (premium,,,) = _quote(agentId, user, taskCost);
    }

    /// @notice Full breakdown, backing the middleware GET /premium endpoint, so the frontend
    ///         can show a user WHY their quote is what it is.
    /// @return premium Total premium in USDC (6dp)
    /// @return multiplierBps User CIBIL multiplier in bps of 1x (2000 = 0.2x, 30000 = 3.0x)
    /// @return agentRiskBps Agent base risk in bps of task cost
    /// @return trustScore User trust score, 0-10000
    function quote(bytes32 agentId, address user, uint256 taskCost)
        external
        view
        returns (uint256 premium, uint256 multiplierBps, uint256 agentRiskBps, uint256 trustScore)
    {
        return _quote(agentId, user, taskCost);
    }

    /// @notice Total the buyer must actually transfer: the task itself plus the policy.
    function quoteTotalCost(bytes32 agentId, address user, uint256 taskCost)
        external
        view
        returns (uint256 total, uint256 premium, uint256 requiredCollateral)
    {
        (premium,,,) = _quote(agentId, user, taskCost);
        total = taskCost + premium;
        // Risky wallets over-collateralize, so LPs are not the ones eating Sybil risk.
        requiredCollateral = (taskCost * userUnderwriting.getCollateralRequirementBps(user)) / BPS;
    }

    function _quote(bytes32 agentId, address user, uint256 taskCost)
        private
        view
        returns (uint256 premium, uint256 multiplierBps, uint256 agentRiskBps, uint256 trustScore)
    {
        if (!agentVault.isRegistered(agentId)) revert AgentNotRegistered(agentId);

        agentRiskBps = agentVault.getAgentRiskBps(agentId);
        trustScore = userUnderwriting.getTrustScore(user);
        multiplierBps = userUnderwriting.getRiskMultiplierBps(user);

        // taskCost x agentRisk x userMultiplier, both factors in bps.
        premium = (taskCost * agentRiskBps * multiplierBps) / (BPS * BPS);
        if (premium < MIN_PREMIUM) premium = MIN_PREMIUM;
    }

    /// @notice Emits the quote used for a task, so the middleware has an on-chain audit trail
    ///         of what was charged and why. Optional -- `calculatePremium` stays free.
    function quoteAndLog(bytes32 agentId, address user, uint256 taskCost) external returns (uint256 premium) {
        uint256 multiplierBps;
        uint256 agentRiskBps;
        (premium, multiplierBps, agentRiskBps,) = _quote(agentId, user, taskCost);
        emit PremiumQuoted(agentId, user, taskCost, premium, agentRiskBps, multiplierBps);
    }
}
