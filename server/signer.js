import { ethers } from 'ethers';

// Server-side only - accesses private key from environment
const GAME_SIGNER_PRIVATE_KEY = process.env.GAME_SIGNER_PRIVATE_KEY;
const STARS_CONTRACT_ADDRESS = process.env.STARS_CONTRACT_ADDRESS || process.env.VITE_STARS_CONTRACT_ADDRESS;
const CHAIN_ID = Number(process.env.CHAIN_ID || process.env.VITE_CHAIN_ID);

if (!GAME_SIGNER_PRIVATE_KEY) {
  throw new Error('GAME_SIGNER_PRIVATE_KEY not set in environment variables');
}

/**
 * Generate a signature for claiming stars
 * @param {string} userAddress - The user's wallet address
 * @param {number} amount - Number of stars to claim
 * @param {number} nonce - Unique nonce to prevent replay
 * @returns {Object} { signature, nonce, deadline }
 */
export async function generateStarClaimSignature(userAddress, amount, nonce) {
  const wallet = new ethers.Wallet(GAME_SIGNER_PRIVATE_KEY);
  
  // Deadline: 1 hour from now
  const deadline = Math.floor(Date.now() / 1000) + 3600;
  
  // Match contract's hash format exactly
  // keccak256(abi.encodePacked(msg.sender, _amount, _nonce, _deadline, block.chainid, address(this)))
  const messageHash = ethers.solidityPackedKeccak256(
    ['address', 'uint256', 'uint256', 'uint256', 'uint256', 'address'],
    [userAddress, amount, nonce, deadline, CHAIN_ID, STARS_CONTRACT_ADDRESS]
  );
  
  // Sign with Ethereum prefix (contract uses toEthSignedMessageHash and recover)
  const signature = await wallet.signMessage(ethers.getBytes(messageHash));
  
  return {
    signature,
    nonce,
    deadline,
    amount
  };
}

/**
 * Get the game signer address (public, safe to expose)
 */
export function getGameSignerAddress() {
  const wallet = new ethers.Wallet(GAME_SIGNER_PRIVATE_KEY);
  return wallet.address;
}
