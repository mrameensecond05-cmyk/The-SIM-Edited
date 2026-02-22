import { SMSAlert } from '../types';
import { Capacitor } from '@capacitor/core';

export const SERVER_IP = 'http://192.168.1.67:5000';

export const API_URL = Capacitor.getPlatform() === 'web' ? '/api' : `${SERVER_IP}/api`;

export const UserService = {

    login: async (credentials: { email: string; password: string }) => {
        const res = await fetch(`${API_URL}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(credentials)
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Login failed');
        return data;
    },

    register: async (userData: { name: string; email: string; phone?: string; password: string }) => {
        const res = await fetch(`${API_URL}/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(userData)
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Registration failed');
        return data;
    },

    getAlerts: async (): Promise<SMSAlert[]> => {
        try {
            const res = await fetch(`${API_URL}/alerts`);
            if (!res.ok) return [];
            return await res.json();
        } catch {
            return [];
        }
    },

    analyzeSms: async (data: { smsText: string; sender: string; timestamp: number; userId: string }) => {
        const res = await fetch(`${API_URL}/analyze`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ smsText: data.smsText, deviceContext: { sender: data.sender }, userId: data.userId })
        });
        if (!res.ok) throw new Error('Analysis failed');
        return await res.json();
    },

    registerDevice: async (data: { userId: string; imei: string }) => {
        try {
            const res = await fetch(`${API_URL}/user/device`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            if (!res.ok) return { success: false };
            return await res.json();
        } catch {
            return { success: false };
        }
    }
};
