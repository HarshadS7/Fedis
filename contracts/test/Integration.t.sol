// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test, console} from "forge-std/Test.sol";
import {AgentVault} from "../src/AgentVault.sol";
import {UserUnderwriting} from "../src/UserUnderwriting.sol";
import {PremiumEngine} from "../src/PremiumEngine.sol";
import {MockUSDC} from "../src/mocks/MockUSDC.sol";
import {MockIdentityRegistry} from "../src/mocks/MockIdentityRegistry.sol";

/// @notice Full-stack tests: the policy lifecycle the middleware drives end to end, plus the
///         state-isolation proof that the "500 policies in one 600ms block" claim rests on.
contract IntegrationTest is Test {
    AgentVault internal vault;
    UserUnderwriting internal uw;
    PremiumEngine internal engine;
    MockUSDC internal usdc;
    MockIdentityRegistry internal registry;

    address internal owner = makeAddr("owner");
    address internal middleware = makeAddr("middleware");
    address internal lp = makeAddr("lp");
    address internal buyer = makeAddr("buyer");
    address internal operator = makeAddr("operator");

    uint256 internal constant USDC_UNIT = 1e6;

    function setUp() public {
        usdc = new MockUSDC();
        registry = new MockIdentityRegistry();

        vm.startPrank(owner);
        vault = new AgentVault(address(usdc), address(registry), owner);
        uw = new UserUnderwriting(owner);
        engine = new PremiumEngine(address(vault), address(uw), owner);
        vault.setAuthorized(middleware, true);
        uw.setAuthorized(middleware, true);
        vm.stopPrank();

        usdc.mint(lp, 10_000_000 * USDC_UNIT);
        usdc.mint(middleware, 10_000_000 * USDC_UNIT);
        vm.prank(lp);
        usdc.approve(address(vault), type(uint256).max);
        vm.prank(middleware);
        usdc.approve(address(vault), type(uint256).max);
    }

    function _agent(string memory name) internal returns (bytes32 id) {
        id = keccak256(bytes(name));
        vault.registerAgent(id, operator, 0);
    }

    /// @notice A funded buyer wallet that pays its own premiums -- the real x402 flow.
    function _buyer(string memory name) internal returns (address who) {
        who = makeAddr(name);
        usdc.mint(who, 100_000 * USDC_UNIT);
        vm.prank(who);
        usdc.approve(address(vault), type(uint256).max);
    }

    // -----------------------------------------------------------------
    // The happy path the x402 interceptor drives
    // -----------------------------------------------------------------

    function test_fullPolicyLifecycleOnASuccessfulTask() public {
        bytes32 agentId = _agent("gpt-researcher-v2");

        // 1. An LP underwrites the agent.
        vm.prank(lp);
        vault.deposit(agentId, 50_000 * USDC_UNIT);

        // 2. The interceptor pauses an x402 request and prices the policy.
        uint256 taskCost = 200 * USDC_UNIT;
        uint256 premium = engine.calculatePremium(agentId, buyer, taskCost);
        assertGt(premium, 0);

        // 3. Premium is collected and bonded into that agent's vault.
        vm.prank(middleware);
        vault.bondWithCoverage(agentId, premium, taskCost);

        // 4. The task succeeds, so the buyer's trust history grows.
        vm.prank(middleware);
        uw.recordGoodVolume(buyer, taskCost);

        assertGt(uw.getTrustScore(buyer), 1_000, "clean delivery builds trust");
        assertEq(vault.getVaultInfo(agentId).jobVolume, taskCost);

        // 5. The LP is better off: they kept 90% of the premium and paid out nothing.
        assertGt(vault.assetsOf(agentId, lp), 50_000 * USDC_UNIT, "LP earned the premium");
    }

    function test_fullPolicyLifecycleOnAHallucination() public {
        bytes32 agentId = _agent("flaky-agent-v1");

        vm.prank(lp);
        vault.deposit(agentId, 50_000 * USDC_UNIT);

        uint256 taskCost = 200 * USDC_UNIT;
        uint256 premium = engine.calculatePremium(agentId, buyer, taskCost);

        vm.prank(middleware);
        vault.bondWithCoverage(agentId, premium, taskCost);

        // The agent hallucinates. The claim is upheld: the buyer is made whole out of the
        // vault, and the disputed volume is recorded against the buyer's score too.
        uint256 buyerBefore = usdc.balanceOf(buyer);
        vm.startPrank(middleware);
        uint256 paid = vault.slash(agentId, buyer, taskCost);
        uw.recordDispute(buyer, taskCost);
        vm.stopPrank();

        assertEq(paid, taskCost);
        assertEq(usdc.balanceOf(buyer) - buyerBefore, taskCost, "buyer made whole, no KYC, no chargeback");
        assertLt(vault.assetsOf(agentId, lp), 50_000 * USDC_UNIT, "LPs took the loss, as underwritten");
        assertGt(vault.getAgentRiskBps(agentId), 0);
    }

    function test_fraudulentClaimIsPunishedNotPaid() public {
        bytes32 agentId = _agent("honest-agent-v1");

        vm.prank(lp);
        vault.deposit(agentId, 50_000 * USDC_UNIT);

        // A farmer builds a clean history, then tries to steal LP capital with a fake claim.
        vm.prank(middleware);
        uw.recordGoodVolume(buyer, 45_000 * USDC_UNIT);
        assertEq(uw.getTier(buyer), 2, "high-trust going in");

        uint256 tvlBefore = vault.getVaultInfo(agentId).tvl;
        uint256 balanceBefore = usdc.balanceOf(buyer);

        // Claim rejected: no slash, Nuclear Penalty instead.
        vm.prank(middleware);
        uw.flagMaliciousDispute(buyer);

        assertEq(vault.getVaultInfo(agentId).tvl, tvlBefore, "LP capital untouched");
        assertEq(usdc.balanceOf(buyer), balanceBefore, "attacker paid nothing out");
        assertLt(uw.getTier(buyer), 2, "knocked out of high-trust");

        // And the attack is now economically dead: their next policy costs multiples more.
        assertGt(uw.getRiskMultiplierBps(buyer), 2_000);
    }

    // -----------------------------------------------------------------
    // The architectural claim, made checkable
    // -----------------------------------------------------------------

    /// @notice The load-bearing test for the entire "why Monad" pitch.
    ///
    ///         Monad's optimistic scheduler runs transactions in parallel and re-executes any
    ///         pair that touched the same storage slot. So the claim "500 policies clear in
    ///         one block" reduces to a checkable property: two agents' policy transactions
    ///         must write DISJOINT sets of storage slots.
    ///
    ///         This records the actual slots written by a bond+slash against agent A and the
    ///         same against agent B, and asserts the two sets do not intersect -- in the
    ///         AgentVault AND in the USDC ledger, which is the layer a shared-custody design
    ///         would quietly serialize on.
    function test_policyWritesAreDisjointAcrossAgents() public {
        bytes32 agentA = _agent("agent-alpha");
        bytes32 agentB = _agent("agent-beta");

        vm.startPrank(lp);
        vault.deposit(agentA, 10_000 * USDC_UNIT);
        vault.deposit(agentB, 10_000 * USDC_UNIT);
        vm.stopPrank();

        // Each buyer pays their own premium, which is the real x402 flow: the paying agent
        // signs and funds its own policy. See `test_aSharedRelayerWalletReintroducesContention`
        // for what happens if one relayer wallet fronts them all instead.
        address userA = _buyer("userA");
        address userB = _buyer("userB");

        vm.record();
        vm.startPrank(middleware);
        vault.bondFor(agentA, userA, 10 * USDC_UNIT, 1_000 * USDC_UNIT);
        vault.slash(agentA, userA, 100 * USDC_UNIT);
        vm.stopPrank();
        (, bytes32[] memory vaultWritesA) = vm.accesses(address(vault));
        (, bytes32[] memory usdcWritesA) = vm.accesses(address(usdc));

        vm.record();
        vm.startPrank(middleware);
        vault.bondFor(agentB, userB, 10 * USDC_UNIT, 1_000 * USDC_UNIT);
        vault.slash(agentB, userB, 100 * USDC_UNIT);
        vm.stopPrank();
        (, bytes32[] memory vaultWritesB) = vm.accesses(address(vault));
        (, bytes32[] memory usdcWritesB) = vm.accesses(address(usdc));

        assertGt(vaultWritesA.length, 0, "sanity: agent A actually wrote state");
        assertGt(usdcWritesB.length, 0, "sanity: the token ledger actually moved");

        _assertDisjoint(vaultWritesA, vaultWritesB, "AgentVault accounting slots collided");
        _assertDisjoint(usdcWritesA, usdcWritesB, "USDC balance slots collided");

        console.log("AgentVault slots written per agent:", vaultWritesA.length);
        console.log("USDC slots written per agent:      ", usdcWritesA.length);
    }

    /// @notice The counter-example, and a hard constraint on the kill-shot demo script.
    ///
    ///         Isolating vault accounting and vault custody is still not enough if every
    ///         premium is fronted by ONE relayer wallet: all 500 bonds then read-modify-write
    ///         `USDC.balanceOf(relayer)`, and Monad re-executes them serially on that slot
    ///         alone. (The relayer's sequential nonces would serialize them anyway.)
    ///
    ///         So the 500-transaction demo must fire from 500 funded wallets, not one. This
    ///         test pins that requirement down instead of leaving it as folklore.
    function test_aSharedRelayerWalletReintroducesContention() public {
        bytes32 agentA = _agent("relayer-a");
        bytes32 agentB = _agent("relayer-b");

        vm.startPrank(lp);
        vault.deposit(agentA, 10_000 * USDC_UNIT);
        vault.deposit(agentB, 10_000 * USDC_UNIT);
        vm.stopPrank();

        vm.record();
        vm.prank(middleware);
        vault.bondWithCoverage(agentA, 10 * USDC_UNIT, 1_000 * USDC_UNIT);
        (, bytes32[] memory usdcWritesA) = vm.accesses(address(usdc));

        vm.record();
        vm.prank(middleware);
        vault.bondWithCoverage(agentB, 10 * USDC_UNIT, 1_000 * USDC_UNIT);
        (, bytes32[] memory usdcWritesB) = vm.accesses(address(usdc));

        assertTrue(_intersects(usdcWritesA, usdcWritesB), "one payer means one contended slot");

        // The contention is entirely in the token ledger; Fides' own accounting stays clean.
        vm.record();
        vm.prank(middleware);
        vault.slash(agentA, makeAddr("victimA"), 1 * USDC_UNIT);
        (, bytes32[] memory vaultWritesA) = vm.accesses(address(vault));

        vm.record();
        vm.prank(middleware);
        vault.slash(agentB, makeAddr("victimB"), 1 * USDC_UNIT);
        (, bytes32[] memory vaultWritesB) = vm.accesses(address(vault));

        _assertDisjoint(vaultWritesA, vaultWritesB, "AgentVault slots collided");
    }

    /// @notice Same property on the user side: two buyers' trust updates never collide.
    function test_trustWritesAreDisjointAcrossUsers() public {
        address userA = makeAddr("trustA");
        address userB = makeAddr("trustB");

        vm.record();
        vm.prank(middleware);
        uw.recordGoodVolume(userA, 100 * USDC_UNIT);
        (, bytes32[] memory writesA) = vm.accesses(address(uw));

        vm.record();
        vm.prank(middleware);
        uw.recordGoodVolume(userB, 100 * USDC_UNIT);
        (, bytes32[] memory writesB) = vm.accesses(address(uw));

        assertGt(writesA.length, 0);
        _assertDisjoint(writesA, writesB, "UserUnderwriting slots collided");
    }

    /// @notice The contrast case. A shared-custody design -- one address holding every
    ///         agent's USDC -- puts every bond through a single `balanceOf` slot. This shows
    ///         the two agents' escrows really are separate accounts, which is what keeps that
    ///         from happening here.
    function test_agentsDoNotShareCustody() public {
        bytes32 agentA = _agent("custody-a");
        bytes32 agentB = _agent("custody-b");

        address escrowA = vault.getVaultInfo(agentA).escrow;
        address escrowB = vault.getVaultInfo(agentB).escrow;

        assertTrue(escrowA != escrowB, "distinct custody addresses");
        assertTrue(escrowA != address(vault) && escrowB != address(vault), "router holds nothing");

        vm.startPrank(lp);
        vault.deposit(agentA, 1_000 * USDC_UNIT);
        vault.deposit(agentB, 1_000 * USDC_UNIT);
        vm.stopPrank();

        assertEq(usdc.balanceOf(escrowA), 1_000 * USDC_UNIT);
        assertEq(usdc.balanceOf(escrowB), 1_000 * USDC_UNIT);
        assertEq(usdc.balanceOf(address(vault)), 0, "no shared treasury balance exists to contend on");
    }

    // -----------------------------------------------------------------
    // Kill-shot demo: 500 policies
    // -----------------------------------------------------------------

    /// @notice Provisions and exercises the exact workload Person B's `Promise.all()` script
    ///         fires at the chain, and reports the per-transaction gas the demo will pay.
    function test_fiveHundredSimultaneousPolicies() public {
        uint256 n = 500;
        bytes32[] memory ids = new bytes32[](n);

        for (uint256 i = 0; i < n; ++i) {
            ids[i] = keccak256(abi.encodePacked("demo-agent-", i));
            vault.registerAgent(ids[i], operator, 0);
            vm.prank(lp);
            vault.deposit(ids[i], 1_000 * USDC_UNIT);
        }

        uint256 gasBefore = gasleft();
        vm.startPrank(middleware);
        for (uint256 i = 0; i < n; ++i) {
            vault.bondWithCoverage(ids[i], 1 * USDC_UNIT, 100 * USDC_UNIT);
        }
        uint256 bondGas = gasBefore - gasleft();

        gasBefore = gasleft();
        for (uint256 i = 0; i < n; ++i) {
            vault.slash(ids[i], buyer, 10 * USDC_UNIT);
        }
        uint256 slashGas = gasBefore - gasleft();
        vm.stopPrank();

        console.log("bond()  avg gas:", bondGas / n);
        console.log("slash() avg gas:", slashGas / n);
        console.log("500 bond + 500 slash total gas:", bondGas + slashGas);

        // Every policy landed on its own vault, untouched by the other 499.
        for (uint256 i = 0; i < n; ++i) {
            AgentVault.VaultInfo memory info = vault.getVaultInfo(ids[i]);
            assertEq(info.jobCount, 1);
            assertEq(info.slashCount, 1);
            assertEq(info.jobVolume, 100 * USDC_UNIT);
        }
        assertEq(usdc.balanceOf(buyer), n * 10 * USDC_UNIT, "all 500 payouts settled");
        assertEq(vault.agentCount(), n);
    }

    /// @notice Per-transaction cost must not grow with the number of agents in the protocol.
    ///         A shared accumulator would show up here as a rising curve.
    function test_gasPerPolicyIsFlatAsTheProtocolGrows() public {
        uint256 firstBondGas;
        uint256 earlyBondGas;
        uint256 lastBondGas;

        for (uint256 i = 0; i < 200; ++i) {
            bytes32 id = keccak256(abi.encodePacked("scale-agent-", i));
            vault.registerAgent(id, operator, 0);
            vm.prank(lp);
            vault.deposit(id, 1_000 * USDC_UNIT);

            uint256 before = gasleft();
            vm.prank(middleware);
            vault.bondWithCoverage(id, 1 * USDC_UNIT, 100 * USDC_UNIT);
            uint256 used = before - gasleft();

            if (i == 0) firstBondGas = used;
            if (i == 1) earlyBondGas = used;
            if (i == 199) lastBondGas = used;
        }

        console.log("bond() gas, 1st agent:  ", firstBondGas);
        console.log("bond() gas, 2nd agent:  ", earlyBondGas);
        console.log("bond() gas, 200th agent:", lastBondGas);

        // The 1st bond pays cold-slot costs for the payer's balance and allowance that every
        // later bond in this same EVM context finds warm, so it is the outlier. Comparing the
        // 2nd against the 200th isolates the only thing under test: whether adding 198 more
        // agents to the protocol makes a policy more expensive. It does not -- there is no
        // shared accumulator for it to grow against.
        assertApproxEqRel(lastBondGas, earlyBondGas, 0.01e18, "cost per policy must not grow with scale");
        assertLe(lastBondGas, firstBondGas, "and never exceeds the very first policy written");
    }

    // -----------------------------------------------------------------
    // Helpers
    // -----------------------------------------------------------------

    function _assertDisjoint(bytes32[] memory a, bytes32[] memory b, string memory reason) internal pure {
        if (_intersects(a, b)) revert(string.concat(reason, ": shared slot found"));
    }

    function _intersects(bytes32[] memory a, bytes32[] memory b) internal pure returns (bool) {
        for (uint256 i = 0; i < a.length; ++i) {
            for (uint256 j = 0; j < b.length; ++j) {
                if (a[i] == b[j]) return true;
            }
        }
        return false;
    }
}
