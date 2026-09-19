// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {BondVault} from "../src/BondVault.sol";
import {TaskPolicy} from "../src/TaskPolicy.sol";
import {MockUSDC} from "../src/mocks/MockUSDC.sol";

contract BondVaultTest is Test {
    BondVault internal vault;
    TaskPolicy internal policy;
    MockUSDC internal usdc;

    address internal owner = address(0xA11CE);
    address internal middleware = address(0xB0B);
    address internal router = address(0x2011);
    address internal buyer = address(0x33);
    address internal agentOperator = address(0x44);
    address internal otherBonder = address(0x55);
    address internal stranger = address(0xBAD);

    bytes32 internal constant TASK_A = keccak256("task-a");
    bytes32 internal constant TASK_B = keccak256("task-b");
    bytes32 internal constant AGENT_A = keccak256("gpt-researcher-v2");
    bytes32 internal constant RESULT = keccak256("the-answer-is-42");

    uint256 internal constant USDC_UNIT = 1e6;
    uint256 internal constant PAYMENT = 100 * USDC_UNIT;
    uint256 internal constant BOND = 50 * USDC_UNIT;
    uint256 internal constant MAX_COMP = 200 * USDC_UNIT;

    function setUp() public {
        usdc = new MockUSDC();

        vm.startPrank(owner);
        policy = new TaskPolicy(owner);
        vault = new BondVault(address(usdc), address(policy), owner);
        policy.setAuthorized(middleware, true);
        policy.setAuthorized(address(vault), true);
        vault.setValidationRouter(router);
        vm.stopPrank();

        _fund(agentOperator, 1_000 * USDC_UNIT);
        _fund(otherBonder, 1_000 * USDC_UNIT);
    }

    function _fund(address who, uint256 amount) internal {
        usdc.mint(who, amount);
        vm.prank(who);
        usdc.approve(address(vault), type(uint256).max);
    }

    function _create(bytes32 taskId, uint256 bond, uint256 maxComp) internal {
        vm.prank(middleware);
        policy.createTask(
            taskId,
            AGENT_A,
            buyer,
            PAYMENT,
            bond,
            maxComp,
            block.timestamp + 1 days,
            TaskPolicy.ValidationMethod.SignedAttestation,
            keccak256("params")
        );
    }

    function _createAndBond(bytes32 taskId) internal returns (address escrow) {
        _create(taskId, BOND, MAX_COMP);
        vm.prank(agentOperator);
        escrow = vault.lockBond(taskId);
    }

    function _execute(bytes32 taskId) internal {
        vm.prank(middleware);
        policy.markExecuted(taskId, RESULT);
    }

    // ---------------------------------------------------------------------
    // Locking
    // ---------------------------------------------------------------------

    function test_lockBondMovesCollateralIntoAnIsolatedEscrow() public {
        _create(TASK_A, BOND, MAX_COMP);
        uint256 before = usdc.balanceOf(agentOperator);

        vm.prank(agentOperator);
        address escrow = vault.lockBond(TASK_A);

        assertTrue(escrow != address(0));
        assertEq(usdc.balanceOf(agentOperator), before - BOND);
        assertEq(usdc.balanceOf(escrow), BOND);
        // The invariant the whole custody argument rests on.
        assertEq(usdc.balanceOf(address(vault)), 0, "BondVault must never hold funds itself");

        BondVault.Bond memory b = vault.getBond(TASK_A);
        assertEq(b.escrow, escrow);
        assertEq(b.bondedBy, agentOperator);
        assertEq(b.amount, BOND);
        assertFalse(b.settled);
        assertEq(vault.activeBond(TASK_A), BOND);
        assertEq(vault.escrowBalance(TASK_A), BOND);
    }

    function test_lockBondAdvancesThePolicyToBonded() public {
        _createAndBond(TASK_A);
        assertEq(uint8(policy.getState(TASK_A)), uint8(TaskPolicy.State.Bonded));
    }

    function test_cannotLockTheSameBondTwice() public {
        _createAndBond(TASK_A);
        vm.prank(otherBonder);
        vm.expectRevert(abi.encodeWithSelector(BondVault.BondAlreadyLocked.selector, TASK_A));
        vault.lockBond(TASK_A);
    }

    function test_cannotBondAnUnknownTask() public {
        vm.prank(agentOperator);
        vm.expectRevert(abi.encodeWithSelector(TaskPolicy.TaskDoesNotExist.selector, TASK_B));
        vault.lockBond(TASK_B);
    }

    function test_cannotBondAfterTheDeadlineAndNoMoneyMoves() public {
        _create(TASK_A, BOND, MAX_COMP);
        vm.warp(block.timestamp + 2 days);
        uint256 before = usdc.balanceOf(agentOperator);

        vm.prank(agentOperator);
        vm.expectRevert();
        vault.lockBond(TASK_A);

        assertEq(usdc.balanceOf(agentOperator), before, "funds moved on a failed bond");
    }

    function test_bondingWithoutFundsReverts() public {
        _create(TASK_A, BOND, MAX_COMP);
        vm.startPrank(stranger);
        usdc.approve(address(vault), type(uint256).max);
        vm.expectRevert();
        vault.lockBond(TASK_A);
        vm.stopPrank();
    }

    /// @dev Bonding is open to any payer, and the refund follows the payer. This is the hook
    ///      Phase 4 needs, where an LP underwrites an agent's bond.
    function test_athirdPartyCanPostTheBondAndIsTheOneRefunded() public {
        _create(TASK_A, BOND, MAX_COMP);
        vm.prank(otherBonder);
        vault.lockBond(TASK_A);
        _execute(TASK_A);

        uint256 before = usdc.balanceOf(otherBonder);
        vm.prank(router);
        vault.release(TASK_A);

        assertEq(usdc.balanceOf(otherBonder), before + BOND);
        assertEq(usdc.balanceOf(agentOperator), 1_000 * USDC_UNIT, "operator should be untouched");
    }

    // ---------------------------------------------------------------------
    // Release
    // ---------------------------------------------------------------------

    function test_releaseReturnsTheWholeBond() public {
        address escrow = _createAndBond(TASK_A);
        _execute(TASK_A);
        uint256 before = usdc.balanceOf(agentOperator);

        vm.prank(router);
        vault.release(TASK_A);

        assertEq(usdc.balanceOf(agentOperator), before + BOND);
        assertEq(usdc.balanceOf(escrow), 0);
        assertEq(usdc.balanceOf(buyer), 0);
        assertEq(uint8(policy.getState(TASK_A)), uint8(TaskPolicy.State.Released));
        assertTrue(vault.getBond(TASK_A).settled);
        assertEq(vault.activeBond(TASK_A), 0);
    }

    function test_cannotReleaseTwice() public {
        _createAndBond(TASK_A);
        _execute(TASK_A);
        vm.startPrank(router);
        vault.release(TASK_A);
        vm.expectRevert(abi.encodeWithSelector(BondVault.BondAlreadySettled.selector, TASK_A));
        vault.release(TASK_A);
        vm.stopPrank();
    }

    /// @dev Releasing straight out of `Bonded` would pay an agent that never delivered.
    function test_cannotReleaseATaskThatWasNeverExecuted() public {
        _createAndBond(TASK_A);
        vm.prank(router);
        vm.expectRevert(
            abi.encodeWithSelector(
                TaskPolicy.InvalidStateTransition.selector,
                TASK_A,
                TaskPolicy.State.Bonded,
                TaskPolicy.State.Executed
            )
        );
        vault.release(TASK_A);
    }

    // ---------------------------------------------------------------------
    // Slash
    // ---------------------------------------------------------------------

    function test_slashPaysTheBuyerOutOfTheBond() public {
        address escrow = _createAndBond(TASK_A);
        _execute(TASK_A);

        vm.prank(router);
        uint256 paid = vault.slash(TASK_A);

        assertEq(paid, BOND);
        assertEq(usdc.balanceOf(buyer), BOND);
        assertEq(usdc.balanceOf(escrow), 0);
        assertEq(uint8(policy.getState(TASK_A)), uint8(TaskPolicy.State.Slashed));
        assertEq(vault.activeBond(TASK_A), 0);
    }

    /// @dev The policy promised the buyer a capped remedy, not the whole collateral. An
    ///      over-collateralized agent gets the excess back rather than forfeiting it.
    function test_slashCapsAtMaxCompensationAndRefundsTheRest() public {
        uint256 bigBond = 300 * USDC_UNIT;
        uint256 cap = 120 * USDC_UNIT;
        _create(TASK_A, bigBond, cap);

        vm.prank(agentOperator);
        address escrow = vault.lockBond(TASK_A);
        _execute(TASK_A);

        uint256 bonderBefore = usdc.balanceOf(agentOperator);
        vm.prank(router);
        uint256 paid = vault.slash(TASK_A);

        assertEq(paid, cap, "buyer must not receive more than the committed ceiling");
        assertEq(usdc.balanceOf(buyer), cap);
        assertEq(usdc.balanceOf(agentOperator), bonderBefore + (bigBond - cap), "excess must be refunded");
        assertEq(usdc.balanceOf(escrow), 0, "escrow must be fully drained");
    }

    /// @dev An under-collateralized bond pays what exists rather than reverting; a partially
    ///      compensated buyer is strictly better than a stuck task.
    function test_slashPaysWhatExistsWhenTheBondIsSmallerThanTheCap() public {
        uint256 smallBond = 10 * USDC_UNIT;
        _create(TASK_A, smallBond, MAX_COMP);
        vm.prank(agentOperator);
        vault.lockBond(TASK_A);
        _execute(TASK_A);

        vm.prank(router);
        uint256 paid = vault.slash(TASK_A);

        assertEq(paid, smallBond);
        assertEq(usdc.balanceOf(buyer), smallBond);
    }

    function test_canSlashATaskThatWasBondedButNeverDelivered() public {
        _createAndBond(TASK_A);
        vm.warp(block.timestamp + 2 days);

        vm.prank(router);
        uint256 paid = vault.slash(TASK_A);

        assertEq(paid, BOND);
        assertEq(usdc.balanceOf(buyer), BOND);
        assertEq(uint8(policy.getState(TASK_A)), uint8(TaskPolicy.State.Slashed));
    }

    function test_cannotSlashTwice() public {
        _createAndBond(TASK_A);
        _execute(TASK_A);
        vm.startPrank(router);
        vault.slash(TASK_A);
        vm.expectRevert(abi.encodeWithSelector(BondVault.BondAlreadySettled.selector, TASK_A));
        vault.slash(TASK_A);
        vm.stopPrank();
    }

    /// @dev The invariant that matters most: a task must never both refund the agent and
    ///      compensate the buyer.
    function test_cannotSlashAfterReleasing() public {
        _createAndBond(TASK_A);
        _execute(TASK_A);
        vm.startPrank(router);
        vault.release(TASK_A);
        vm.expectRevert(abi.encodeWithSelector(BondVault.BondAlreadySettled.selector, TASK_A));
        vault.slash(TASK_A);
        vm.stopPrank();
        assertEq(usdc.balanceOf(buyer), 0);
    }

    function test_cannotSettleABondThatWasNeverLocked() public {
        _create(TASK_A, BOND, MAX_COMP);
        vm.startPrank(router);
        vm.expectRevert(abi.encodeWithSelector(BondVault.BondNotLocked.selector, TASK_A));
        vault.release(TASK_A);
        vm.expectRevert(abi.encodeWithSelector(BondVault.BondNotLocked.selector, TASK_A));
        vault.slash(TASK_A);
        vm.stopPrank();
    }

    // ---------------------------------------------------------------------
    // Authorization
    // ---------------------------------------------------------------------

    function test_onlyValidationRouterCanReleaseOrSlash() public {
        _createAndBond(TASK_A);
        _execute(TASK_A);

        bytes memory err = abi.encodeWithSelector(BondVault.NotValidationRouter.selector, stranger);
        vm.startPrank(stranger);
        vm.expectRevert(err);
        vault.release(TASK_A);
        vm.expectRevert(err);
        vault.slash(TASK_A);
        vm.stopPrank();

        // Not even the owner gets to move settled funds.
        vm.startPrank(owner);
        vm.expectRevert(abi.encodeWithSelector(BondVault.NotValidationRouter.selector, owner));
        vault.release(TASK_A);
        vm.stopPrank();
    }

    function test_settlementIsBlockedUntilARouterIsConfigured() public {
        vm.startPrank(owner);
        TaskPolicy p2 = new TaskPolicy(owner);
        BondVault v2 = new BondVault(address(usdc), address(p2), owner);
        p2.setAuthorized(owner, true);
        p2.setAuthorized(address(v2), true);
        p2.createTask(
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
        vm.stopPrank();

        vm.startPrank(agentOperator);
        usdc.approve(address(v2), type(uint256).max);
        v2.lockBond(TASK_A);
        vm.stopPrank();

        vm.prank(router);
        vm.expectRevert(BondVault.ValidationRouterNotSet.selector);
        v2.release(TASK_A);
    }

    function test_onlyOwnerCanSetTheValidationRouter() public {
        vm.prank(stranger);
        vm.expectRevert();
        vault.setValidationRouter(stranger);
    }

    // ---------------------------------------------------------------------
    // Custody isolation -- the Monad claim
    // ---------------------------------------------------------------------

    /// @notice Two tasks, same agent, must get distinct escrow addresses. If they shared
    ///         one, every bond and settlement in the protocol would serialize on a single
    ///         `USDC.balanceOf` slot and the parallelism claim would be false.
    function test_tasksDoNotShareCustody() public {
        address escrowA = _createAndBond(TASK_A);
        address escrowB = _createAndBond(TASK_B);

        assertTrue(escrowA != escrowB, "same-agent tasks shared an escrow");
        assertEq(usdc.balanceOf(escrowA), BOND);
        assertEq(usdc.balanceOf(escrowB), BOND);
        assertEq(usdc.balanceOf(address(vault)), 0);
    }

    function test_settlingOneTaskLeavesTheOthersEscrowUntouched() public {
        address escrowA = _createAndBond(TASK_A);
        address escrowB = _createAndBond(TASK_B);
        _execute(TASK_A);

        vm.prank(router);
        vault.slash(TASK_A);

        assertEq(usdc.balanceOf(escrowA), 0);
        assertEq(usdc.balanceOf(escrowB), BOND, "unrelated task's collateral moved");
        assertEq(vault.activeBond(TASK_B), BOND);
        assertEq(uint8(policy.getState(TASK_B)), uint8(TaskPolicy.State.Bonded));
    }

    /// @notice Settling two independent tasks must touch disjoint storage in both this
    ///         contract and the USDC ledger -- the two layers that would otherwise
    ///         re-serialize the workload.
    /// @dev Independent means independent participants too. Each task is bonded by a
    ///      different wallet, which is how the benchmark must actually fire; see
    ///      `test_aSharedBonderWalletReintroducesContention` for what happens otherwise.
    function test_settlementWritesAreDisjointAcrossTasks() public {
        _create(TASK_A, BOND, MAX_COMP);
        vm.prank(agentOperator);
        vault.lockBond(TASK_A);

        _create(TASK_B, BOND, MAX_COMP);
        vm.prank(otherBonder);
        vault.lockBond(TASK_B);

        _execute(TASK_A);
        _execute(TASK_B);

        vm.startPrank(router);

        vm.record();
        vault.release(TASK_A);
        (, bytes32[] memory vaultWritesA) = vm.accesses(address(vault));
        (, bytes32[] memory usdcWritesA) = vm.accesses(address(usdc));

        vm.record();
        vault.release(TASK_B);
        (, bytes32[] memory vaultWritesB) = vm.accesses(address(vault));
        (, bytes32[] memory usdcWritesB) = vm.accesses(address(usdc));

        vm.stopPrank();

        assertGt(vaultWritesA.length, 0, "expected writes for task A");
        _assertDisjoint(vaultWritesA, vaultWritesB, "BondVault slots collided across tasks");
        _assertDisjoint(usdcWritesA, usdcWritesB, "USDC balance slots collided across tasks");
    }

    /// @notice The limitation the benchmark has to design around, proven rather than
    ///         asserted: partitioning custody per task fixes the protocol's own state and
    ///         the escrow side of the token ledger, but a refund still credits the bonder's
    ///         balance. Two tasks bonded by ONE wallet therefore write that one
    ///         `USDC.balanceOf` slot twice and Monad will re-execute them serially.
    /// @dev This is the bond-side twin of `Integration.t.sol`'s
    ///      `test_aSharedRelayerWalletReintroducesContention`. Person B's benchmark must
    ///      fan out across many funded operator wallets, not bond everything from one.
    function test_aSharedBonderWalletReintroducesContention() public {
        _createAndBond(TASK_A); // both bonded by agentOperator
        _createAndBond(TASK_B);
        _execute(TASK_A);
        _execute(TASK_B);

        vm.startPrank(router);

        vm.record();
        vault.release(TASK_A);
        (, bytes32[] memory usdcWritesA) = vm.accesses(address(usdc));

        vm.record();
        vault.release(TASK_B);
        (, bytes32[] memory usdcWritesB) = vm.accesses(address(usdc));

        vm.stopPrank();

        bool collided = false;
        for (uint256 i = 0; i < usdcWritesA.length && !collided; ++i) {
            for (uint256 j = 0; j < usdcWritesB.length; ++j) {
                if (usdcWritesA[i] == usdcWritesB[j]) {
                    collided = true;
                    break;
                }
            }
        }
        assertTrue(collided, "expected the shared bonder balance to collide");
    }

    function _assertDisjoint(bytes32[] memory a, bytes32[] memory b, string memory reason) internal pure {
        for (uint256 i = 0; i < a.length; ++i) {
            for (uint256 j = 0; j < b.length; ++j) {
                assertTrue(a[i] != b[j], reason);
            }
        }
    }

    // ---------------------------------------------------------------------
    // Fuzz
    // ---------------------------------------------------------------------

    /// @notice However the bond and the cap relate, the escrow always ends empty and the
    ///         buyer never receives more than the ceiling the policy committed to.
    function testFuzz_slashNeverOverpaysAndAlwaysDrainsTheEscrow(uint96 bond, uint96 cap) public {
        bond = uint96(bound(bond, 1, 1_000 * USDC_UNIT));
        cap = uint96(bound(cap, 1, 1_000 * USDC_UNIT));

        _create(TASK_A, bond, cap);
        vm.prank(agentOperator);
        address escrow = vault.lockBond(TASK_A);
        _execute(TASK_A);

        vm.prank(router);
        uint256 paid = vault.slash(TASK_A);

        assertLe(paid, cap, "paid more than the committed ceiling");
        assertLe(paid, bond, "paid more than was ever bonded");
        assertEq(usdc.balanceOf(buyer), paid);
        assertEq(usdc.balanceOf(escrow), 0, "escrow left with a dust balance");
    }
}
