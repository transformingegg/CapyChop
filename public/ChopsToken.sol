// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/security/Pausable.sol";

/**
 * @title ChopsToken
 * @dev ERC-20 token for "Chops" with 18 decimals.
 * - Mintable by roles (e.g., StarsToken for rewards, Shop for purchases).
 * Additions: Pausable, burn functions, revoke minter, optional supply cap (commented out).
 */
contract ChopsToken is ERC20, AccessControl, Pausable {
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");

    // Optional: Max supply cap (set to 0 for unlimited)
    uint256 public maxSupply = 0; // Change to a value if needed, e.g., 1_000_000 * 10**decimals()

    event MaxSupplySet(uint256 maxSupply);

    constructor(address initialOwner) ERC20("Chops", "CHOPS") {
        _grantRole(DEFAULT_ADMIN_ROLE, initialOwner);
        _grantRole(MINTER_ROLE, initialOwner);
    }

    /**
     * @dev Pause minting.
     */
    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    /**
     * @dev Unpause minting.
     */
    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }

    /**
     * @dev Mint tokens (restricted to minters).
     */
    function mint(address to, uint256 amount) external whenNotPaused {
        require(hasRole(MINTER_ROLE, msg.sender), "Caller is not a minter");
        if (maxSupply > 0) {
            require(totalSupply() + amount <= maxSupply, "Exceeds max supply");
        }
        _mint(to, amount);
    }

    /**
     * @dev Burn tokens from caller.
     */
    function burn(uint256 amount) external {
        _burn(msg.sender, amount);
    }

    /**
     * @dev Burn tokens from another account (with allowance).
     */
    function burnFrom(address account, uint256 amount) external {
        _spendAllowance(account, msg.sender, amount);
        _burn(account, amount);
    }

    /**
     * @dev Revoke minter role.
     */
    function revokeMinter(address account) external onlyRole(DEFAULT_ADMIN_ROLE) {
        revokeRole(MINTER_ROLE, account);
    }

    /**
     * @dev Set max supply (only if not set or to reduce).
     */
    function setMaxSupply(uint256 _maxSupply) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_maxSupply >= totalSupply(), "Cannot set below current supply");
        maxSupply = _maxSupply;
        emit MaxSupplySet(_maxSupply);
    }
}