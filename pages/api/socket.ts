import { Server } from 'socket.io';
import type { NextApiRequest, NextApiResponse } from 'next';
import type { Server as NetServer } from 'http';
import type { Socket as NetSocket } from 'net';

interface SocketServer extends NetServer {
  io?: Server;
}

interface SocketWithIO extends NetSocket {
  server: SocketServer;
}

interface NextApiResponseWithSocket extends NextApiResponse {
  socket: SocketWithIO;
}

// Store rooms to track room state
const rooms = new Map<string, { hostId?: string }>();

export default function SocketHandler(
  req: NextApiRequest,
  res: NextApiResponseWithSocket
) {
  if (res.socket.server.io) {
    // Socket is already running
    res.end();
    return;
  }

  console.log('Socket is initializing');
  const io = new Server(res.socket.server, {
    path: '/api/socket',
    addTrailingSlash: false,
  });
  res.socket.server.io = io;

  io.on('connection', (socket) => {
    console.log('New client connected', socket.id);

    socket.on('join-room', (roomId: string) => {
      socket.join(roomId);
      console.log(`User ${socket.id} joined room ${roomId}`);
      
      // Initialize room if it doesn't exist
      if (!rooms.has(roomId)) {
        rooms.set(roomId, { hostId: socket.id });
      }
      
      // Notify others in the room
      socket.to(roomId).emit('user-connected', socket.id);
    });

    socket.on('request-offer', (data: { roomId: string }) => {
      console.log(`User ${socket.id} requesting offer in room ${data.roomId}`);
      // Ask host to send offer to this user
      socket.to(data.roomId).emit('send-offer', { requesterId: socket.id });
    });

    socket.on('offer', (data: { roomId: string; offer: RTCSessionDescriptionInit; targetUserId: string }) => {
      console.log(`Offer from ${socket.id} to ${data.targetUserId}`);
      socket.to(data.roomId).emit('offer', { offer: data.offer, senderId: socket.id, targetUserId: data.targetUserId });
    });

    socket.on('answer', (data: { roomId: string; answer: RTCSessionDescriptionInit; targetUserId: string }) => {
      console.log(`Answer from ${socket.id} to ${data.targetUserId}`);
      socket.to(data.roomId).emit('answer', { answer: data.answer, senderId: socket.id, targetUserId: data.targetUserId });
    });

    socket.on('ice-candidate', (data: { roomId: string; candidate: RTCIceCandidate; targetUserId: string }) => {
      socket.to(data.roomId).emit('ice-candidate', { candidate: data.candidate, senderId: socket.id, targetUserId: data.targetUserId });
    });

    socket.on('disconnect', () => {
      console.log('Client disconnected', socket.id);
      // Clean up room if host disconnects
      rooms.forEach((roomData, roomId) => {
        if (roomData.hostId === socket.id) {
          rooms.delete(roomId);
        }
      });
    });
  });

  res.end();
}
