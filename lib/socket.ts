import { io } from 'socket.io-client';

export const socket = io({
    path: '/api/socket',
    autoConnect: false,
});

export const initSocket = async () => {
    await fetch('/api/socket');
    if (!socket.connected) {
        socket.connect();
    }
};
