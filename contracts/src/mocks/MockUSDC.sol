// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title MockUSDC
/// @notice 6-decimal test dollar for Monad testnet. Faucet is open so the middleware and
///         frontend demos can fund arbitrary LPs and users without an admin round-trip.
contract MockUSDC is ERC20 {
    constructor() ERC20("Fides USD Coin", "USDC") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
