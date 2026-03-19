// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract AnchorRegistry {
    error ZeroCommitment();

    event CommitmentAnchored(
        bytes32 indexed commitment,
        bytes32 indexed signalIdHash,
        uint64 predictedAt,
        address indexed sender
    );

    function anchor(bytes32 commitment, bytes32 signalIdHash, uint64 predictedAt) external {
        if (commitment == bytes32(0)) revert ZeroCommitment();

        emit CommitmentAnchored(commitment, signalIdHash, predictedAt, msg.sender);
    }
}
