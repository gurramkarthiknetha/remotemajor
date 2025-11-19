'use client';

import { useEffect, useState, useRef } from 'react';
import { useWebRTC, type InputEvent } from '@/hooks/useWebRTC';
import { socket } from '@/lib/socket';

interface UserActivity {
    userId: string;
    lastActivity: string;
    timestamp: number;
}

export default function HostPage() {
    const [roomId, setRoomId] = useState('');
    const [localStream, setLocalStream] = useState<MediaStream | null>(null);
    const [status, setStatus] = useState('Initializing...');
    const [usersActivity, setUsersActivity] = useState<Map<string, UserActivity>>(new Map());
    const videoRef = useRef<HTMLDivElement>(null);

    const { startCall, setInputCallback, connectedUsers } = useWebRTC(roomId, localStream, true);

    useEffect(() => {
        // Generate random 6-digit code
        const code = Math.floor(100000 + Math.random() * 900000).toString();
        setRoomId(code);
        setStatus('Waiting for connection...');

        const init = async () => {
            await fetch('/api/socket');
            socket.connect();
            socket.emit('join-room', code);
        };
        init();

        socket.on('user-connected', (userId: string) => {
            setStatus(`User connected: ${userId.substring(0, 8)}...`);
        });

        return () => {
            socket.disconnect();
        };
    }, []);

    // Set up input event handler
    useEffect(() => {
        setInputCallback((inputEvent: InputEvent, userId: string) => {
            console.log('Received input event from', userId, ':', inputEvent);
            
            // Display input feedback
            let feedback = '';
            if (inputEvent.type === 'mousemove') {
                feedback = `Mouse: (${Math.round(inputEvent.x || 0)}, ${Math.round(inputEvent.y || 0)})`;
            } else if (inputEvent.type === 'click') {
                feedback = `Click at (${Math.round(inputEvent.x || 0)}, ${Math.round(inputEvent.y || 0)})`;
            } else if (inputEvent.type === 'keydown' || inputEvent.type === 'keyup') {
                feedback = `Key: ${inputEvent.key}`;
            } else if (inputEvent.type === 'wheel') {
                feedback = `Scroll: ${inputEvent.deltaY}`;
            }
            
            // Update user activity
            setUsersActivity(prev => {
                const updated = new Map(prev);
                updated.set(userId, {
                    userId: userId.substring(0, 8),
                    lastActivity: feedback,
                    timestamp: Date.now(),
                });
                return updated;
            });
        });
    }, [setInputCallback]);

    const startShare = async () => {
        try {
            const stream = await navigator.mediaDevices.getDisplayMedia({
                video: true,
                audio: true
            });
            setLocalStream(stream);
            // Wait a bit for tracks to be added by the hook
            setTimeout(() => {
                startCall();
                setStatus('Sharing screen...');
            }, 1000);
        } catch (err) {
            console.error('Error sharing screen:', err);
            setStatus('Error sharing screen');
        }
    };

    const stopShare = () => {
        if (localStream) {
            localStream.getTracks().forEach(track => track.stop());
            setLocalStream(null);
            setStatus('Stopped sharing');
        }
    };

    return (
        <main className="flex min-h-screen flex-col items-center justify-center p-8 bg-gray-900 text-white">
            <h1 className="text-4xl font-bold mb-8">Host Session</h1>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 w-full max-w-6xl">
                {/* Main Control Panel */}
                <div className="lg:col-span-2">
                    <div className="bg-gray-800 p-8 rounded-lg shadow-lg">
                        <p className="text-gray-400 mb-2">Your Session Code</p>
                        <div className="text-6xl font-mono font-bold text-blue-500 mb-8 tracking-wider">
                            {roomId || '...'}
                        </div>

                        <div className="mb-8">
                            <p className={`text-lg ${status.includes('Error') ? 'text-red-500' : 'text-green-400'}`}>
                                Status: {status}
                            </p>
                            <p className="text-gray-400 text-sm mt-2">
                                Connected Users: {connectedUsers.length}
                            </p>
                        </div>

                        {!localStream ? (
                            <button
                                onClick={startShare}
                                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-8 rounded-full transition-colors"
                            >
                                Start Screen Share
                            </button>
                        ) : (
                            <button
                                onClick={stopShare}
                                className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-3 px-8 rounded-full transition-colors"
                            >
                                Stop Sharing
                            </button>
                        )}
                    </div>
                </div>

                {/* Activity Monitor */}
                <div className="bg-gray-800 p-6 rounded-lg shadow-lg">
                    <h2 className="text-xl font-bold mb-4 text-blue-400">User Activity</h2>
                    
                    {usersActivity.size === 0 ? (
                        <p className="text-gray-500 text-center py-8">No activity yet</p>
                    ) : (
                        <div className="space-y-4">
                            {Array.from(usersActivity.values()).map((activity) => (
                                <div key={activity.userId} className="bg-gray-700 p-3 rounded">
                                    <p className="text-xs text-gray-400 mb-1">User: {activity.userId}</p>
                                    <p className="text-blue-300 font-mono text-sm truncate">
                                        {activity.lastActivity}
                                    </p>
                                </div>
                            ))}
                        </div>
                    )}

                    <div className="mt-6 pt-6 border-t border-gray-700">
                        <h3 className="text-sm font-bold text-gray-400 mb-2">Connected Guests</h3>
                        {connectedUsers.length === 0 ? (
                            <p className="text-gray-500 text-sm">Waiting for guests...</p>
                        ) : (
                            <div className="space-y-2">
                                {connectedUsers.map((userId) => (
                                    <div key={userId} className="flex items-center text-xs text-green-400">
                                        <span className="inline-block w-2 h-2 bg-green-400 rounded-full mr-2"></span>
                                        {userId.substring(0, 8)}...
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </main>
    );
}
