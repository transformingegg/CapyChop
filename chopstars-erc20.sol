// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";

/**
 * @dev Interface for ChopsToken contract
 */
interface ChopsToken {
    function mint(address to, uint256 amount) external;
}

/**
 * @title StarsToken
 * @dev ERC-20 compatible "Stars" token (no decimals, whole numbers only).
 * - SOULBOUND: Cannot be transferred (overrides transfer/transferFrom to revert)
 * - Epoch-based for weekly resets - balances reset to 0 when epoch increments
 * - Claim stars with signature from game server (to prevent cheating)
 * - Cooldown on claims (default 1 hour minimum)
 * - Merkle-based chops reward claims for position-based allocation
 * - Block explorer compatible: shows up in wallets and explorers as ERC-20
 */
contract StarsToken is ERC20, Ownable, AccessControl, Pausable, ReentrancyGuard {
    using ECDSA for bytes32;
    using MessageHashUtils for bytes32;

    // Epoch tracking
    uint256 public currentEpoch = 1;
    uint256 public lastResetTimestamp;
    uint256 public epochDuration = 7 days; // Configurable by owner

    // Stars balances: address => epoch => stars
    // We keep epoch-based storage for historical data
    mapping(address => mapping(uint256 => uint256)) public starsByEpoch;

    // Total stars per epoch for reference
    mapping(uint256 => uint256) public totalStarsByEpoch;

    // Cooldown for claiming stars
    uint256 public cooldownHours = 0; // Set to 0 for testing (no cooldown)
    mapping(address => uint256) public lastClaimTime;

    // Signer for star claims (game server address, set by owner)
    address public gameSigner;

    // Nonce tracking per user to prevent replay attacks
    mapping(address => mapping(uint256 => bool)) public usedNonces;

    // Merkle roots for each epoch's reward distribution
    mapping(uint256 => bytes32) public epochMerkleRoots;

    // Track who claimed chops in each epoch
    mapping(uint256 => mapping(address => bool)) public hasClaimedChops;

    // ChopsToken contract address
    ChopsToken public chopsContract;

    // Access control roles
    bytes32 public constant REWARD_MANAGER_ROLE = keccak256("REWARD_MANAGER_ROLE");

    // Events
    event StarsClaimed(address indexed user, uint256 amount, uint256 epoch, uint256 nonce);
    event EpochReset(uint256 newEpoch, uint256 timestamp);
    event MerkleRootSet(uint256 epoch, bytes32 merkleRoot);
    event ChopsClaimed(address indexed user, uint256 epoch, uint256 amount);
    event GameSignerSet(address indexed signer);
    event ChopsContractSet(address indexed chopsContract);
    event EpochDurationSet(uint256 duration);
    event CooldownSet(uint256 cooldownHours);

    constructor(
        address _gameSigner,
        address initialOwner
    ) ERC20("Stars", "STAR") Ownable(initialOwner) {
        require(_gameSigner != address(0), "Invalid signer address");
        gameSigner = _gameSigner;
        
        // Grant reward manager role to game signer for automated Merkle root setting
        _grantRole(REWARD_MANAGER_ROLE, _gameSigner);
        _grantRole(DEFAULT_ADMIN_ROLE, initialOwner);
        lastResetTimestamp = block.timestamp;
    }

    /**
     * @dev Returns 0 decimals (whole stars only)
     */
    function decimals() public pure override returns (uint8) {
        return 0;
    }

    /**
     * @dev SOULBOUND: Transfers are disabled
     */
    function transfer(address, uint256) public pure override returns (bool) {
        revert("Stars are soulbound and cannot be transferred");
    }

    /**
     * @dev SOULBOUND: Transfers are disabled
     */
    function transferFrom(address, address, uint256) public pure override returns (bool) {
        revert("Stars are soulbound and cannot be transferred");
    }

    /**
     * @dev Override balanceOf to return current epoch balance
     * This makes the ERC-20 balance show the user's current epoch stars
     */
    function balanceOf(address account) public view override returns (uint256) {
        return starsByEpoch[account][currentEpoch];
    }

    /**
     * @dev Override totalSupply to return current epoch total
     */
    function totalSupply() public view override returns (uint256) {
        return totalStarsByEpoch[currentEpoch];
    }

    /**
     * @dev Get stars for a specific epoch
     */
    function getStarsForEpoch(address user, uint256 epoch) external view returns (uint256) {
        return starsByEpoch[user][epoch];
    }

    /**
     * @dev Claim stars with a signature from the game server
     * Signature verification prevents cheating
     * Auto-resets epoch if duration has elapsed
     */
    function claimStars(
        uint256 _amount,
        uint256 _nonce,
        uint256 _deadline,
        bytes memory _signature
    ) external whenNotPaused nonReentrant {
        // Auto-reset epoch if duration has elapsed
        _checkAndResetEpoch();

        require(_amount > 0, "Amount must be greater than 0");
        require(block.timestamp <= _deadline, "Signature expired");
        require(!usedNonces[msg.sender][_nonce], "Nonce already used");
        
        // Check cooldown
        require(
            block.timestamp >= lastClaimTime[msg.sender] + (cooldownHours * 1 hours),
            "Cooldown period not elapsed"
        );

        // Verify signature
        bytes32 messageHash = keccak256(
            abi.encodePacked(msg.sender, _amount, _nonce, _deadline, block.chainid, address(this))
        );
        bytes32 ethSignedMessageHash = messageHash.toEthSignedMessageHash();
        address signer = ethSignedMessageHash.recover(_signature);
        require(signer == gameSigner, "Invalid signature");

        // Mark nonce as used
        usedNonces[msg.sender][_nonce] = true;

        // Update balances
        starsByEpoch[msg.sender][currentEpoch] += _amount;
        totalStarsByEpoch[currentEpoch] += _amount;
        lastClaimTime[msg.sender] = block.timestamp;

        // Emit Transfer event for ERC-20 compatibility (mint from zero address)
        emit Transfer(address(0), msg.sender, _amount);
        emit StarsClaimed(msg.sender, _amount, currentEpoch, _nonce);
    }

    /**
     * @dev Internal function to check and reset epoch if needed
     * Called automatically by claimStars and claimChops
     */
    function _checkAndResetEpoch() internal {
        if (block.timestamp >= lastResetTimestamp + epochDuration) {
            currentEpoch++;
            lastResetTimestamp = block.timestamp;
            emit EpochReset(currentEpoch, block.timestamp);
        }
    }

    /**
     * @dev Manual epoch reset (callable by anyone after duration elapsed)
     * Useful for triggering reset without making a claim transaction
     */
    function resetEpoch() external {
        require(
            block.timestamp >= lastResetTimestamp + epochDuration,
            "Epoch duration not elapsed"
        );
        _checkAndResetEpoch();
    }

    /**
     * @dev Set Merkle root for an epoch's rewards
     */
    function setMerkleRoot(uint256 _epoch, bytes32 _merkleRoot) external onlyOwner {
        require(_epoch <= currentEpoch, "Cannot set root for future epoch");
        epochMerkleRoots[_epoch] = _merkleRoot;
        emit MerkleRootSet(_epoch, _merkleRoot);
    }

    /**
     * @dev Set Merkle root for automated reward generation (game signer only)
     */
    function setMerkleRootAutomated(uint256 _epoch, bytes32 _merkleRoot) external onlyRole(REWARD_MANAGER_ROLE) {
        require(_epoch <= currentEpoch, "Cannot set root for future epoch");
        epochMerkleRoots[_epoch] = _merkleRoot;
        emit MerkleRootSet(_epoch, _merkleRoot);
    }

    /**
     * @dev Claim Chops rewards using Merkle proof
     * Auto-resets epoch if duration has elapsed
     */
    function claimChops(
        uint256 _epoch,
        uint256 _rewardAmount,
        bytes32[] calldata _merkleProof
    ) external nonReentrant {
        // Auto-reset epoch if duration has elapsed
        _checkAndResetEpoch();

        require(address(chopsContract) != address(0), "Chops contract not set");
        require(_epoch < currentEpoch, "Cannot claim current epoch");
        require(!hasClaimedChops[_epoch][msg.sender], "Already claimed for this epoch");
        require(epochMerkleRoots[_epoch] != bytes32(0), "Merkle root not set for epoch");

        // Verify Merkle proof
        bytes32 leaf = keccak256(abi.encodePacked(msg.sender, _rewardAmount));
        require(
            MerkleProof.verify(_merkleProof, epochMerkleRoots[_epoch], leaf),
            "Invalid proof"
        );

        hasClaimedChops[_epoch][msg.sender] = true;
        chopsContract.mint(msg.sender, _rewardAmount);

        emit ChopsClaimed(msg.sender, _epoch, _rewardAmount);
    }

    /**
     * @dev Set game signer address (owner only)
     */
    function setGameSigner(address _signer) external onlyOwner {
        require(_signer != address(0), "Invalid signer");
        gameSigner = _signer;
        emit GameSignerSet(_signer);
    }

    /**
     * @dev Set Chops token contract address (owner only)
     */
    function setChopsContract(address _chopsContract) external onlyOwner {
        require(_chopsContract != address(0), "Invalid contract");
        chopsContract = ChopsToken(_chopsContract);
        emit ChopsContractSet(_chopsContract);
    }

    /**
     * @dev Set epoch duration (owner only)
     */
    function setEpochDuration(uint256 _durationInSeconds) external onlyOwner {
        require(_durationInSeconds > 0, "Duration must be positive");
        epochDuration = _durationInSeconds;
        emit EpochDurationSet(_durationInSeconds);
    }

    /**
     * @dev Set cooldown period (owner only, can be 0 for testing)
     */
    function setCooldownHours(uint256 _hours) external onlyOwner {
        cooldownHours = _hours;
        emit CooldownSet(_hours);
    }

    /**
     * @dev Pause contract (emergency use)
     */
    function pause() external onlyOwner {
        _pause();
    }

    /**
     * @dev Unpause contract
     */
    function unpause() external onlyOwner {
        _unpause();
    }

    /**
     * @dev Get current time remaining in epoch
     */
    function timeUntilNextEpoch() external view returns (uint256) {
        uint256 nextResetTime = lastResetTimestamp + epochDuration;
        if (block.timestamp >= nextResetTime) return 0;
        return nextResetTime - block.timestamp;
    }

    /**
     * @dev Get cooldown remaining for a user
     */
    function cooldownRemaining(address user) external view returns (uint256) {
        uint256 nextClaimTime = lastClaimTime[user] + (cooldownHours * 1 hours);
        if (block.timestamp >= nextClaimTime) return 0;
        return nextClaimTime - block.timestamp;
    }
}
