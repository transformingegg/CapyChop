// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @dev Interface for ChopsToken contract
 */
interface ChopsToken {
    function mint(address to, uint256 amount) external;
}

/**
 * @title StarsToken
 * @dev Contract for "Stars" token (no decimals, whole numbers only).
 * - Epoch-based for weekly resets.
 * - Claim stars with signature from game server (to prevent cheating).
 * - Cooldown on claims (default 6 hours).
 * - Merkle-based chops reward claims for position-based allocation (admin sets merkle root per epoch).
 * - Resets automatically increment epoch; stars appear as 0 in new epoch.
 * - Assumes off-chain leaderboard computation from on-chain stars data.
 * Additions: Pausable, emergency withdraw, additional getters, signature deadline.
 */
contract StarsToken is Ownable, Pausable, ReentrancyGuard {
    using ECDSA for bytes32;
    using MessageHashUtils for bytes32;

    // Epoch tracking
    uint256 public currentEpoch = 1;
    uint256 public lastResetTimestamp;
    uint256 public epochDuration = 7 days; // Configurable by owner

    // Stars balances: address => epoch => stars
    mapping(address => mapping(uint256 => uint256)) public starsByEpoch;

    // Total stars per epoch for reference
    mapping(uint256 => uint256) public totalStarsByEpoch;

    // Cooldown for claiming stars
    uint256 public cooldownHours = 6; // Default 6 hours
    mapping(address => uint256) public lastClaimTime;

    // Signer for star claims (game server address, set by owner)
    address public gameSigner;

    // Used nonces for signatures to prevent replay
    mapping(uint256 => bool) public usedNonces;

    // Merkle roots for chops rewards per epoch (set by admin after computing positions off-chain)
    mapping(uint256 => bytes32) public merkleRoots;

    // Claimed status: epoch => user => claimed
    mapping(uint256 => mapping(address => bool)) public hasClaimedChops;

    // Reference to Chops contract
    ChopsToken public chopsContract;

    // Events
    event StarsClaimed(address indexed user, uint256 amount, uint256 epoch, uint256 nonce);
    event EpochReset(uint256 newEpoch, uint256 timestamp);
    event CooldownSet(uint256 cooldownHours);
    event GameSignerSet(address signer);
    event ChopsContractSet(address chopsAddress);
    event MerkleRootSet(uint256 epoch, bytes32 root);
    event ChopsClaimed(address indexed user, uint256 amount, uint256 epoch);
    event EmergencyWithdraw(address token, uint256 amount);
    event EpochDurationSet(uint256 durationInSeconds);

    constructor(address initialOwner, address _gameSigner) Ownable(initialOwner) {
        require(_gameSigner != address(0), "Invalid signer");
        gameSigner = _gameSigner;
        lastResetTimestamp = block.timestamp;
    }

    /**
     * @dev Pause contract functions.
     */
    function pause() external onlyOwner {
        _pause();
    }

    /**
     * @dev Unpause contract functions.
     */
    function unpause() external onlyOwner {
        _unpause();
    }

    /**
     * @dev Set the Chops contract address.
     */
    function setChopsContract(address _chopsAddress) external onlyOwner {
        require(_chopsAddress != address(0), "Invalid address");
        chopsContract = ChopsToken(_chopsAddress);
        emit ChopsContractSet(_chopsAddress);
    }

    /**
     * @dev Set the game signer address.
     */
    function setGameSigner(address _signer) external onlyOwner {
        require(_signer != address(0), "Invalid signer");
        gameSigner = _signer;
        emit GameSignerSet(_signer);
    }

    /**
     * @dev Set cooldown hours.
     */
    function setCooldownHours(uint256 _hours) external onlyOwner {
        require(_hours > 0, "Cooldown must be at least 1 hour");
        cooldownHours = _hours;
        emit CooldownSet(_hours);
    }

    /**
     * @dev Set epoch duration in seconds.
     */
    function setEpochDuration(uint256 _durationInSeconds) external onlyOwner {
        require(_durationInSeconds > 0, "Duration must be positive");
        epochDuration = _durationInSeconds;
        emit EpochDurationSet(_durationInSeconds);
    }

    /**
     * @dev Set merkle root for an epoch's chops rewards (admin computes off-chain based on positions).
     */
    function setMerkleRoot(uint256 _epoch, bytes32 _root) external onlyOwner {
        merkleRoots[_epoch] = _root;
        emit MerkleRootSet(_epoch, _root);
    }

    /**
     * @dev Claim stars earned from game. Requires signature from game signer.
     * Amount must be whole number (uint256 enforces this).
     * Nonce prevents replay. Deadline prevents stale signatures.
     */
    function claimStars(uint256 _amount, uint256 _nonce, uint256 _deadline, bytes calldata _signature) external nonReentrant whenNotPaused {
        require(_amount > 0, "Amount must be positive");
        require(!usedNonces[_nonce], "Nonce already used");
        require(block.timestamp <= _deadline, "Signature expired");

        uint256 cooldownSeconds = cooldownHours * 3600;
        require(
            lastClaimTime[msg.sender] == 0 || block.timestamp >= lastClaimTime[msg.sender] + cooldownSeconds,
            "Cooldown period not elapsed"
        );

        // Verify signature: hash(user, amount, nonce, deadline, chainId, contractAddress)
        bytes32 messageHash = keccak256(abi.encodePacked(msg.sender, _amount, _nonce, _deadline, block.chainid, address(this)));
        bytes32 ethSignedMessageHash = messageHash.toEthSignedMessageHash();
        address signer = ethSignedMessageHash.recover(_signature);
        require(signer == gameSigner, "Invalid signature");

        usedNonces[_nonce] = true;
        starsByEpoch[msg.sender][currentEpoch] += _amount;
        totalStarsByEpoch[currentEpoch] += _amount;
        lastClaimTime[msg.sender] = block.timestamp;

        emit StarsClaimed(msg.sender, _amount, currentEpoch, _nonce);
    }

    /**
     * @dev Reset epoch (callable by anyone if time elapsed; use automation for production).
     */
    function resetEpoch() external whenNotPaused {
        require(block.timestamp >= lastResetTimestamp + epochDuration, "Epoch duration not elapsed");
        currentEpoch += 1;
        lastResetTimestamp = block.timestamp;
        emit EpochReset(currentEpoch, block.timestamp);
    }

    /**
     * @dev Claim chops rewards for a previous epoch using merkle proof.
     * Can only claim for the immediate previous epoch (one week window).
     * Admin sets merkle root with precomputed rewards based on positions.
     */
    function claimChops(uint256 _epoch, uint256 _rewardAmount, bytes32[] calldata _merkleProof) external nonReentrant whenNotPaused {
        require(_epoch == currentEpoch - 1, "Can only claim for previous epoch");
        require(!hasClaimedChops[_epoch][msg.sender], "Already claimed");
        require(address(chopsContract) != address(0), "Chops contract not set");
        require(starsByEpoch[msg.sender][_epoch] > 0, "No stars in that epoch");

        // Verify merkle proof: leaf = hash(user, rewardAmount)
        bytes32 leaf = keccak256(bytes.concat(keccak256(abi.encode(msg.sender, _rewardAmount))));
        require(MerkleProof.verify(_merkleProof, merkleRoots[_epoch], leaf), "Invalid merkle proof");

        hasClaimedChops[_epoch][msg.sender] = true;
        chopsContract.mint(msg.sender, _rewardAmount);

        emit ChopsClaimed(msg.sender, _rewardAmount, _epoch);
    }

    /**
     * @dev View stars for user in epoch.
     */
    function getStars(address _user, uint256 _epoch) external view returns (uint256) {
        return starsByEpoch[_user][_epoch];
    }

    /**
     * @dev Get remaining cooldown seconds for a user.
     */
    function getCooldownRemaining(address _user) external view returns (uint256) {
        uint256 lastTime = lastClaimTime[_user];
        if (lastTime == 0) return 0;
        uint256 cooldownSec = cooldownHours * 3600;
        uint256 endTime = lastTime + cooldownSec;
        return (block.timestamp >= endTime) ? 0 : (endTime - block.timestamp);
    }

    /**
     * @dev Check if chops are claimable for a user in an epoch.
     */
    function isChopsClaimable(address _user, uint256 _epoch) external view returns (bool) {
        return _epoch == currentEpoch - 1 && !hasClaimedChops[_epoch][_user] && starsByEpoch[_user][_epoch] > 0;
    }

    /**
     * @dev Emergency withdraw for any token or native currency.
     */
    function emergencyWithdraw(address _token, uint256 _amount) external onlyOwner {
        if (_token == address(0)) {
            payable(owner()).transfer(_amount);
        } else {
            IERC20(_token).transfer(owner(), _amount);
        }
        emit EmergencyWithdraw(_token, _amount);
    }
}