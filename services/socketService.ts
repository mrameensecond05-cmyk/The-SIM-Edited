import { io, Socket } from 'socket.io-client';
import { Capacitor } from '@capacitor/core';
import { SERVER_IP } from './userService';

// Connect to server — use SERVER_IP on native (Android), origin on web
const SOCKET_URL = Capacitor.getPlatform() === 'web'
    ? window.location.origin
    : SERVER_IP;

export const socket: Socket = io(SOCKET_URL, {
    transports: ['websocket', 'polling'],
    autoConnect: true,
    reconnection: true,
    reconnectionDelay: 2000,
});

socket.on('connect', () => {
    console.log('[Socket.io] Connected to server:', socket.id);
});

socket.on('disconnect', () => {
    console.log('[Socket.io] Disconnected from server');
});

socket.on('connect_error', (err) => {
    console.warn('[Socket.io] Connection error:', err.message);
});

/** Admin triggers a simulation broadcast */
export const emitSimulation = () => {
    socket.emit('admin_trigger_simulation', {
        timestamp: new Date().toISOString()
    });
};

/** Register user as online */
export const registerOnline = (userId: string) => {
    socket.emit('register_online', { userId });
};
