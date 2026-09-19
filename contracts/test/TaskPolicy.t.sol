// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {TaskPolicy} from "../src/TaskPolicy.sol";

contract TaskPolicyTest is Test {
    TaskPolicy internal policy;

    address internal owner = address(0xA11CE);
    address internal middleware = address(0xB0B);
    address internal buyer = address(0x33);
    address internal stranger = address(0xBAD);

    bytes32 internal constant TASK_A = keccak256("task-a");
    bytes32 internal constant TASK_B = keccak256("task-b");
    bytes32 internal constant AGENT_A = keccak256("gpt-researcher-v2");
    bytes32 internal constant AGENT_B = keccak256("claude-summarizer-v1");
    bytes32 internal constant RESULT = keccak256("the-answer-is-42");

    uint256 internal constant USDC_UNIT = 1e6;
    uint256 internal constant PAYMENT = 100 * USDC_UNIT;
    uint256 internal constant BOND = 50 * USDC_UNIT;
    uint256 internal constant MAX_COMP = 200 * USDC_UNIT;

    function setUp() public {
        vm.prank(owner);
        policy = new TaskPolicy(owner);
        vm.prank(owner);
        policy.setAuthorized(middleware, true);
    }

    // ---------------------------------------------------------------------
    // Helpers
    // ---------------------------------------------------------------------

    function _create(bytes32 taskId, bytes32 agentId) internal {
        vm.prank(middleware);
        policy.createTask(
            taskId,
            agentId,
            buyer,
            PAYMENT,
            BOND,
            MAX_COMP,
            block.timestamp + 1 days,
            TaskPolicy.ValidationMethod.SignedAttestation,
            keccak256("validation-params")
        );
    }

    /// @dev Drive a task to `Executed`, the state both settlement paths start from.
    function _createBondExecute(bytes32 taskId) internal {
        _create(taskId, AGENT_A);
        vm.startPrank(middleware);
        policy.markBonded(taskId);
        policy.markExecuted(taskId, RESULT);
        vm.stopPrank();
    }

    // ---------------------------------------------------------------------
    // Creation
    // ---------------------------------------------------------------------

    function test_createTaskStoresTheWholePolicy() public {
        uint256 deadline = block.timestamp + 1 days;
        bytes32 paramsHash = keccak256("validation-params");

        vm.prank(middleware);
        policy.createTask(
            TASK_A,
            AGENT_A,
            buyer,
            PAYMENT,
            BOND,
            MAX_COMP,
            deadline,
            TaskPolicy.ValidationMethod.OracleTolerance,
            paramsHash
        );

        TaskPolicy.Policy memory p = policy.getPolicy(TASK_A);
        assertEq(p.agentId, AGENT_A);
        assertEq(p.buyer, buyer);
        assertEq(p.paymentAmount, PAYMENT);
        assertEq(p.requiredBond, BOND);
        assertEq(p.maxCompensation, MAX_COMP);
        assertEq(p.deadline, deadline);
        assertEq(uint8(p.validationMethod), uint8(TaskPolicy.ValidationMethod.OracleTolerance));
        assertEq(p.validationDataHash, paramsHash);
        assertEq(p.resultHash, bytes32(0));
        assertEq(uint8(p.state), uint8(TaskPolicy.State.Created));
    }

    function test_onlyAuthorizedCanCreateTasks() public {
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(TaskPolicy.NotAuthorized.selector, stranger));
        policy.createTask(
            TASK_A,
            AGENT_A,
            buyer,
            PAYMENT,
            BOND,
            MAX_COMP,
            block.timestamp + 1 days,
            TaskPolicy.ValidationMethod.SignedAttestation,
            bytes32(0)
        );
    }

    function test_cannotCreateTheSameTaskTwice() public {
        _create(TASK_A, AGENT_A);
        vm.prank(middleware);
        vm.expectRevert(abi.encodeWithSelector(TaskPolicy.TaskAlreadyExists.selector, TASK_A));
        policy.createTask(
            TASK_A,
            AGENT_B,
            buyer,
            PAYMENT,
            BOND,
            MAX_COMP,
            block.timestamp + 1 days,
            TaskPolicy.ValidationMethod.SignedAttestation,
            bytes32(0)
        );
    }

    /// @dev A task whose deadline has already passed can never be worked, so it must not be
    ///      creatable -- otherwise an agent could be talked into bonding against it.
    function test_cannotCreateATaskThatIsAlreadyExpired() public {
        vm.warp(1000);
        uint256 staleDeadline = block.timestamp - 1;
        vm.prank(middleware);
        vm.expectRevert(
            abi.encodeWithSelector(TaskPolicy.DeadlineInPast.selector, staleDeadline, block.timestamp)
        );
        policy.createTask(
            TASK_A,
            AGENT_A,
            buyer,
            PAYMENT,
            BOND,
            MAX_COMP,
            staleDeadline,
            TaskPolicy.ValidationMethod.SignedAttestation,
            bytes32(0)
        );
    }

    function test_createTaskRejectsEmptyIdsAndAmounts() public {
        uint256 deadline = block.timestamp + 1 days;
        TaskPolicy.ValidationMethod m = TaskPolicy.ValidationMethod.SignedAttestation;

        vm.startPrank(middleware);

        vm.expectRevert(TaskPolicy.ZeroTaskId.selector);
        policy.createTask(bytes32(0), AGENT_A, buyer, PAYMENT, BOND, MAX_COMP, deadline, m, bytes32(0));

        vm.expectRevert(TaskPolicy.ZeroAgentId.selector);
        policy.createTask(TASK_A, bytes32(0), buyer, PAYMENT, BOND, MAX_COMP, deadline, m, bytes32(0));

        vm.expectRevert(TaskPolicy.ZeroAddress.selector);
        policy.createTask(TASK_A, AGENT_A, address(0), PAYMENT, BOND, MAX_COMP, deadline, m, bytes32(0));

        // A zero bond is a task with no skin in the game -- the entire premise of the
        // protocol -- and a zero compensation cap makes a slash pay the buyer nothing.
        vm.expectRevert(TaskPolicy.ZeroAmount.selector);
        policy.createTask(TASK_A, AGENT_A, buyer, PAYMENT, 0, MAX_COMP, deadline, m, bytes32(0));

        vm.expectRevert(TaskPolicy.ZeroAmount.selector);
        policy.createTask(TASK_A, AGENT_A, buyer, PAYMENT, BOND, 0, deadline, m, bytes32(0));

        vm.stopPrank();
    }

    // ---------------------------------------------------------------------
    // Happy paths
    // ---------------------------------------------------------------------

    function test_fullLifecycleToRelease() public {
        _create(TASK_A, AGENT_A);
        assertEq(uint8(policy.getState(TASK_A)), uint8(TaskPolicy.State.Created));

        vm.startPrank(middleware);
        policy.markBonded(TASK_A);
        assertEq(uint8(policy.getState(TASK_A)), uint8(TaskPolicy.State.Bonded));

        policy.markExecuted(TASK_A, RESULT);
        assertEq(uint8(policy.getState(TASK_A)), uint8(TaskPolicy.State.Executed));
        assertEq(policy.getPolicy(TASK_A).resultHash, RESULT);
        assertFalse(policy.isSettled(TASK_A));

        policy.markReleased(TASK_A);
        vm.stopPrank();

        assertEq(uint8(policy.getState(TASK_A)), uint8(TaskPolicy.State.Released));
        assertTrue(policy.isSettled(TASK_A));
    }

    function test_fullLifecycleToSlash() public {
        _createBondExecute(TASK_A);
        vm.prank(middleware);
        policy.markSlashed(TASK_A);
        assertEq(uint8(policy.getState(TASK_A)), uint8(TaskPolicy.State.Slashed));
        assertTrue(policy.isSettled(TASK_A));
    }

    /// @dev The no-delivery path: the agent bonded, never executed, and the deadline passed.
    function test_canSlashFromBondedWhenTheAgentNeverDelivered() public {
        _create(TASK_A, AGENT_A);
        vm.prank(middleware);
        policy.markBonded(TASK_A);

        vm.warp(block.timestamp + 2 days);
        assertTrue(policy.isExpired(TASK_A));

        vm.prank(middleware);
        policy.markSlashed(TASK_A);
        assertEq(uint8(policy.getState(TASK_A)), uint8(TaskPolicy.State.Slashed));
    }

    function test_transitionsEmitEventsWithIndexedTaskId() public {
        _create(TASK_A, AGENT_A);

        vm.expectEmit(true, true, false, true, address(policy));
        emit TaskPolicy.TaskBonded(TASK_A, AGENT_A, BOND);
        vm.prank(middleware);
        policy.markBonded(TASK_A);

        vm.expectEmit(true, true, false, true, address(policy));
        emit TaskPolicy.TaskExecuted(TASK_A, AGENT_A, RESULT);
        vm.prank(middleware);
        policy.markExecuted(TASK_A, RESULT);

        vm.expectEmit(true, true, false, true, address(policy));
        emit TaskPolicy.TaskReleased(TASK_A, AGENT_A);
        vm.prank(middleware);
        policy.markReleased(TASK_A);
    }

    // ---------------------------------------------------------------------
    // Invalid transitions -- every illegal edge in the state machine
    // ---------------------------------------------------------------------

    function test_cannotBondATaskTwice() public {
        _create(TASK_A, AGENT_A);
        vm.startPrank(middleware);
        policy.markBonded(TASK_A);
        vm.expectRevert(
            abi.encodeWithSelector(
                TaskPolicy.InvalidStateTransition.selector,
                TASK_A,
                TaskPolicy.State.Bonded,
                TaskPolicy.State.Created
            )
        );
        policy.markBonded(TASK_A);
        vm.stopPrank();
    }

    function test_cannotExecuteBeforeBonding() public {
        _create(TASK_A, AGENT_A);
        vm.prank(middleware);
        vm.expectRevert(
            abi.encodeWithSelector(
                TaskPolicy.InvalidStateTransition.selector,
                TASK_A,
                TaskPolicy.State.Created,
                TaskPolicy.State.Bonded
            )
        );
        policy.markExecuted(TASK_A, RESULT);
    }

    function test_cannotReleaseBeforeExecuting() public {
        _create(TASK_A, AGENT_A);
        vm.startPrank(middleware);
        policy.markBonded(TASK_A);
        vm.expectRevert(
            abi.encodeWithSelector(
                TaskPolicy.InvalidStateTransition.selector,
                TASK_A,
                TaskPolicy.State.Bonded,
                TaskPolicy.State.Executed
            )
        );
        policy.markReleased(TASK_A);
        vm.stopPrank();
    }

    function test_cannotSlashATaskThatWasNeverBonded() public {
        _create(TASK_A, AGENT_A);
        vm.prank(middleware);
        vm.expectRevert(
            abi.encodeWithSelector(
                TaskPolicy.InvalidStateTransition.selector,
                TASK_A,
                TaskPolicy.State.Created,
                TaskPolicy.State.Executed
            )
        );
        policy.markSlashed(TASK_A);
    }

    function test_transitionsOnAnUnknownTaskAreDistinguishableFromWrongState() public {
        vm.startPrank(middleware);

        vm.expectRevert(abi.encodeWithSelector(TaskPolicy.TaskDoesNotExist.selector, TASK_B));
        policy.markBonded(TASK_B);

        vm.expectRevert(abi.encodeWithSelector(TaskPolicy.TaskDoesNotExist.selector, TASK_B));
        policy.markExecuted(TASK_B, RESULT);

        vm.expectRevert(abi.encodeWithSelector(TaskPolicy.TaskDoesNotExist.selector, TASK_B));
        policy.markReleased(TASK_B);

        vm.expectRevert(abi.encodeWithSelector(TaskPolicy.TaskDoesNotExist.selector, TASK_B));
        policy.markSlashed(TASK_B);

        vm.stopPrank();

        vm.expectRevert(abi.encodeWithSelector(TaskPolicy.TaskDoesNotExist.selector, TASK_B));
        policy.getPolicy(TASK_B);

        // getState is the one read that tolerates an unknown task: the middleware polls it
        // to find out whether a task exists at all.
        assertEq(uint8(policy.getState(TASK_B)), uint8(TaskPolicy.State.None));
    }

    function test_onlyAuthorizedCanDriveTransitions() public {
        _create(TASK_A, AGENT_A);
        vm.startPrank(stranger);
        bytes memory err = abi.encodeWithSelector(TaskPolicy.NotAuthorized.selector, stranger);

        vm.expectRevert(err);
        policy.markBonded(TASK_A);
        vm.expectRevert(err);
        policy.markExecuted(TASK_A, RESULT);
        vm.expectRevert(err);
        policy.markReleased(TASK_A);
        vm.expectRevert(err);
        policy.markSlashed(TASK_A);

        vm.stopPrank();
    }

    // ---------------------------------------------------------------------
    // Double settlement -- the guarantee the split terminal states buy us
    // ---------------------------------------------------------------------

    function test_cannotReleaseTwice() public {
        _createBondExecute(TASK_A);
        vm.startPrank(middleware);
        policy.markReleased(TASK_A);
        vm.expectRevert(
            abi.encodeWithSelector(
                TaskPolicy.InvalidStateTransition.selector,
                TASK_A,
                TaskPolicy.State.Released,
                TaskPolicy.State.Executed
            )
        );
        policy.markReleased(TASK_A);
        vm.stopPrank();
    }

    function test_cannotSlashTwice() public {
        _createBondExecute(TASK_A);
        vm.startPrank(middleware);
        policy.markSlashed(TASK_A);
        vm.expectRevert(
            abi.encodeWithSelector(
                TaskPolicy.InvalidStateTransition.selector,
                TASK_A,
                TaskPolicy.State.Slashed,
                TaskPolicy.State.Executed
            )
        );
        policy.markSlashed(TASK_A);
        vm.stopPrank();
    }

    /// @dev The one that actually matters: a released task must never also be slashable,
    ///      or the agent gets its bond back AND the buyer gets compensated.
    function test_cannotSlashAfterReleasingOrReleaseAfterSlashing() public {
        _createBondExecute(TASK_A);
        vm.prank(middleware);
        policy.markReleased(TASK_A);
        vm.prank(middleware);
        vm.expectRevert(
            abi.encodeWithSelector(
                TaskPolicy.InvalidStateTransition.selector,
                TASK_A,
                TaskPolicy.State.Released,
                TaskPolicy.State.Executed
            )
        );
        policy.markSlashed(TASK_A);

        _createBondExecute(TASK_B);
        vm.prank(middleware);
        policy.markSlashed(TASK_B);
        vm.prank(middleware);
        vm.expectRevert(
            abi.encodeWithSelector(
                TaskPolicy.InvalidStateTransition.selector,
                TASK_B,
                TaskPolicy.State.Slashed,
                TaskPolicy.State.Executed
            )
        );
        policy.markReleased(TASK_B);
    }

    /// @dev A settled task is frozen: no transition of any kind can move it again.
    function test_terminalStatesAcceptNoFurtherTransitions() public {
        _createBondExecute(TASK_A);
        vm.startPrank(middleware);
        policy.markReleased(TASK_A);

        vm.expectRevert();
        policy.markBonded(TASK_A);
        vm.expectRevert();
        policy.markExecuted(TASK_A, RESULT);
        vm.expectRevert();
        policy.markReleased(TASK_A);
        vm.expectRevert();
        policy.markSlashed(TASK_A);

        vm.stopPrank();
        assertEq(uint8(policy.getState(TASK_A)), uint8(TaskPolicy.State.Released));
    }

    // ---------------------------------------------------------------------
    // Expiry
    // ---------------------------------------------------------------------

    function test_cannotBondAfterTheDeadline() public {
        _create(TASK_A, AGENT_A);
        uint256 deadline = policy.getPolicy(TASK_A).deadline;
        vm.warp(deadline + 1);

        vm.prank(middleware);
        vm.expectRevert(
            abi.encodeWithSelector(TaskPolicy.DeadlinePassed.selector, TASK_A, deadline, block.timestamp)
        );
        policy.markBonded(TASK_A);
    }

    function test_cannotSubmitAResultAfterTheDeadline() public {
        _create(TASK_A, AGENT_A);
        vm.prank(middleware);
        policy.markBonded(TASK_A);

        uint256 deadline = policy.getPolicy(TASK_A).deadline;
        vm.warp(deadline + 1);

        vm.prank(middleware);
        vm.expectRevert(
            abi.encodeWithSelector(TaskPolicy.DeadlinePassed.selector, TASK_A, deadline, block.timestamp)
        );
        policy.markExecuted(TASK_A, RESULT);
    }

    /// @dev Settlement is deliberately NOT deadline-gated. Validation of an on-time delivery
    ///      can legitimately land after the deadline, and locking settlement would strand
    ///      the bond forever.
    function test_settlementStillWorksAfterTheDeadline() public {
        _createBondExecute(TASK_A);
        vm.warp(block.timestamp + 30 days);
        vm.prank(middleware);
        policy.markReleased(TASK_A);
        assertEq(uint8(policy.getState(TASK_A)), uint8(TaskPolicy.State.Released));
    }

    function test_isExpiredOnlyReportsTasksWithCollateralAtStake() public {
        _create(TASK_A, AGENT_A);
        // Created but unbonded: nothing is at stake, so expiry is not interesting.
        vm.warp(block.timestamp + 2 days);
        assertFalse(policy.isExpired(TASK_A));

        _create(TASK_B, AGENT_A);
        vm.prank(middleware);
        policy.markBonded(TASK_B);
        assertFalse(policy.isExpired(TASK_B));
        vm.warp(block.timestamp + 2 days);
        assertTrue(policy.isExpired(TASK_B));

        // Settled tasks are never "expired" -- the money already moved.
        vm.prank(middleware);
        policy.markSlashed(TASK_B);
        assertFalse(policy.isExpired(TASK_B));
    }

    // ---------------------------------------------------------------------
    // Storage isolation -- the Monad claim, at task granularity
    // ---------------------------------------------------------------------

    /// @notice Two tasks run by the SAME agent must not share a storage slot. This is the
    ///         claim `project_plan.md` makes and the one per-agent partitioning alone would
    ///         not satisfy.
    function test_tasksUnderOneAgentWriteDisjointSlots() public {
        _create(TASK_A, AGENT_A);
        _create(TASK_B, AGENT_A);

        vm.startPrank(middleware);

        vm.record();
        policy.markBonded(TASK_A);
        (, bytes32[] memory writesA) = vm.accesses(address(policy));

        vm.record();
        policy.markBonded(TASK_B);
        (, bytes32[] memory writesB) = vm.accesses(address(policy));

        vm.stopPrank();

        assertGt(writesA.length, 0, "expected writes for task A");
        assertGt(writesB.length, 0, "expected writes for task B");
        for (uint256 i = 0; i < writesA.length; ++i) {
            for (uint256 j = 0; j < writesB.length; ++j) {
                assertTrue(writesA[i] != writesB[j], "same-agent tasks collided on a slot");
            }
        }
    }

    function test_settlingOneTaskLeavesAnotherUntouched() public {
        _createBondExecute(TASK_A);
        _create(TASK_B, AGENT_A);

        vm.prank(middleware);
        policy.markSlashed(TASK_A);

        assertEq(uint8(policy.getState(TASK_B)), uint8(TaskPolicy.State.Created));
        TaskPolicy.Policy memory b = policy.getPolicy(TASK_B);
        assertEq(b.requiredBond, BOND);
        assertEq(b.buyer, buyer);
    }

    // ---------------------------------------------------------------------
    // Fuzz
    // ---------------------------------------------------------------------

    /// @dev Whatever ids and amounts go in come back out unchanged: no field aliasing
    ///      between tasks, which is what a shared-slot bug would look like.
    function testFuzz_policiesRoundTripIndependently(
        bytes32 taskId,
        bytes32 agentId,
        uint96 bond,
        uint96 maxComp
    ) public {
        vm.assume(taskId != bytes32(0) && agentId != bytes32(0));
        vm.assume(bond > 0 && maxComp > 0);

        uint256 deadline = block.timestamp + 1 days;
        vm.prank(middleware);
        policy.createTask(
            taskId,
            agentId,
            buyer,
            PAYMENT,
            bond,
            maxComp,
            deadline,
            TaskPolicy.ValidationMethod.SignedAttestation,
            bytes32(0)
        );

        TaskPolicy.Policy memory p = policy.getPolicy(taskId);
        assertEq(p.agentId, agentId);
        assertEq(p.requiredBond, bond);
        assertEq(p.maxCompensation, maxComp);
        assertEq(uint8(p.state), uint8(TaskPolicy.State.Created));
    }
}
