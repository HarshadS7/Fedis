// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {AgentVault} from "../src/AgentVault.sol";
import {UserUnderwriting} from "../src/UserUnderwriting.sol";
import {PremiumEngine} from "../src/PremiumEngine.sol";
import {MockUSDC} from "../src/mocks/MockUSDC.sol";

/// @notice Fills a fresh deployment with demo state so the LP Terminal has something real to
///         render the moment it points at the chain -- four agents chosen to put every branch
///         of the utilization curve and the risk model on screen at once.
///
/// Usage:
///   forge script script/Seed.s.sol --rpc-url monad_testnet --broadcast
///
/// Env: PRIVATE_KEY (required). Addresses are read from deployments/<chainId>.json.
contract Seed is Script {
    uint256 internal constant USDC_UNIT = 1e6;

    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address me = vm.addr(pk);

        string memory json = vm.readFile(string.concat("deployments/", vm.toString(block.chainid), ".json"));
        AgentVault vault = AgentVault(vm.parseJsonAddress(json, ".agentVault"));
        UserUnderwriting uw = UserUnderwriting(vm.parseJsonAddress(json, ".userUnderwriting"));
        PremiumEngine engine = PremiumEngine(vm.parseJsonAddress(json, ".premiumEngine"));
        MockUSDC usdc = MockUSDC(vm.parseJsonAddress(json, ".usdc"));

        vm.startBroadcast(pk);

        usdc.mint(me, 5_000_000 * USDC_UNIT);
        usdc.approve(address(vault), type(uint256).max);

        // 1. The blue chip: deep book, spotless record, so LP yield has decayed to the floor.
        //    This is the vault the curve is trying to push capital OUT of.
        bytes32 blueChip = keccak256("gpt-researcher-v2");
        vault.registerAgent(blueChip, me, 0);
        vault.deposit(blueChip, 250_000 * USDC_UNIT);
        for (uint256 i = 0; i < 12; ++i) {
            vault.bondFor(blueChip, me, 3 * USDC_UNIT, 2_000 * USDC_UNIT);
        }

        // 2. The workhorse: busy relative to its book, so it sits near the kink and pays well.
        bytes32 workhorse = keccak256("claude-summarizer-v1");
        vault.registerAgent(workhorse, me, 0);
        vault.deposit(workhorse, 40_000 * USDC_UNIT);
        for (uint256 i = 0; i < 16; ++i) {
            vault.bondFor(workhorse, me, 5 * USDC_UNIT, 2_000 * USDC_UNIT);
        }

        // 3. The liability: it hallucinates. Slashes on the record, so its base risk -- and
        //    therefore every premium quoted against it -- is visibly elevated.
        bytes32 flaky = keccak256("flaky-scraper-v0");
        vault.registerAgent(flaky, me, 0);
        vault.deposit(flaky, 30_000 * USDC_UNIT);
        for (uint256 i = 0; i < 14; ++i) {
            vault.bondFor(flaky, me, 20 * USDC_UNIT, 1_000 * USDC_UNIT);
        }
        for (uint256 i = 0; i < 4; ++i) {
            vault.slash(flaky, me, 900 * USDC_UNIT);
        }

        // 4. The newcomer: no capital at all, advertising the 150% ceiling. The whole point of
        //    the kinked curve is that this row is the most attractive one on the dashboard.
        bytes32 newcomer = keccak256("new-translator-v1");
        vault.registerAgent(newcomer, me, 0);

        // Buyer-side history: one wallet earns its way into the high-trust tier, another gets
        // caught farming a fraudulent dispute, so the frontend can show both ends of the band.
        address trusted = vm.addr(uint256(keccak256("fedis.demo.trusted")));
        address fraudster = vm.addr(uint256(keccak256("fedis.demo.fraudster")));

        uw.recordGoodVolume(trusted, 45_000 * USDC_UNIT);
        uw.recordGoodVolume(fraudster, 45_000 * USDC_UNIT);
        uw.flagMaliciousDispute(fraudster);

        vm.stopBroadcast();

        _report(vault, uw, engine, blueChip, workhorse, flaky, newcomer, trusted, fraudster);
    }

    function _report(
        AgentVault vault,
        UserUnderwriting uw,
        PremiumEngine engine,
        bytes32 blueChip,
        bytes32 workhorse,
        bytes32 flaky,
        bytes32 newcomer,
        address trusted,
        address fraudster
    ) internal view {
        console.log("--- vaults (apy / risk in bps) ---");
        _line(vault, "gpt-researcher-v2  ", blueChip);
        _line(vault, "claude-summarizer-v1", workhorse);
        _line(vault, "flaky-scraper-v0   ", flaky);
        _line(vault, "new-translator-v1  ", newcomer);

        console.log("--- buyers ---");
        console.log(
            "trusted   score:", uw.getTrustScore(trusted), "mult bps:", uw.getRiskMultiplierBps(trusted)
        );
        console.log(
            "fraudster score:", uw.getTrustScore(fraudster), "mult bps:", uw.getRiskMultiplierBps(fraudster)
        );

        console.log("--- premium on a $100 task vs flaky-scraper-v0 ---");
        console.log("trusted  :", engine.calculatePremium(flaky, trusted, 100 * USDC_UNIT));
        console.log("fraudster:", engine.calculatePremium(flaky, fraudster, 100 * USDC_UNIT));
    }

    function _line(AgentVault vault, string memory name, bytes32 id) internal view {
        AgentVault.VaultInfo memory v = vault.getVaultInfo(id);
        console.log(name, "tvl:", v.tvl / USDC_UNIT);
        console.log("   util:", v.utilizationBps, "apy:", v.apyBps);
        console.log("   risk:", v.riskBps, "slashes:", v.slashCount);
    }
}
