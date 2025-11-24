// Frontend contract configuration (safe to expose)
export const STARS_CONTRACT_ADDRESS = import.meta.env.VITE_STARS_CONTRACT_ADDRESS;
export const CHOPS_CONTRACT_ADDRESS = import.meta.env.VITE_CHOPS_CONTRACT_ADDRESS;
export const CHAIN_ID = Number(import.meta.env.VITE_CHAIN_ID);
export const RPC_URL = import.meta.env.VITE_RPC_URL;

export const STARS_ABI = [
  {
    inputs: [
      { name: "_amount", type: "uint256" },
      { name: "_nonce", type: "uint256" },
      { name: "_deadline", type: "uint256" },
      { name: "_signature", type: "bytes" }
    ],
    name: "claimStars",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [
      { name: "_epoch", type: "uint256" },
      { name: "_rewardAmount", type: "uint256" },
      { name: "_merkleProof", type: "bytes32[]" }
    ],
    name: "claimChops",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [
      { name: "epoch", type: "uint256" },
      { name: "user", type: "address" }
    ],
    name: "hasClaimedChops",
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [
      { name: "user", type: "address" },
      { name: "epoch", type: "uint256" }
    ],
    name: "starsByEpoch",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [],
    name: "currentEpoch",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [{ name: "", type: "uint256" }],
    name: "epochMerkleRoots",
    outputs: [{ name: "", type: "bytes32" }],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [{ name: "user", type: "address" }],
    name: "cooldownRemaining",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [{ name: "account", type: "address" }],
    name: "balanceOf",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [],
    name: "resetEpoch",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [
      { name: "user", type: "address" },
      { name: "epoch", type: "uint256" }
    ],
    name: "getStars",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function"
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: "user", type: "address" },
      { indexed: false, name: "amount", type: "uint256" },
      { indexed: false, name: "epoch", type: "uint256" },
      { indexed: false, name: "nonce", type: "uint256" }
    ],
    name: "StarsClaimed",
    type: "event"
  }
];

export const CHOPS_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
  "function name() view returns (string)"
];
