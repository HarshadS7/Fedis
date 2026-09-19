// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {AgentVault} from "../src/AgentVault.sol";
import {UserUnderwriting} from "../src/UserUnderwriting.sol";
import {PremiumEngine} from "../src/PremiumEngine.sol";
import {MockUSDC} from "../src/mocks/MockUSDC.sol";
import {MockIdentityRegistry} from "../src/mocks/MockIdentityRegistry.sol";
import {TaskPolicy} from "../src/TaskPolicy.sol";
import {BondVault} from "../src/BondVault.sol";

/// @notice Deploys the full Fides stack and writes `deployments/<chainId>.json` for the
///         middleware and frontend to read.
///
/// Usage:
///   forge script script/Deploy.s.sol --rpc-url monad_testnet --broadcast
///
/// Env:
///   PRIVATE_KEY  (required) deployer key, funded with testnet MON
///   MIDDLEWARE   (optional) address allowed to call bond/slash; defaults to the deployer
///   USDC         (optional) existing settlement token; a MockUSDC is deployed when unset
contract Deploy is Script {
    /// @notice Canonical ERC-8004 Identity Registry. Live on Monad mainnet; NOT deployed on
    ///         Monad testnet, where this script substitutes a MockIdentityRegistry.
    address internal constant ERC8004_IDENTITY_REGISTRY = 0x8004A169FB4a3325136EB29fA0ceB6D2e539a432;

    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(pk);
        address middleware = vm.envOr("MIDDLEWARE", deployer);

        console.log("chain id  :", block.chainid);
        console.log("deployer  :", deployer);
        console.log("middleware:", middleware);

        vm.startBroadcast(pk);

        // --- settlement asset -------------------------------------------------
        address usdc = vm.envOr("USDC", address(0));
        if (usdc == address(0)) {
            usdc = address(new MockUSDC());
            console.log("MockUSDC deployed (open faucet)");
        }

        // --- ERC-8004 identity ------------------------------------------------
        // Use the canonical registry where it actually has bytecode; otherwise stand up a
        // mock so registration still exercises the same code path.
        address registry = ERC8004_IDENTITY_REGISTRY;
        if (registry.code.length == 0) {
            registry = address(new MockIdentityRegistry());
            console.log("No ERC-8004 registry on this chain -> deployed MockIdentityRegistry");
        } else {
            console.log("Using canonical ERC-8004 registry");
        }

        // --- protocol ---------------------------------------------------------
        UserUnderwriting underwriting = new UserUnderwriting(deployer);
        AgentVault vault = new AgentVault(usdc, registry, deployer);
        PremiumEngine engine = new PremiumEngine(address(vault), address(underwriting), deployer);

        // The middleware needs to bond, slash, and write trust history.
        if (middleware != deployer) {
            vault.setAuthorized(middleware, true);
            underwriting.setAuthorized(middleware, true);
        }

        // --- bonded execution (project_plan.md MVP) ---------------------------
        TaskPolicy taskPolicy = new TaskPolicy(deployer);
        BondVault bondVault = new BondVault(usdc, address(taskPolicy), deployer);

        // lockBond() advances the task to Bonded, so the vault must be able to write
        // to the policy state machine.
        taskPolicy.setAuthorized(address(bondVault), true);
        if (middleware != deployer) {
            taskPolicy.setAuthorized(middleware, true);
        }
        // No ValidationRouter yet: until one is deployed, release/slash cannot be called.
        // Point the vault at the middleware so the lifecycle is drivable for the demo.
        bondVault.setValidationRouter(middleware);

        vm.stopBroadcast();

        console.log("");
        console.log("USDC             :", usdc);
        console.log("IdentityRegistry :", registry);
        console.log("UserUnderwriting :", address(underwriting));
        console.log("AgentVault       :", address(vault));
        console.log("PremiumEngine    :", address(engine));
        console.log("TaskPolicy       :", address(taskPolicy));
        console.log("BondVault        :", address(bondVault));

        _write(
            usdc,
            registry,
            address(underwriting),
            address(vault),
            address(engine),
            middleware,
            address(taskPolicy),
            address(bondVault)
        );
    }

    function _write(
        address usdc,
        address registry,
        address underwriting,
        address vault,
        address engine,
        address middleware,
        address taskPolicy,
        address bondVault
    ) internal {
        string memory key = "fides";
        vm.serializeUint(key, "chainId", block.chainid);
        vm.serializeAddress(key, "usdc", usdc);
        vm.serializeAddress(key, "identityRegistry", registry);
        vm.serializeAddress(key, "userUnderwriting", underwriting);
        vm.serializeAddress(key, "agentVault", vault);
        vm.serializeAddress(key, "middleware", middleware);
        vm.serializeAddress(key, "taskPolicy", taskPolicy);
        vm.serializeAddress(key, "bondVault", bondVault);
        string memory json = vm.serializeAddress(key, "premiumEngine", engine);

        string memory path = string.concat("deployments/", vm.toString(block.chainid), ".json");
        vm.writeJson(json, path);
        console.log("");
        console.log("wrote", path);
    }
}
