// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {AgentVault} from "../src/AgentVault.sol";
import {MockUSDC} from "../src/mocks/MockUSDC.sol";
import {MockIdentityRegistry} from "../src/mocks/MockIdentityRegistry.sol";

contract AgentVaultTest is Test {
    AgentVault internal vault;
    MockUSDC internal usdc;
    MockIdentityRegistry internal registry;

    address internal owner = address(0xA11CE);
    address internal middleware = address(0xB0B);
    address internal lp1 = address(0x11);
    address internal lp2 = address(0x22);
    address internal buyer = address(0x33);
    address internal agentOperator = address(0x44);
    address internal treasury = address(0x7EA);

    bytes32 internal constant AGENT_A = keccak256("gpt-researcher-v2");
    bytes32 internal constant AGENT_B = keccak256("claude-summarizer-v1");

    uint256 internal constant USDC_UNIT = 1e6;

    function setUp() public {
        usdc = new MockUSDC();
        registry = new MockIdentityRegistry();

        vm.prank(owner);
        vault = new AgentVault(address(usdc), address(registry), owner);
        vm.prank(owner);
        vault.setAuthorized(middleware, true);

        vault.registerAgent(AGENT_A, agentOperator, 0);
        vault.registerAgent(AGENT_B, agentOperator, 0);

        _fund(lp1, 1_000_000 * USDC_UNIT);
        _fund(lp2, 1_000_000 * USDC_UNIT);
        _fund(middleware, 1_000_000 * USDC_UNIT);
    }

    function _fund(address who, uint256 amount) internal {
        usdc.mint(who, amount);
        vm.prank(who);
        usdc.approve(address(vault), type(uint256).max);
    }

    // -----------------------------------------------------------------
    // Registration + identity
    // -----------------------------------------------------------------

    function test_registrationCreatesAnIsolatedEscrow() public view {
        AgentVault.VaultInfo memory a = vault.getVaultInfo(AGENT_A);
        AgentVault.VaultInfo memory b = vault.getVaultInfo(AGENT_B);

        assertTrue(a.escrow != address(0), "agent A has custody");
        assertTrue(b.escrow != address(0), "agent B has custody");
        assertTrue(a.escrow != b.escrow, "custody must not be shared between agents");
        assertEq(vault.agentCount(), 2);
    }

    function test_cannotRegisterTheSameAgentTwice() public {
        vm.expectRevert(abi.encodeWithSelector(AgentVault.AgentAlreadyRegistered.selector, AGENT_A));
        vault.registerAgent(AGENT_A, agentOperator, 0);
    }

    function test_identityVerifiedAgainstErc8004Registry() public {
        registry.mint(7, agentOperator);
        bytes32 id = keccak256("verified-agent");
        vault.registerAgent(id, agentOperator, 7);

        AgentVault.VaultInfo memory info = vault.getVaultInfo(id);
        assertTrue(info.identityVerified, "registry confirmed the operator");
        assertEq(info.registryAgentId, 7);
    }

    function test_identityMismatchIsRejected() public {
        registry.mint(8, address(0xDEAD));
        vm.expectRevert(
            abi.encodeWithSelector(AgentVault.IdentityMismatch.selector, 8, address(0xDEAD), agentOperator)
        );
        vault.registerAgent(keccak256("impostor"), agentOperator, 8);
    }

    function test_registryWithNoCodeDoesNotBlockRegistration() public {
        // Exactly the Monad testnet situation: the canonical ERC-8004 address
        // (0x8004A1...) has no bytecode there, so `ownerOf` reverts. Registration must
        // still succeed, unverified, on the same code path mainnet uses.
        address canonicalErc8004 = 0x8004A169FB4a3325136EB29fA0ceB6D2e539a432;
        assertEq(canonicalErc8004.code.length, 0, "no code at the registry address here");

        vm.prank(owner);
        vault.setIdentityRegistry(canonicalErc8004);

        bytes32 id = keccak256("testnet-agent");
        vault.registerAgent(id, agentOperator, 42);

        AgentVault.VaultInfo memory info = vault.getVaultInfo(id);
        assertTrue(info.escrow != address(0), "vault opened anyway");
        assertFalse(info.identityVerified, "but flagged as unverified");
        assertEq(info.registryAgentId, 42, "link recorded for later verification");
    }

    // -----------------------------------------------------------------
    // LP flows
    // -----------------------------------------------------------------

    function test_depositMintsSharesAndRoutesCashToTheEscrow() public {
        vm.prank(lp1);
        uint256 shares = vault.deposit(AGENT_A, 1_000 * USDC_UNIT);

        assertEq(shares, 1_000 * USDC_UNIT, "first deposit is 1:1");
        assertEq(vault.sharesOf(AGENT_A, lp1), shares);

        AgentVault.VaultInfo memory info = vault.getVaultInfo(AGENT_A);
        assertEq(info.tvl, 1_000 * USDC_UNIT);
        assertEq(usdc.balanceOf(info.escrow), 1_000 * USDC_UNIT, "cash sits in the agent escrow");
        assertEq(usdc.balanceOf(address(vault)), 0, "router never custodies funds");
    }

    function test_lpsEarnPremiumsProRata() public {
        vm.prank(lp1);
        vault.deposit(AGENT_A, 1_000 * USDC_UNIT);
        vm.prank(lp2);
        vault.deposit(AGENT_A, 1_000 * USDC_UNIT);

        vm.prank(middleware);
        vault.bondWithCoverage(AGENT_A, 100 * USDC_UNIT, 1_000 * USDC_UNIT);

        // 90% of the premium accrues to LPs, split evenly across the two equal positions.
        assertApproxEqAbs(vault.assetsOf(AGENT_A, lp1), 1_045 * USDC_UNIT, 2);
        assertApproxEqAbs(vault.assetsOf(AGENT_A, lp2), 1_045 * USDC_UNIT, 2);

        uint256 before = usdc.balanceOf(lp1);
        uint256 lp1Shares = vault.sharesOf(AGENT_A, lp1);
        vm.prank(lp1);
        uint256 out = vault.withdraw(AGENT_A, lp1Shares);
        assertApproxEqAbs(out, 1_045 * USDC_UNIT, 2, "LP realizes the premium yield");
        assertEq(usdc.balanceOf(lp1) - before, out);
    }

    function test_withdrawRejectsSharesYouDoNotHold() public {
        vm.prank(lp1);
        vault.deposit(AGENT_A, 1_000 * USDC_UNIT);

        vm.expectRevert(
            abi.encodeWithSelector(
                AgentVault.InsufficientShares.selector, 1_000 * USDC_UNIT, 2_000 * USDC_UNIT
            )
        );
        vm.prank(lp1);
        vault.withdraw(AGENT_A, 2_000 * USDC_UNIT);
    }

    function test_vaultSurvivesBeingFullySlashedAndRefunded() public {
        vm.prank(lp1);
        vault.deposit(AGENT_A, 1_000 * USDC_UNIT);

        vm.prank(middleware);
        vault.slash(AGENT_A, buyer, 1_000 * USDC_UNIT);
        assertEq(vault.getVaultInfo(AGENT_A).tvl, 0, "wiped out");

        // A wiped vault must still accept fresh capital rather than bricking on 0/0.
        vm.prank(lp2);
        uint256 shares = vault.deposit(AGENT_A, 500 * USDC_UNIT);
        assertGt(shares, 0);
        assertEq(vault.getVaultInfo(AGENT_A).tvl, 500 * USDC_UNIT);
    }

    // -----------------------------------------------------------------
    // Bonding + the 90/10 split
    // -----------------------------------------------------------------

    function test_bondSplitsNinetyTenAndAccruesFeesPerAgent() public {
        vm.prank(lp1);
        vault.deposit(AGENT_A, 1_000 * USDC_UNIT);

        vm.prank(middleware);
        vault.bondWithCoverage(AGENT_A, 100 * USDC_UNIT, 2_000 * USDC_UNIT);

        AgentVault.VaultInfo memory info = vault.getVaultInfo(AGENT_A);
        assertEq(info.premiumsEarned, 90 * USDC_UNIT, "LPs keep 90%");
        assertEq(info.protocolFees, 10 * USDC_UNIT, "protocol takes 10%, accrued per agent");
        assertEq(info.tvl, 1_090 * USDC_UNIT);
        assertEq(info.jobVolume, 2_000 * USDC_UNIT);
        assertEq(info.jobCount, 1);
    }

    function test_frozenTwoArgBondStillWorks() public {
        vm.prank(lp1);
        vault.deposit(AGENT_A, 1_000 * USDC_UNIT);

        vm.prank(middleware);
        vault.bond(AGENT_A, 50 * USDC_UNIT);

        AgentVault.VaultInfo memory info = vault.getVaultInfo(AGENT_A);
        assertEq(info.premiumsEarned, 45 * USDC_UNIT);
        assertEq(info.jobVolume, 0, "no coverage notional supplied by the frozen signature");
        assertEq(info.jobCount, 1);
    }

    function test_sweepProtocolFeesPaysTreasuryAndClears() public {
        vm.prank(lp1);
        vault.deposit(AGENT_A, 1_000 * USDC_UNIT);
        vm.prank(middleware);
        vault.bondWithCoverage(AGENT_A, 100 * USDC_UNIT, 1_000 * USDC_UNIT);

        vm.prank(owner);
        uint256 swept = vault.sweepProtocolFees(AGENT_A, treasury);

        assertEq(swept, 10 * USDC_UNIT);
        assertEq(usdc.balanceOf(treasury), 10 * USDC_UNIT);
        assertEq(vault.getVaultInfo(AGENT_A).protocolFees, 0);
        assertEq(vault.getVaultInfo(AGENT_A).tvl, 1_090 * USDC_UNIT, "LP capital untouched by the sweep");
    }

    function test_onlyAuthorizedCanBondOrSlash() public {
        vm.expectRevert(abi.encodeWithSelector(AgentVault.NotAuthorized.selector, buyer));
        vm.prank(buyer);
        vault.bond(AGENT_A, 1 * USDC_UNIT);

        vm.expectRevert(abi.encodeWithSelector(AgentVault.NotAuthorized.selector, buyer));
        vm.prank(buyer);
        vault.slash(AGENT_A, buyer, 1 * USDC_UNIT);
    }

    // -----------------------------------------------------------------
    // Slashing
    // -----------------------------------------------------------------

    function test_slashPaysTheBuyerOutOfTheFailingAgentsVault() public {
        vm.prank(lp1);
        vault.deposit(AGENT_A, 1_000 * USDC_UNIT);

        vm.prank(middleware);
        uint256 paid = vault.slash(AGENT_A, buyer, 250 * USDC_UNIT);

        assertEq(paid, 250 * USDC_UNIT);
        assertEq(usdc.balanceOf(buyer), 250 * USDC_UNIT, "buyer made whole");
        assertEq(vault.getVaultInfo(AGENT_A).tvl, 750 * USDC_UNIT, "LPs absorbed the loss");
        assertEq(vault.getVaultInfo(AGENT_A).slashCount, 1);
    }

    function test_slashCapsAtAvailableCapitalInsteadOfReverting() public {
        vm.prank(lp1);
        vault.deposit(AGENT_A, 100 * USDC_UNIT);

        // Aborting here would kill the caller's whole batch; emit the shortfall instead.
        vm.prank(middleware);
        uint256 paid = vault.slash(AGENT_A, buyer, 500 * USDC_UNIT);

        assertEq(paid, 100 * USDC_UNIT, "pays what it can");
        assertEq(vault.getVaultInfo(AGENT_A).tvl, 0);
    }

    function test_slashingOneAgentLeavesTheOtherUntouched() public {
        vm.prank(lp1);
        vault.deposit(AGENT_A, 1_000 * USDC_UNIT);
        vm.prank(lp2);
        vault.deposit(AGENT_B, 1_000 * USDC_UNIT);

        vm.prank(middleware);
        vault.slash(AGENT_A, buyer, 400 * USDC_UNIT);

        AgentVault.VaultInfo memory b = vault.getVaultInfo(AGENT_B);
        assertEq(b.tvl, 1_000 * USDC_UNIT, "isolated vaults: B is not exposed to A");
        assertEq(usdc.balanceOf(b.escrow), 1_000 * USDC_UNIT, "and neither is B's custody");
        assertEq(b.slashCount, 0);
    }

    // -----------------------------------------------------------------
    // Kinked utilization curve
    // -----------------------------------------------------------------

    function test_curveShape() public view {
        assertEq(vault.previewApyAt(0), 200, "2% when idle");
        assertEq(vault.previewApyAt(4_000), 1_100, "11% at half the kink");
        assertEq(vault.previewApyAt(8_000), 2_000, "20% at the 80% kink");
        assertEq(vault.previewApyAt(9_000), 8_500, "steep above the kink");
        assertEq(vault.previewApyAt(10_000), 15_000, "150% at full utilization");
    }

    function test_curveIsMonotonic() public view {
        uint256 prev = 0;
        for (uint256 u = 0; u <= 10_000; u += 250) {
            uint256 apy = vault.previewApyAt(u);
            assertGe(apy, prev, "APY must never fall as utilization rises");
            prev = apy;
        }
    }

    function test_overCapitalizationCrushesYield() public {
        // Thin vault carrying real volume: scarce coverage, high yield.
        vm.prank(lp1);
        vault.deposit(AGENT_A, 1_000 * USDC_UNIT);
        vm.prank(middleware);
        vault.bondWithCoverage(AGENT_A, 10 * USDC_UNIT, 1_000 * USDC_UNIT);
        (, uint256 scarceApy,) = vault.getVaultStats(AGENT_A);

        // Now flood it with capital the agent's job volume does not justify.
        vm.prank(lp2);
        vault.deposit(AGENT_A, 100_000 * USDC_UNIT);
        (, uint256 floodedApy,) = vault.getVaultStats(AGENT_A);

        assertGt(scarceApy, floodedApy, "yield decays as a vault is over-capitalized");
        // 1,000 of coverage against ~101,000 of TVL is ~1% utilization: 222 bps, a hair over
        // the 200 bps floor. Flooding a quiet agent earns you almost nothing.
        assertEq(floodedApy, 222);
        assertLt(floodedApy, 300, "collapsed onto the 2% floor");
    }

    function test_unfundedVaultAdvertisesMaximumYield() public view {
        // Nothing staked on AGENT_B yet: maximum advertised APY is the signal that pulls
        // LPs toward an agent with no coverage at all.
        (uint256 tvl, uint256 apy,) = vault.getVaultStats(AGENT_B);
        assertEq(tvl, 0);
        assertEq(apy, 15_000, "150%");
    }

    // -----------------------------------------------------------------
    // Agent risk pricing
    // -----------------------------------------------------------------

    function test_newAgentPricedAtTheUnprovenFloor() public view {
        assertEq(vault.getAgentRiskBps(AGENT_A), 300, "3% while unproven");
    }

    function test_riskRisesWithTheFailureRate() public {
        vm.prank(lp1);
        vault.deposit(AGENT_A, 100_000 * USDC_UNIT);

        vm.startPrank(middleware);
        for (uint256 i = 0; i < 20; ++i) {
            vault.bondWithCoverage(AGENT_A, 1 * USDC_UNIT, 1_000 * USDC_UNIT);
        }
        uint256 cleanRisk = vault.getAgentRiskBps(AGENT_A);

        // Now the agent starts hallucinating: 4,000 USDC paid out on 20,000 of volume.
        for (uint256 i = 0; i < 4; ++i) {
            vault.slash(AGENT_A, buyer, 1_000 * USDC_UNIT);
        }
        vm.stopPrank();

        uint256 dirtyRisk = vault.getAgentRiskBps(AGENT_A);
        assertGt(dirtyRisk, cleanRisk, "failures make the agent more expensive to insure");
        // failureRate = 4000/20000 = 20% -> 50 + (2000-50)*0.2 = 440 bps
        assertEq(dirtyRisk, 440);
    }

    function test_seasoningFloorHoldsForShortTrackRecords() public {
        vm.prank(lp1);
        vault.deposit(AGENT_A, 100_000 * USDC_UNIT);

        vm.startPrank(middleware);
        for (uint256 i = 0; i < 3; ++i) {
            vault.bondWithCoverage(AGENT_A, 1 * USDC_UNIT, 1_000 * USDC_UNIT);
        }
        vm.stopPrank();

        assertEq(vault.getAgentRiskBps(AGENT_A), 300, "three flawless jobs is not a track record");
    }

    // -----------------------------------------------------------------
    // Solvency
    // -----------------------------------------------------------------

    function testFuzz_escrowAlwaysCoversLiabilities(uint96 deposit_, uint96 premium, uint96 slashAmt) public {
        deposit_ = uint96(bound(deposit_, 1e6, 1_000_000e6));
        premium = uint96(bound(premium, 1e3, 100_000e6));
        slashAmt = uint96(bound(slashAmt, 1e3, 2_000_000e6));

        usdc.mint(lp1, deposit_);
        usdc.mint(middleware, premium);

        vm.prank(lp1);
        vault.deposit(AGENT_A, deposit_);
        vm.prank(middleware);
        vault.bondWithCoverage(AGENT_A, premium, deposit_);
        vm.prank(middleware);
        vault.slash(AGENT_A, buyer, slashAmt);

        AgentVault.VaultInfo memory info = vault.getVaultInfo(AGENT_A);
        assertGe(
            usdc.balanceOf(info.escrow),
            info.tvl + info.protocolFees,
            "escrow must always cover LP capital plus unswept fees"
        );
    }
}
