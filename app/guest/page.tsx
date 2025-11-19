'use client';

import { useEffect, useRef, useState } from 'react';
import { useWebRTC, type InputEvent } from '@/hooks/useWebRTC';
import { socket } from '@/lib/socket';

export default function GuestPage() {
    const [roomId, setRoomId] = useState('');
    const [isConnected, setIsConnected] = useState(false);
    const [connectionStatus, setConnectionStatus] = useState('');
    const [lastMousePos, setLastMousePos] = useState({ x: 0, y: 0 });
    const [showControls, setShowControls] = useState(true);
    const videoRef = useRef<HTMLVideoElement>(null);
    const overlayRef = useRef<HTMLDivElement>(null);

    const { remoteStream, sendInputEvent } = useWebRTC(roomId, null, false);

    // Handle input events and send them
    useEffect(() => {
        const overlay = overlayRef.current;
        if (!overlay || !isConnected) return;

        const sendEvent = (type: InputEvent['type'], data: Partial<InputEvent>) => {
            const event: InputEvent = {
                type,
                timestamp: Date.now(),
                ...data,
            };
            sendInputEvent(event);
        };

        const handleMouseMove = (e: MouseEvent) => {
            const rect = overlay.getBoundingClientRect();
            const x = ((e.clientX - rect.left) / rect.width) * 100;
            const y = ((e.clientY - rect.top) / rect.height) * 100;
            
            // Only send if within bounds
            if (x >= 0 && x <= 100 && y >= 0 && y <= 100) {
                setLastMousePos({ x, y });
                sendEvent('mousemove', { x, y });
            }
        };

        const handleMouseDown = (e: MouseEvent) => {
            const rect = overlay.getBoundingClientRect();
            const x = ((e.clientX - rect.left) / rect.width) * 100;
            const y = ((e.clientY - rect.top) / rect.height) * 100;
            if (x >= 0 && x <= 100 && y >= 0 && y <= 100) {
                sendEvent('mousedown', { x, y, button: e.button });
            }
        };

        const handleMouseUp = (e: MouseEvent) => {
            const rect = overlay.getBoundingClientRect();
            const x = ((e.clientX - rect.left) / rect.width) * 100;
            const y = ((e.clientY - rect.top) / rect.height) * 100;
            if (x >= 0 && x <= 100 && y >= 0 && y <= 100) {
                sendEvent('mouseup', { x, y, button: e.button });
            }
        };

        const handleClick = (e: MouseEvent) => {
            const rect = overlay.getBoundingClientRect();
            const x = ((e.clientX - rect.left) / rect.width) * 100;
            const y = ((e.clientY - rect.top) / rect.height) * 100;
            if (x >= 0 && x <= 100 && y >= 0 && y <= 100) {
                sendEvent('click', { x, y, button: e.button });
            }
        };

        const handleKeyDown = (e: KeyboardEvent) => {
            sendEvent('keydown', { key: e.key, code: e.code });
        };

        const handleKeyUp = (e: KeyboardEvent) => {
            sendEvent('keyup', { key: e.key, code: e.code });
        };

        const handleWheel = (e: WheelEvent) => {
            const rect = overlay.getBoundingClientRect();
            const x = ((e.clientX - rect.left) / rect.width) * 100;
            const y = ((e.clientY - rect.top) / rect.height) * 100;
            if (x >= 0 && x <= 100 && y >= 0 && y <= 100) {
                e.preventDefault();
                sendEvent('wheel', { deltaY: e.deltaY });
            }
        };

        // Attach listeners to overlay and document
        overlay.addEventListener('mousemove', handleMouseMove);
        overlay.addEventListener('mousedown', handleMouseDown);
        overlay.addEventListener('mouseup', handleMouseUp);
        overlay.addEventListener('click', handleClick);
        overlay.addEventListener('wheel', handleWheel, { passive: false });
        
        // Keyboard events on document
        document.addEventListener('keydown', handleKeyDown);
        document.addEventListener('keyup', handleKeyUp);

        return () => {
            overlay.removeEventListener('mousemove', handleMouseMove);
            overlay.removeEventListener('mousedown', handleMouseDown);
            overlay.removeEventListener('mouseup', handleMouseUp);
            overlay.removeEventListener('click', handleClick);
            overlay.removeEventListener('wheel', handleWheel);
            document.removeEventListener('keydown', handleKeyDown);
            document.removeEventListener('keyup', handleKeyUp);
        };
    }, [isConnected, sendInputEvent]);

    useEffect(() => {
        if (videoRef.current && remoteStream) {
            videoRef.current.srcObject = remoteStream;
            setConnectionStatus('Connected - Stream received');
        }
    }, [remoteStream]);

    const joinSession = (e: React.FormEvent) => {
        e.preventDefault();
        if (roomId.length === 6) {
            const init = async () => {
                await fetch('/api/socket');
                socket.connect();
                socket.emit('join-room', roomId);
                setIsConnected(true);
                setConnectionStatus('Connecting...');
            };
            init();
        }
    };

    return (
        <main className="flex min-h-screen flex-col items-center justify-center p-8 bg-gray-900 text-white">
            <h1 className="text-4xl font-bold mb-8">Support Agent View</h1>

            {!isConnected ? (
                <form onSubmit={joinSession} className="bg-gray-800 p-8 rounded-lg shadow-lg text-center max-w-md">
                    <p className="text-gray-400 mb-4 text-lg">Enter Session Code</p>
                    <input
                        type="text"
                        value={roomId}
                        onChange={(e) => setRoomId(e.target.value.toUpperCase())}
                        maxLength={6}
                        className="text-5xl font-mono text-center bg-gray-700 border-2 border-gray-600 rounded p-4 mb-6 w-full text-white focus:outline-none focus:border-blue-500 tracking-widest"
                        placeholder="000000"
                        autoFocus
                    />
                    <button
                        type="submit"
                        disabled={roomId.length !== 6}
                        className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white font-bold py-3 px-8 rounded-full transition-colors"
                    >
                        Connect to Session
                    </button>
                    <p className="text-gray-500 text-sm mt-4">Ask the host for the 6-digit session code</p>
                </form>
            ) : (
                <div className="w-full max-w-7xl">
                    {/* Header */}
                    <div className="mb-4 flex justify-between items-center bg-gray-800 p-4 rounded-lg">
                        <div>
                            <h2 className="text-2xl font-bold">Session: {roomId}</h2>
                            <p className={`text-sm ${connectionStatus.includes('Connected') ? 'text-green-400' : 'text-yellow-400'}`}>
                                {connectionStatus}
                            </p>
                        </div>
                        <button
                            onClick={() => {
                                socket.disconnect();
                                setIsConnected(false);
                                setRoomId('');
                                setConnectionStatus('');
                            }}
                            className="bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-6 rounded transition-colors"
                        >
                            Disconnect
                        </button>
                    </div>

                    {/* Main Screen Area */}
                    <div className="grid grid-cols-4 gap-4">
                        {/* Video/Screen Area */}
                        <div className="col-span-3">
                            <div 
                                ref={overlayRef}
                                className="bg-black rounded-lg overflow-hidden shadow-2xl border-2 border-blue-600 relative cursor-crosshair focus:outline-none"
                                tabIndex={0}
                            >
                                <video
                                    ref={videoRef}
                                    autoPlay
                                    playsInline
                                    className="w-full h-full object-contain"
                                />
                                {!remoteStream && (
                                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-black bg-opacity-75">
                                        <div className="text-center">
                                            <div className="mb-4">
                                                <svg className="animate-spin h-12 w-12 text-blue-400 mx-auto" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                                </svg>
                                            </div>
                                            <p className="text-gray-400">Waiting for host to share screen...</p>
                                        </div>
                                    </div>
                                )}
                                {/* Cursor Position Display */}
                                {remoteStream && (
                                    <div className="absolute top-2 left-2 bg-black bg-opacity-50 px-3 py-1 rounded text-xs text-gray-300">
                                        Position: {Math.round(lastMousePos.x)}%, {Math.round(lastMousePos.y)}%
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Control Panel */}
                        <div className="col-span-1 flex flex-col gap-4">
                            {/* Quick Actions */}
                            <div className="bg-gray-800 p-4 rounded-lg">
                                <h3 className="font-bold mb-3 text-blue-400">Quick Actions</h3>
                                <div className="space-y-2 flex flex-col">
                                    <button
                                        onClick={() => sendInputEvent({
                                            type: 'click',
                                            x: 50,
                                            y: 50,
                                            button: 0,
                                            timestamp: Date.now(),
                                        })}
                                        className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded text-sm font-bold transition"
                                    >
                                        Left Click
                                    </button>
                                    <button
                                        onClick={() => sendInputEvent({
                                            type: 'click',
                                            x: 50,
                                            y: 50,
                                            button: 2,
                                            timestamp: Date.now(),
                                        })}
                                        className="w-full bg-purple-600 hover:bg-purple-700 text-white py-2 px-4 rounded text-sm font-bold transition"
                                    >
                                        Right Click
                                    </button>
                                    <button
                                        onClick={() => sendInputEvent({
                                            type: 'wheel',
                                            deltaY: 100,
                                            timestamp: Date.now(),
                                        })}
                                        className="w-full bg-green-600 hover:bg-green-700 text-white py-2 px-4 rounded text-sm font-bold transition"
                                    >
                                        Scroll Down
                                    </button>
                                    <button
                                        onClick={() => sendInputEvent({
                                            type: 'wheel',
                                            deltaY: -100,
                                            timestamp: Date.now(),
                                        })}
                                        className="w-full bg-green-600 hover:bg-green-700 text-white py-2 px-4 rounded text-sm font-bold transition"
                                    >
                                        Scroll Up
                                    </button>
                                </div>
                            </div>

                            {/* Keyboard Shortcuts */}
                            <div className="bg-gray-800 p-4 rounded-lg">
                                <h3 className="font-bold mb-3 text-blue-400">Shortcuts</h3>
                                <div className="space-y-1 text-xs text-gray-300">
                                    <div className="flex gap-2">
                                        <kbd className="bg-gray-700 px-2 py-1 rounded">Cmd+C</kbd>
                                        <span>Copy</span>
                                    </div>
                                    <div className="flex gap-2">
                                        <kbd className="bg-gray-700 px-2 py-1 rounded">Cmd+V</kbd>
                                        <span>Paste</span>
                                    </div>
                                    <div className="flex gap-2">
                                        <kbd className="bg-gray-700 px-2 py-1 rounded">Cmd+Z</kbd>
                                        <span>Undo</span>
                                    </div>
                                    <div className="flex gap-2">
                                        <kbd className="bg-gray-700 px-2 py-1 rounded">Tab</kbd>
                                        <span>Switch Apps</span>
                                    </div>
                                </div>
                            </div>

                            {/* Instructions */}
                            <div className="bg-gray-800 p-4 rounded-lg">
                                <h3 className="font-bold mb-2 text-blue-400 text-sm">How to Control</h3>
                                <ul className="text-xs text-gray-300 space-y-1">
                                    <li>🖱️ Move mouse over screen</li>
                                    <li>🖱️ Click directly on screen</li>
                                    <li>⌨️ Type to send keyboard input</li>
                                    <li>🔄 Scroll with mouse wheel</li>
                                    <li>📍 Position shows at top-left</li>
                                </ul>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </main>
    );
}
