// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {UserUnderwriting} from "../src/UserUnderwriting.sol";

contract UserUnderwritingTest is Test {
    UserUnderwriting internal uw;

    address internal owner = address(0xA11CE);
    address internal middleware = address(0xB0B);
    address internal alice = address(0xA1);
    address internal mallory = address(0xBAD);

    uint256 internal constant USDC = 1e6;

    function setUp() public {
        vm.prank(owner);
        uw = new UserUnderwriting(owner);
        vm.prank(owner);
        uw.setAuthorized(middleware, true);
    }

    // -----------------------------------------------------------------
    // Baseline
    // -----------------------------------------------------------------

    function test_newWalletIsRiskyByDefault() public view {
        assertEq(uw.getTrustScore(alice), 1_000, "fresh wallet floor");
        assertLt(uw.getTrustScore(alice), 2_000, "must sit under the standard cutoff");
        assertEq(uw.getTier(alice), 0, "risky tier");
        assertEq(uw.getRiskMultiplierBps(alice), 30_000, "3.0x premium");
        assertEq(uw.getCollateralRequirementBps(alice), 15_000, "150% collateral");
    }

    // -----------------------------------------------------------------
    // Earning trust
    // -----------------------------------------------------------------

    function test_scoreClimbsWithGoodVolume() public {
        uint256 prev = uw.getTrustScore(alice);
        uint256[5] memory steps = [uint256(1_000), 5_000, 10_000, 25_000, 50_000];

        for (uint256 i = 0; i < steps.length; ++i) {
            vm.prank(middleware);
            uw.recordGoodVolume(alice, steps[i] * USDC);
            uint256 next = uw.getTrustScore(alice);
            assertGt(next, prev, "score must be monotonic in good volume");
            prev = next;
        }
        assertLe(prev, 10_000, "score stays on the 0-10000 scale");
    }

    function test_halfSaturationPoint() public {
        // At exactly SATURATION the volume factor is 0.5, so half the earnable band is earned.
        uint256 saturation = uw.SATURATION();
        vm.prank(middleware);
        uw.recordGoodVolume(alice, saturation);
        // 1000 + 9000 * 0.5 * 1.0 = 5500
        assertEq(uw.getTrustScore(alice), 5_500);
        assertEq(uw.getTier(alice), 1, "standard tier");
    }

    function test_crossesHighTrustAndPaysMinimumPremium() public {
        vm.prank(middleware);
        uw.recordGoodVolume(alice, 45_000 * USDC);

        // volumeFactor = 45000/(45000+5000) = 0.9 -> 1000 + 9000*0.9 = 9100
        assertEq(uw.getTrustScore(alice), 9_100);
        assertGt(uw.getTrustScore(alice), 8_000, "high-trust threshold");
        assertEq(uw.getTier(alice), 2);
        assertEq(uw.getRiskMultiplierBps(alice), 2_000, "0.2x premium");
        assertEq(uw.getCollateralRequirementBps(alice), 10_000, "no over-collateralization");
    }

    function test_multiplierIsMonotonicAcrossTheBand() public {
        uint256 prevMultiplier = uw.getRiskMultiplierBps(alice);
        for (uint256 i = 0; i < 12; ++i) {
            vm.prank(middleware);
            uw.recordGoodVolume(alice, 4_000 * USDC);
            uint256 m = uw.getRiskMultiplierBps(alice);
            assertLe(m, prevMultiplier, "multiplier must fall as trust rises");
            prevMultiplier = m;
        }
        assertEq(prevMultiplier, 2_000, "bottoms out at 0.2x");
    }

    // -----------------------------------------------------------------
    // Disputes
    // -----------------------------------------------------------------

    function test_disputeDragsScoreDownWeighted() public {
        vm.prank(middleware);
        uw.recordGoodVolume(alice, 45_000 * USDC);
        uint256 clean = uw.getTrustScore(alice);

        vm.prank(middleware);
        uw.recordDispute(alice, 1_000 * USDC);

        assertLt(uw.getTrustScore(alice), clean, "a dispute costs score");
        // quality = 45000/(45000 + 5*1000) = 0.9 -> 1000 + 9000*0.9*0.9 = 8290
        assertEq(uw.getTrustScore(alice), 8_290);
    }

    function test_thinHistoryIsHurtMoreByTheSameDispute() public {
        vm.prank(middleware);
        uw.recordGoodVolume(alice, 45_000 * USDC);
        vm.prank(middleware);
        uw.recordGoodVolume(mallory, 6_000 * USDC);

        uint256 aliceBefore = uw.getTrustScore(alice);
        uint256 malloryBefore = uw.getTrustScore(mallory);

        vm.startPrank(middleware);
        uw.recordDispute(alice, 1_000 * USDC);
        uw.recordDispute(mallory, 1_000 * USDC);
        vm.stopPrank();

        uint256 aliceDrop = aliceBefore - uw.getTrustScore(alice);
        uint256 malloryDrop = malloryBefore - uw.getTrustScore(mallory);
        assertGt(malloryDrop, aliceDrop, "value-weighting: a deep history absorbs a dispute");
    }

    // -----------------------------------------------------------------
    // The Nuclear Penalty
    // -----------------------------------------------------------------

    function test_nuclearPenaltyWipes80PercentAndHalvesScore() public {
        vm.prank(middleware);
        uw.recordGoodVolume(mallory, 45_000 * USDC);
        assertEq(uw.getTrustScore(mallory), 9_100);
        assertEq(uw.getTier(mallory), 2, "high-trust before getting caught");

        vm.prank(middleware);
        uw.flagMaliciousDispute(mallory);

        UserUnderwriting.UserRecord memory r = uw.getRecord(mallory);
        assertEq(r.totalGoodVolume, 9_000 * USDC, "80% of trust volume wiped");
        assertEq(r.maliciousStrikes, 1);

        // volumeFactor = 9000/14000 = 0.6428 -> 1000 + 9000*0.6428 = 6785, halved by the strike
        assertEq(uw.getTrustScore(mallory), 3_392);
        assertEq(uw.getTier(mallory), 1, "knocked out of high-trust");
        assertGt(uw.getRiskMultiplierBps(mallory), 2_000, "no longer gets the cheap rate");
    }

    function test_rebuildingAfterAStrikeCostsFarMoreVolume() public {
        vm.startPrank(middleware);
        uw.recordGoodVolume(mallory, 45_000 * USDC);
        uw.flagMaliciousDispute(mallory);

        // Even pushing total good volume well past the original, the strike still caps them.
        uw.recordGoodVolume(mallory, 100_000 * USDC);
        vm.stopPrank();

        assertLt(uw.getTrustScore(mallory), 8_000, "one strike keeps them out of high-trust");
    }

    function test_repeatedStrikesCompound() public {
        vm.startPrank(middleware);
        uw.recordGoodVolume(mallory, 45_000 * USDC);
        uint256 prev = uw.getTrustScore(mallory);
        for (uint256 i = 0; i < 3; ++i) {
            uw.flagMaliciousDispute(mallory);
            uint256 next = uw.getTrustScore(mallory);
            assertLt(next, prev, "each strike degrades further");
            prev = next;
        }
        vm.stopPrank();
        assertEq(uw.getTier(mallory), 0, "serial fraudster ends up risky");
        assertEq(uw.getRiskMultiplierBps(mallory), 30_000, "back to the 3.0x rate");
    }

    function test_strikeOnAnEmptyWalletStillBites() public {
        vm.prank(middleware);
        uw.flagMaliciousDispute(mallory);
        assertEq(uw.getTrustScore(mallory), 500, "floor halved by the strike");
    }

    // -----------------------------------------------------------------
    // Access control
    // -----------------------------------------------------------------

    function test_unauthorizedCannotWriteHistory() public {
        vm.expectRevert(abi.encodeWithSelector(UserUnderwriting.NotAuthorized.selector, alice));
        vm.prank(alice);
        uw.recordGoodVolume(alice, 1_000_000 * USDC);

        vm.expectRevert(abi.encodeWithSelector(UserUnderwriting.NotAuthorized.selector, alice));
        vm.prank(alice);
        uw.flagMaliciousDispute(mallory);
    }

    function test_onlyOwnerCanAuthorize() public {
        vm.expectRevert();
        vm.prank(alice);
        uw.setAuthorized(alice, true);
    }

    // -----------------------------------------------------------------
    // Invariants
    // -----------------------------------------------------------------

    function testFuzz_scoreAlwaysWithinScale(uint128 good, uint128 disputed, uint8 strikes) public {
        strikes = uint8(bound(strikes, 0, 5));
        vm.startPrank(middleware);
        if (good > 0) uw.recordGoodVolume(alice, good);
        if (disputed > 0) uw.recordDispute(alice, disputed);
        for (uint256 i = 0; i < strikes; ++i) {
            uw.flagMaliciousDispute(alice);
        }
        vm.stopPrank();

        uint256 score = uw.getTrustScore(alice);
        assertLe(score, 10_000, "never exceeds the scale");

        uint256 m = uw.getRiskMultiplierBps(alice);
        assertGe(m, 2_000);
        assertLe(m, 30_000);
    }

    function testFuzz_goodVolumeNeverLowersScore(uint96 a, uint96 b) public {
        vm.assume(a > 0 && b > 0);
        vm.prank(middleware);
        uw.recordGoodVolume(alice, a);
        uint256 first = uw.getTrustScore(alice);

        vm.prank(middleware);
        uw.recordGoodVolume(alice, b);
        assertGe(uw.getTrustScore(alice), first);
    }
}
