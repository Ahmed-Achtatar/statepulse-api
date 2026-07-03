// SPDX-License-License-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IUSDC {
    function transfer(address to, uint256 value) external returns (bool);
    function transferFrom(address from, address to, uint256 value) external returns (bool);
    function receiveWithAuthorization(
        address from,
        address to,
        uint256 value,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 nonce,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external;
}

contract EscrowRegistry {
    address public owner;
    address public immutable usdc;
    uint256 public constant COMMISSION_BPS = 200; // 2% fee

    struct Bounty {
        address sender;
        address worker;
        uint256 amount;
        uint256 commission;
        uint256 createdAt;
        uint256 duration;
        bool active;
        bool completed;
        bool refunded;
    }

    mapping(bytes32 => Bounty) public bounties;

    event BountyCreated(bytes32 indexed bountyId, address indexed sender, uint256 amount, uint256 duration);
    event BountyCompleted(bytes32 indexed bountyId, address indexed worker, uint256 payout, uint256 commission);
    event BountyRefunded(bytes32 indexed bountyId, address indexed sender, uint256 amount);

    constructor(address _usdc) {
        owner = msg.sender;
        usdc = _usdc;
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner");
        _;
    }

    function depositBounty(
        address sender,
        uint256 amount,
        uint256 validBefore,
        bytes32 nonce,
        uint8 v,
        bytes32 r,
        bytes32 s,
        bytes32 bountyId,
        uint256 duration
    ) external {
        require(!bounties[bountyId].active, "Bounty already exists");
        require(amount > 0, "Amount must be > 0");

        // Pull USDC directly using EIP-3009 receiveWithAuthorization
        IUSDC(usdc).receiveWithAuthorization(
            sender,
            address(this),
            amount,
            0, // validAfter
            validBefore,
            nonce,
            v,
            r,
            s
        );

        uint256 commission = (amount * COMMISSION_BPS) / 10000;

        bounties[bountyId] = Bounty({
            sender: sender,
            worker: address(0),
            amount: amount,
            commission: commission,
            createdAt: block.timestamp,
            duration: duration,
            active: true,
            completed: false,
            refunded: false
        });

        emit BountyCreated(bountyId, sender, amount, duration);
    }

    function releaseBounty(bytes32 bountyId, address worker) external onlyOwner {
        Bounty storage bounty = bounties[bountyId];
        require(bounty.active, "Bounty is not active");
        require(!bounty.completed, "Bounty already completed");
        require(!bounty.refunded, "Bounty already refunded");

        bounty.completed = true;
        bounty.active = false;
        bounty.worker = worker;

        uint256 netPayout = bounty.amount - bounty.commission;

        require(IUSDC(usdc).transfer(worker, netPayout), "Transfer to worker failed");
        require(IUSDC(usdc).transfer(owner, bounty.commission), "Transfer of commission failed");

        emit BountyCompleted(bountyId, worker, netPayout, bounty.commission);
    }

    function refundBounty(bytes32 bountyId) external {
        Bounty storage bounty = bounties[bountyId];
        require(bounty.active, "Bounty is not active");
        require(!bounty.completed, "Bounty already completed");
        require(!bounty.refunded, "Bounty already refunded");
        require(block.timestamp > bounty.createdAt + bounty.duration, "Lock duration not met");

        bounty.refunded = true;
        bounty.active = false;

        require(IUSDC(usdc).transfer(bounty.sender, bounty.amount), "Refund failed");

        emit BountyRefunded(bountyId, bounty.sender, bounty.amount);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "New owner is zero address");
        owner = newOwner;
    }
}
