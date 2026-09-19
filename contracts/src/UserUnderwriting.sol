// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title UserUnderwriting
/// @notice The buyer side of the Fides bilateral underwriting model: an on-chain CIBIL-style
///         trust score that prices how likely a user is to farm fraudulent disputes against
///         LP capital. High-trust users pay a fraction of the base premium; fresh or punished
///         wallets pay a multiple of it and over-collateralize their tasks.
///
/// @dev PARALLEL EXECUTION: every state write lands in `_records[user]` -- a slot derived from
///      the user address. Two users transacting in the same block never touch the same slot,
///      so the Monad optimistic scheduler commits them simultaneously. There is deliberately
///      no global `totalUsers` / `totalVolume` accumulator: one shared counter would serialize
///      every write in the contract and defeat the entire architecture.
contract UserUnderwriting is Ownable {
    // ---------------------------------------------------------------------
    // Model parameters
    // ---------------------------------------------------------------------

    uint256 public constant BPS = 10_000;

    /// @notice Trust scores live on a 0-10000 scale (shared convention across the stack).
    uint256 public constant MAX_SCORE = 10_000;

    /// @notice Score floor for a wallet with no history. Deliberately below the 2000
    ///         "standard" cutoff so a fresh wallet is always priced as risky.
    uint256 public constant NEW_WALLET_SCORE = 1_000;

    /// @notice Tier cutoffs.
    uint256 public constant HIGH_TRUST_SCORE = 8_000;
    uint256 public constant STANDARD_SCORE = 2_000;

    /// @notice Half-saturation point of the value-weighted curve, in USDC (6dp).
    ///         At `good == SATURATION` the volume factor is exactly 0.5.
    uint256 public constant SATURATION = 5_000e6;

    /// @notice A disputed dollar counts this many times against a good dollar.
    uint256 public constant DISPUTE_WEIGHT = 5;

    /// @notice The Nuclear Penalty: a proven-fraudulent dispute wipes 80% of historical
    ///         trust volume, so the score cannot simply be re-farmed.
    uint256 public constant NUCLEAR_SURVIVING_BPS = 2_000; // keeps 20%

    /// @notice Each strike additionally halves the resulting score.
    uint256 public constant MAX_STRIKE_SHIFT = 10;

    /// @notice Risk multipliers applied to the agent base premium, in bps of 1x.
    uint256 public constant HIGH_TRUST_MULTIPLIER_BPS = 2_000; // 0.2x
    uint256 public constant RISKY_MULTIPLIER_BPS = 30_000; // 3.0x

    /// @notice Task collateral a user must post, in bps of task cost.
    uint256 public constant HIGH_TRUST_COLLATERAL_BPS = 10_000; // 100%
    uint256 public constant RISKY_COLLATERAL_BPS = 15_000; // 150%

    // ---------------------------------------------------------------------
    // Storage
    // ---------------------------------------------------------------------

    struct UserRecord {
        uint256 totalGoodVolume; // USDC notional of tasks completed without dispute
        uint256 totalDisputedVolume; // USDC notional that ended in a dispute
        uint256 maliciousStrikes; // proven-fraudulent disputes
        uint256 tasksCompleted;
        uint256 firstSeen; // block timestamp of first recorded activity
    }

    mapping(address => UserRecord) private _records;

    /// @notice Accounts allowed to write history (the Fides middleware / claims oracle).
    mapping(address => bool) public authorized;

    // ---------------------------------------------------------------------
    // Events
    // ---------------------------------------------------------------------

    event GoodVolumeRecorded(address indexed user, uint256 amount, uint256 newScore);
    event DisputeRecorded(address indexed user, uint256 amount, uint256 newScore);
    event MaliciousDisputeFlagged(
        address indexed user, uint256 volumeWiped, uint256 strikes, uint256 newScore
    );
    event AuthorizationSet(address indexed account, bool allowed);

    // ---------------------------------------------------------------------
    // Errors
    // ---------------------------------------------------------------------

    error NotAuthorized(address caller);
    error ZeroAddress();

    modifier onlyAuthorized() {
        if (!authorized[msg.sender]) revert NotAuthorized(msg.sender);
        _;
    }

    constructor(address owner_) Ownable(owner_) {
        authorized[owner_] = true;
        emit AuthorizationSet(owner_, true);
    }

    // ---------------------------------------------------------------------
    // Admin
    // ---------------------------------------------------------------------

    function setAuthorized(address account, bool allowed) external onlyOwner {
        if (account == address(0)) revert ZeroAddress();
        authorized[account] = allowed;
        emit AuthorizationSet(account, allowed);
    }

    // ---------------------------------------------------------------------
    // History writes (middleware)
    // ---------------------------------------------------------------------

    /// @notice Record a task that settled cleanly. Called after successful delivery.
    function recordGoodVolume(address user, uint256 amount) external onlyAuthorized {
        if (user == address(0)) revert ZeroAddress();
        UserRecord storage r = _records[user];
        if (r.firstSeen == 0) r.firstSeen = block.timestamp;
        r.totalGoodVolume += amount;
        r.tasksCompleted += 1;
        emit GoodVolumeRecorded(user, amount, _score(r));
    }

    /// @notice Record a dispute the user raised that was upheld. Not fraud -- but disputed
    ///         volume still weighs against the score, since it consumed LP capital.
    function recordDispute(address user, uint256 amount) external onlyAuthorized {
        if (user == address(0)) revert ZeroAddress();
        UserRecord storage r = _records[user];
        if (r.firstSeen == 0) r.firstSeen = block.timestamp;
        r.totalDisputedVolume += amount;
        emit DisputeRecorded(user, amount, _score(r));
    }

    /// @notice The Nuclear Penalty. Wipes 80% of historical good volume and adds a strike
    ///         that permanently halves the resulting score. Makes Sybil dispute-farming
    ///         unprofitable: the capital cost of rebuilding trust exceeds the payout.
    function flagMaliciousDispute(address user) external onlyAuthorized {
        if (user == address(0)) revert ZeroAddress();
        UserRecord storage r = _records[user];
        if (r.firstSeen == 0) r.firstSeen = block.timestamp;

        uint256 before = r.totalGoodVolume;
        uint256 surviving = (before * NUCLEAR_SURVIVING_BPS) / BPS;
        r.totalGoodVolume = surviving;
        r.maliciousStrikes += 1;

        emit MaliciousDisputeFlagged(user, before - surviving, r.maliciousStrikes, _score(r));
    }

    // ---------------------------------------------------------------------
    // Views
    // ---------------------------------------------------------------------

    /// @notice The Value-Weighted Exponential Trust Model, on a 0-10000 scale.
    /// @dev score = floor + (max - floor) * volumeFactor * quality, halved once per strike.
    ///      `volumeFactor = good / (good + SATURATION)` is the rational saturation form of
    ///      `1 - e^(-good/k)`: same shape, monotonic, saturating, and cheap enough to sit in
    ///      the hot path of every premium quote without an exp() approximation.
    ///      `quality = good / (good + DISPUTE_WEIGHT * disputed)` is the value-weighted half:
    ///      a large clean history absorbs one dispute, a thin one does not.
    function getTrustScore(address user) external view returns (uint256) {
        return _score(_records[user]);
    }

    function _score(UserRecord storage r) private view returns (uint256) {
        uint256 good = r.totalGoodVolume;
        if (good == 0) {
            // No positive history: floor, still degraded by any strikes on file.
            return _applyStrikes(NEW_WALLET_SCORE, r.maliciousStrikes);
        }

        uint256 volumeFactorBps = (good * BPS) / (good + SATURATION);
        uint256 weightedDisputes = r.totalDisputedVolume * DISPUTE_WEIGHT;
        uint256 qualityBps = (good * BPS) / (good + weightedDisputes);

        uint256 earned = ((MAX_SCORE - NEW_WALLET_SCORE) * volumeFactorBps * qualityBps) / (BPS * BPS);
        return _applyStrikes(NEW_WALLET_SCORE + earned, r.maliciousStrikes);
    }

    function _applyStrikes(uint256 score, uint256 strikes) private pure returns (uint256) {
        if (strikes == 0) return score;
        uint256 shift = strikes > MAX_STRIKE_SHIFT ? MAX_STRIKE_SHIFT : strikes;
        return score >> shift;
    }

    /// @notice 2 = high-trust, 1 = standard, 0 = risky. Mirrors the `tier` field the
    ///         middleware serves on GET /users/:address/trust-score.
    function getTier(address user) external view returns (uint8) {
        return _tier(_score(_records[user]));
    }

    function _tier(uint256 score) private pure returns (uint8) {
        if (score >= HIGH_TRUST_SCORE) return 2;
        if (score >= STANDARD_SCORE) return 1;
        return 0;
    }

    /// @notice CIBIL risk multiplier in bps of 1x: 2000 (0.2x) for high-trust up to
    ///         30000 (3.0x) for new/punished wallets, linear in between.
    function getRiskMultiplierBps(address user) external view returns (uint256) {
        return _multiplier(_score(_records[user]));
    }

    function _multiplier(uint256 score) private pure returns (uint256) {
        if (score >= HIGH_TRUST_SCORE) return HIGH_TRUST_MULTIPLIER_BPS;
        if (score <= STANDARD_SCORE) return RISKY_MULTIPLIER_BPS;
        uint256 span = HIGH_TRUST_SCORE - STANDARD_SCORE;
        uint256 drop = ((RISKY_MULTIPLIER_BPS - HIGH_TRUST_MULTIPLIER_BPS) * (score - STANDARD_SCORE)) / span;
        return RISKY_MULTIPLIER_BPS - drop;
    }

    /// @notice Collateral a user must post as bps of task cost. Risky wallets
    ///         over-collateralize so LPs are not the ones absorbing Sybil risk.
    function getCollateralRequirementBps(address user) external view returns (uint256) {
        return _collateral(_score(_records[user]));
    }

    function _collateral(uint256 score) private pure returns (uint256) {
        if (score >= HIGH_TRUST_SCORE) return HIGH_TRUST_COLLATERAL_BPS;
        if (score <= STANDARD_SCORE) return RISKY_COLLATERAL_BPS;
        uint256 span = HIGH_TRUST_SCORE - STANDARD_SCORE;
        uint256 drop = ((RISKY_COLLATERAL_BPS - HIGH_TRUST_COLLATERAL_BPS) * (score - STANDARD_SCORE)) / span;
        return RISKY_COLLATERAL_BPS - drop;
    }

    /// @notice One-call profile for the middleware GET /users/:address/trust-score endpoint.
    function getUserProfile(address user)
        external
        view
        returns (
            uint256 score,
            uint8 tier,
            uint256 multiplierBps,
            uint256 collateralBps,
            uint256 totalGoodVolume,
            uint256 totalDisputedVolume,
            uint256 maliciousStrikes,
            uint256 tasksCompleted
        )
    {
        UserRecord storage r = _records[user];
        score = _score(r);
        tier = _tier(score);
        multiplierBps = _multiplier(score);
        collateralBps = _collateral(score);
        totalGoodVolume = r.totalGoodVolume;
        totalDisputedVolume = r.totalDisputedVolume;
        maliciousStrikes = r.maliciousStrikes;
        tasksCompleted = r.tasksCompleted;
    }

    function getRecord(address user) external view returns (UserRecord memory) {
        return _records[user];
    }
}
