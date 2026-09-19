// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title TaskPolicy
/// @notice The obligation ledger of Fedis. Before an agent does any paid work, the buyer
///         records what "success" means for this one task -- the payment, the bond the agent
///         must post, the most the buyer can be compensated, the deadline, and a commitment
///         to the validation parameters. Nothing here judges quality; this contract only
///         records the promise and tracks which stage of it the task has reached.
///
/// @dev PARALLEL EXECUTION -- the same discipline as `AgentVault`, applied one level finer.
///
///      `AgentVault` partitions state by agent. That is not enough here: `project_plan.md`
///      claims activity on Agent A / Task 1 never touches the state of unrelated tasks, so
///      the partition unit is the TASK, not the agent. Everything lives in
///      `_policies[taskId]` -- a slot derived from the task id -- which means two tasks run
///      by the SAME agent still write disjoint storage and never make Monad's optimistic
///      scheduler re-execute them serially.
///
///      There is deliberately no task counter, no `totalTasks`, and no array of task ids.
///      Any one of those would be a single slot written by every `createTask` in the
///      protocol, which is exactly the contention this design exists to avoid. Enumeration
///      is the indexer's job: every transition emits an event with `taskId` indexed.
///
/// @dev DOUBLE SETTLEMENT is prevented structurally rather than with a flag. `Settled` is
///      split into two terminal states, `Released` and `Slashed`. Each transition function
///      requires one specific predecessor state, so once a task is terminal there is no
///      function whose guard it can satisfy -- a second settlement reverts with
///      `InvalidStateTransition` carrying the state it actually found.
contract TaskPolicy is Ownable {
    // ---------------------------------------------------------------------
    // Types
    // ---------------------------------------------------------------------

    /// @notice Lifecycle of a protected task.
    /// @dev `project_plan.md` draws this as Created -> Bonded -> Executed -> Settled. The
    ///      terminal `Settled` is represented as two distinct states because the two
    ///      outcomes pay different people, and because splitting them is what makes a
    ///      repeat settlement unrepresentable instead of merely rejected.
    enum State {
        None, // task id never used
        Created, // policy written, no collateral yet
        Bonded, // agent has locked its bond; work may begin
        Executed, // agent submitted a result; awaiting validation
        Released, // terminal: validation passed, bond returned
        Slashed // terminal: validation failed, buyer compensated

    }

    /// @notice How this task's success predicate is checked. Both are deterministic --
    ///         Fedis makes no claim that a model can judge its own output.
    enum ValidationMethod {
        SignedAttestation, // an authorized validator signs a pass/fail attestation
        OracleTolerance // a reported value must fall within a committed tolerance

    }

    struct Policy {
        bytes32 agentId;
        address buyer;
        uint256 paymentAmount;
        uint256 requiredBond;
        uint256 maxCompensation;
        uint256 deadline;
        ValidationMethod validationMethod;
        bytes32 validationDataHash;
        bytes32 resultHash;
        State state;
    }

    // ---------------------------------------------------------------------
    // Storage
    // ---------------------------------------------------------------------

    /// @notice The whole protocol state, partitioned by task id. No global aggregate.
    mapping(bytes32 => Policy) private _policies;

    /// @notice Accounts allowed to drive the lifecycle: the Fides middleware, and the
    ///         `BondVault` / `ValidationRouter` contracts once deployed.
    mapping(address => bool) public authorized;

    // ---------------------------------------------------------------------
    // Events
    // ---------------------------------------------------------------------

    /// @dev Carries the full policy so the middleware and frontend can reconstruct a task
    ///      from logs alone, without a follow-up `getPolicy` call per task.
    event TaskCreated(
        bytes32 indexed taskId,
        bytes32 indexed agentId,
        address indexed buyer,
        uint256 paymentAmount,
        uint256 requiredBond,
        uint256 maxCompensation,
        uint256 deadline,
        ValidationMethod validationMethod,
        bytes32 validationDataHash
    );
    event TaskBonded(bytes32 indexed taskId, bytes32 indexed agentId, uint256 requiredBond);
    event TaskExecuted(bytes32 indexed taskId, bytes32 indexed agentId, bytes32 resultHash);
    event TaskReleased(bytes32 indexed taskId, bytes32 indexed agentId);
    event TaskSlashed(bytes32 indexed taskId, bytes32 indexed agentId);
    event AuthorizationSet(address indexed account, bool allowed);

    // ---------------------------------------------------------------------
    // Errors
    // ---------------------------------------------------------------------

    error NotAuthorized(address caller);
    error TaskAlreadyExists(bytes32 taskId);
    error TaskDoesNotExist(bytes32 taskId);
    /// @param found The state the task is actually in -- the detail that makes a middleware
    ///        bug legible in a trace instead of a bare "revert".
    error InvalidStateTransition(bytes32 taskId, State found, State required);
    error DeadlineInPast(uint256 deadline, uint256 nowTs);
    error DeadlinePassed(bytes32 taskId, uint256 deadline, uint256 nowTs);
    error ZeroTaskId();
    error ZeroAgentId();
    error ZeroAddress();
    error ZeroAmount();

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

    /// @notice Authorize many accounts in one transaction.
    /// @dev Needed for the parallelism benchmark: firing N transactions from one EOA
    ///      serializes them on that account's nonce no matter how well this contract's
    ///      state is partitioned, so the demo fans out across many signers. This is how
    ///      they get authorized without N separate transactions.
    function setAuthorizedBatch(address[] calldata accounts, bool allowed) external onlyOwner {
        for (uint256 i = 0; i < accounts.length; ++i) {
            address account = accounts[i];
            if (account == address(0)) revert ZeroAddress();
            authorized[account] = allowed;
            emit AuthorizationSet(account, allowed);
        }
    }

    // ---------------------------------------------------------------------
    // Lifecycle
    // ---------------------------------------------------------------------

    /// @notice Write the policy for one protected task. This is the moment the obligation
    ///         becomes enforceable; everything after it only moves the task along.
    /// @param taskId Convention across the stack: keccak256 of the middleware's task id.
    /// @param agentId Convention across the stack: keccak256 of the agent name.
    /// @param paymentAmount What the buyer pays for the work (USDC, 6dp). Recorded, not
    ///        custodied -- the payment leg settles over x402, outside this contract.
    /// @param requiredBond Collateral the agent must lock before work may begin (USDC, 6dp).
    /// @param maxCompensation Ceiling on what a slash pays the buyer (USDC, 6dp).
    /// @param validationDataHash Commitment to the off-chain validation parameters. For
    ///        `OracleTolerance` this is keccak256(abi.encode(expectedValue, toleranceBps)),
    ///        so the bar is fixed before the work happens and cannot be moved afterwards.
    function createTask(
        bytes32 taskId,
        bytes32 agentId,
        address buyer,
        uint256 paymentAmount,
        uint256 requiredBond,
        uint256 maxCompensation,
        uint256 deadline,
        ValidationMethod validationMethod,
        bytes32 validationDataHash
    ) external onlyAuthorized {
        if (taskId == bytes32(0)) revert ZeroTaskId();
        if (agentId == bytes32(0)) revert ZeroAgentId();
        if (buyer == address(0)) revert ZeroAddress();
        if (requiredBond == 0) revert ZeroAmount();
        if (maxCompensation == 0) revert ZeroAmount();
        if (deadline <= block.timestamp) revert DeadlineInPast(deadline, block.timestamp);

        Policy storage p = _policies[taskId];
        if (p.state != State.None) revert TaskAlreadyExists(taskId);

        p.agentId = agentId;
        p.buyer = buyer;
        p.paymentAmount = paymentAmount;
        p.requiredBond = requiredBond;
        p.maxCompensation = maxCompensation;
        p.deadline = deadline;
        p.validationMethod = validationMethod;
        p.validationDataHash = validationDataHash;
        p.state = State.Created;

        emit TaskCreated(
            taskId,
            agentId,
            buyer,
            paymentAmount,
            requiredBond,
            maxCompensation,
            deadline,
            validationMethod,
            validationDataHash
        );
    }

    /// @notice Record that the agent's collateral is locked. Called by `BondVault`, which
    ///         moves the money; this contract only records that it happened.
    /// @dev Rejected past the deadline: bonding into an already-expired task would let an
    ///      agent lock collateral it can never clear by working.
    function markBonded(bytes32 taskId) external onlyAuthorized {
        Policy storage p = _requireState(taskId, State.Created);
        if (block.timestamp > p.deadline) revert DeadlinePassed(taskId, p.deadline, block.timestamp);
        p.state = State.Bonded;
        emit TaskBonded(taskId, p.agentId, p.requiredBond);
    }

    /// @notice Record the agent's submitted result and hand the task to validation.
    /// @param resultHash Commitment to the delivered artifact. `ValidationRouter` requires a
    ///        signed attestation to name this same hash, so an attestation about some other
    ///        result cannot be used to settle this task.
    /// @dev Rejected past the deadline -- late delivery is a failure, and letting it through
    ///      here would allow an agent to submit after expiry and still be released.
    function markExecuted(bytes32 taskId, bytes32 resultHash) external onlyAuthorized {
        Policy storage p = _requireState(taskId, State.Bonded);
        if (block.timestamp > p.deadline) revert DeadlinePassed(taskId, p.deadline, block.timestamp);
        p.resultHash = resultHash;
        p.state = State.Executed;
        emit TaskExecuted(taskId, p.agentId, resultHash);
    }

    /// @notice Terminal: validation passed, the bond goes back to the agent.
    function markReleased(bytes32 taskId) external onlyAuthorized {
        Policy storage p = _requireState(taskId, State.Executed);
        p.state = State.Released;
        emit TaskReleased(taskId, p.agentId);
    }

    /// @notice Terminal: validation failed, the buyer is compensated out of the bond.
    /// @dev Reachable from `Executed` (the agent delivered and the result failed the check)
    ///      and from `Bonded` (the agent bonded and never delivered before the deadline).
    ///      Those are the only two states where collateral is at stake.
    function markSlashed(bytes32 taskId) external onlyAuthorized {
        Policy storage p = _policies[taskId];
        if (p.state != State.Bonded && p.state != State.Executed) {
            if (p.state == State.None) revert TaskDoesNotExist(taskId);
            // Report `Executed` as the expected state: it is the ordinary failure path, and
            // the `found` value is what actually tells you what went wrong.
            revert InvalidStateTransition(taskId, p.state, State.Executed);
        }
        p.state = State.Slashed;
        emit TaskSlashed(taskId, p.agentId);
    }

    // ---------------------------------------------------------------------
    // Views
    // ---------------------------------------------------------------------

    function getPolicy(bytes32 taskId) external view returns (Policy memory) {
        Policy memory p = _policies[taskId];
        if (p.state == State.None) revert TaskDoesNotExist(taskId);
        return p;
    }

    /// @notice State of a task, or `State.None` if the id was never used.
    /// @dev Does not revert on an unknown task -- the middleware polls this to decide
    ///      whether a task exists at all.
    function getState(bytes32 taskId) external view returns (State) {
        return _policies[taskId].state;
    }

    function isSettled(bytes32 taskId) external view returns (bool) {
        State s = _policies[taskId].state;
        return s == State.Released || s == State.Slashed;
    }

    /// @notice True once the deadline has passed without the task reaching a terminal state.
    ///         `ValidationRouter` uses this for the no-delivery slash path.
    function isExpired(bytes32 taskId) external view returns (bool) {
        Policy storage p = _policies[taskId];
        if (p.state != State.Bonded && p.state != State.Executed) return false;
        return block.timestamp > p.deadline;
    }

    // ---------------------------------------------------------------------
    // Internal
    // ---------------------------------------------------------------------

    /// @dev Distinguishes "no such task" from "wrong state" so a middleware bug reads
    ///      clearly in a trace rather than both cases looking identical.
    function _requireState(bytes32 taskId, State required) internal view returns (Policy storage p) {
        p = _policies[taskId];
        if (p.state == State.None) revert TaskDoesNotExist(taskId);
        if (p.state != required) revert InvalidStateTransition(taskId, p.state, required);
    }
}
