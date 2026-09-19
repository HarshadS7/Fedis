// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {AgentVault} from "../src/AgentVault.sol";
import {UserUnderwriting} from "../src/UserUnderwriting.sol";
import {PremiumEngine} from "../src/PremiumEngine.sol";
import {MockUSDC} from "../src/mocks/MockUSDC.sol";

contract PremiumEngineTest is Test {
    AgentVault internal vault;
    UserUnderwriting internal uw;
    PremiumEngine internal engine;
    MockUSDC internal usdc;

    address internal owner = address(0xA11CE);
    address internal middleware = address(0xB0B);
    address internal lp = address(0x11);
    address internal veteran = makeAddr("veteran");
    address internal newcomer = makeAddr("newcomer");
    address internal buyer = address(0x33);

    bytes32 internal constant AGENT = keccak256("gpt-researcher-v2");
    uint256 internal constant USDC_UNIT = 1e6;

    function setUp() public {
        usdc = new MockUSDC();

        vm.startPrank(owner);
        vault = new AgentVault(address(usdc), address(0), owner);
        uw = new UserUnderwriting(owner);
        engine = new PremiumEngine(address(vault), address(uw), owner);
        vault.setAuthorized(middleware, true);
        uw.setAuthorized(middleware, true);
        vm.stopPrank();

        vault.registerAgent(AGENT, address(0x44), 0);

        usdc.mint(lp, 1_000_000 * USDC_UNIT);
        vm.prank(lp);
        usdc.approve(address(vault), type(uint256).max);
        vm.prank(lp);
        vault.deposit(AGENT, 100_000 * USDC_UNIT);

        // Give the veteran a real history so they sit in the high-trust tier.
        vm.prank(middleware);
        uw.recordGoodVolume(veteran, 45_000 * USDC_UNIT);
    }

    // -----------------------------------------------------------------
    // The bilateral quote
    // -----------------------------------------------------------------

    function test_newWalletPaysThreeXOnAnUnprovenAgent() public view {
        uint256 taskCost = 100 * USDC_UNIT;
        (uint256 premium, uint256 multiplierBps, uint256 riskBps, uint256 score) =
            engine.quote(AGENT, newcomer, taskCost);

        assertEq(score, 1_000, "fresh wallet");
        assertEq(multiplierBps, 30_000, "3.0x");
        assertEq(riskBps, 300, "unproven agent, 3%");
        // 100 * 3% * 3.0 = 9 USDC
        assertEq(premium, 9 * USDC_UNIT);
    }

    function test_highTrustWalletPaysAFifteenthOfThat() public view {
        uint256 taskCost = 100 * USDC_UNIT;
        (uint256 premium, uint256 multiplierBps,, uint256 score) = engine.quote(AGENT, veteran, taskCost);

        assertEq(score, 9_100, "high-trust");
        assertEq(multiplierBps, 2_000, "0.2x");
        // 100 * 3% * 0.2 = 0.6 USDC -- 15x cheaper than the newcomer for the same task.
        assertEq(premium, 600_000);

        (uint256 newcomerPremium,,,) = engine.quote(AGENT, newcomer, taskCost);
        assertEq(newcomerPremium / premium, 15, "bilateral pricing spread");
    }

    function test_frozenSignatureMatchesTheBreakdown() public view {
        uint256 taskCost = 250 * USDC_UNIT;
        (uint256 fromQuote,,,) = engine.quote(AGENT, veteran, taskCost);
        assertEq(engine.calculatePremium(AGENT, veteran, taskCost), fromQuote);
    }

    function test_premiumScalesLinearlyWithTaskCost() public view {
        uint256 small = engine.calculatePremium(AGENT, newcomer, 100 * USDC_UNIT);
        uint256 large = engine.calculatePremium(AGENT, newcomer, 1_000 * USDC_UNIT);
        assertEq(large, small * 10);
    }

    // -----------------------------------------------------------------
    // Micro-payments -- the x402 case cards cannot serve
    // -----------------------------------------------------------------

    function test_microPaymentsGetANonZeroPremium() public view {
        // A one-cent x402 call. Naive bps math rounds the premium to zero and the policy
        // would be free; the floor keeps it priced.
        uint256 premium = engine.calculatePremium(AGENT, veteran, 10_000); // $0.01
        assertEq(premium, engine.MIN_PREMIUM());
        assertEq(premium, 1_000, "$0.001 -- ~300x under a card's flat fee");
        assertGt(premium, 0);
    }

    function test_theFloorIsWellBelowAFlatCardFee() public view {
        // The pitch: a $0.30 flat fee destroys micro-commerce. Ours is three orders down.
        assertLt(engine.MIN_PREMIUM(), 300_000);
    }

    // -----------------------------------------------------------------
    // Feedback loops
    // -----------------------------------------------------------------

    function test_agentFailuresRepriceEveryOpenQuote() public {
        uint256 taskCost = 100 * USDC_UNIT;
        uint256 before = engine.calculatePremium(AGENT, veteran, taskCost);

        vm.startPrank(middleware);
        for (uint256 i = 0; i < 20; ++i) {
            usdc.mint(middleware, 1 * USDC_UNIT);
            usdc.approve(address(vault), type(uint256).max);
            vault.bondWithCoverage(AGENT, 1 * USDC_UNIT, 1_000 * USDC_UNIT);
        }
        for (uint256 i = 0; i < 5; ++i) {
            vault.slash(AGENT, buyer, 1_000 * USDC_UNIT);
        }
        vm.stopPrank();

        assertGt(engine.calculatePremium(AGENT, veteran, taskCost), before, "risk repriced upward");
    }

    function test_gettingCaughtFrauddingImmediatelyRaisesYourPremium() public {
        uint256 taskCost = 100 * USDC_UNIT;
        uint256 before = engine.calculatePremium(AGENT, veteran, taskCost);

        vm.prank(middleware);
        uw.flagMaliciousDispute(veteran);

        uint256 afterStrike = engine.calculatePremium(AGENT, veteran, taskCost);
        assertGt(afterStrike, before, "the Nuclear Penalty shows up in the very next quote");
    }

    // -----------------------------------------------------------------
    // Collateral + totals
    // -----------------------------------------------------------------

    function test_riskyBuyersMustOverCollateralize() public view {
        uint256 taskCost = 100 * USDC_UNIT;

        (uint256 total, uint256 premium, uint256 collateral) =
            engine.quoteTotalCost(AGENT, newcomer, taskCost);
        assertEq(total, taskCost + premium);
        assertEq(collateral, 150 * USDC_UNIT, "150% from a fresh wallet");

        (,, uint256 vetCollateral) = engine.quoteTotalCost(AGENT, veteran, taskCost);
        assertEq(vetCollateral, 100 * USDC_UNIT, "high-trust posts no excess");
    }

    // -----------------------------------------------------------------
    // Guards
    // -----------------------------------------------------------------

    function test_quotingAnUnregisteredAgentReverts() public {
        bytes32 ghost = keccak256("does-not-exist");
        vm.expectRevert(abi.encodeWithSelector(PremiumEngine.AgentNotRegistered.selector, ghost));
        engine.calculatePremium(ghost, veteran, 100 * USDC_UNIT);
    }

    function test_quoteAndLogEmitsTheAuditTrail() public {
        uint256 taskCost = 100 * USDC_UNIT;
        vm.expectEmit(true, true, false, true);
        emit PremiumEngine.PremiumQuoted(AGENT, veteran, taskCost, 600_000, 300, 2_000);
        engine.quoteAndLog(AGENT, veteran, taskCost);
    }

    function testFuzz_premiumNeverExceedsTaskCost(uint96 taskCost) public view {
        taskCost = uint96(bound(taskCost, 1e6, 1_000_000e6));
        uint256 premium = engine.calculatePremium(AGENT, newcomer, taskCost);
        // Worst case here is 20% agent risk x 3.0x user multiplier = 60% of task cost.
        assertLt(premium, taskCost, "a policy never costs more than the task it insures");
    }
}
