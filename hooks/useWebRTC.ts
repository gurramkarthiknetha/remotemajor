import { useEffect, useRef, useState, useCallback } from 'react';
import { socket } from '@/lib/socket';

const ICE_SERVERS = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
    ],
};

export interface InputEvent {
    type: 'mousemove' | 'mousedown' | 'mouseup' | 'click' | 'keydown' | 'keyup' | 'wheel';
    x?: number;
    y?: number;
    button?: number;
    key?: string;
    code?: string;
    deltaY?: number;
    timestamp: number;
}

export const useWebRTC = (roomId: string, localStream: MediaStream | null = null, isHost: boolean = false) => {
    const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
    const [connectedUsers, setConnectedUsers] = useState<string[]>([]);
    const peerConnectionsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
    const dataChannelsRef = useRef<Map<string, RTCDataChannel>>(new Map());
    const inputCallbackRef = useRef<((event: InputEvent, userId: string) => void) | null>(null);
    const pendingCandidatesRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());
    const isInitiatorRef = useRef<boolean>(false);

    const setupDataChannel = useCallback((channel: RTCDataChannel, userId: string) => {
        dataChannelsRef.current.set(userId, channel);

        channel.onopen = () => {
            console.log(`Data channel opened for user ${userId}`);
        };

        channel.onclose = () => {
            console.log(`Data channel closed for user ${userId}`);
            dataChannelsRef.current.delete(userId);
        };

        channel.onmessage = (event) => {
            try {
                const inputEvent: InputEvent = JSON.parse(event.data);
                if (inputCallbackRef.current) {
                    inputCallbackRef.current(inputEvent, userId);
                }
            } catch (err) {
                console.error('Error parsing input event:', err);
            }
        };

        channel.onerror = (event) => {
            console.error(`Data channel error for user ${userId}:`, event);
        };
    }, []);

    const createPeerConnection = useCallback((userId: string) => {
        // Return existing connection if already created
        if (peerConnectionsRef.current.has(userId)) {
            return peerConnectionsRef.current.get(userId)!;
        }

        const pc = new RTCPeerConnection(ICE_SERVERS);

        pc.onicecandidate = (event) => {
            if (event.candidate) {
                socket.emit('ice-candidate', { roomId, candidate: event.candidate, targetUserId: userId });
            }
        };

        pc.ontrack = (event) => {
            console.log('Received remote track from', userId);
            setRemoteStream(event.streams[0]);
        };

        pc.ondatachannel = (event) => {
            console.log('Data channel received from', userId);
            setupDataChannel(event.channel, userId);
        };

        pc.onconnectionstatechange = () => {
            console.log(`Connection state with ${userId}:`, pc.connectionState);
            if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
                peerConnectionsRef.current.delete(userId);
                dataChannelsRef.current.delete(userId);
                pendingCandidatesRef.current.delete(userId);
                setConnectedUsers(prev => prev.filter(id => id !== userId));
            }
        };

        peerConnectionsRef.current.set(userId, pc);
        
        // Initialize pending candidates array for this user
        if (!pendingCandidatesRef.current.has(userId)) {
            pendingCandidatesRef.current.set(userId, []);
        }

        // Add local stream tracks immediately if available
        if (localStream) {
            localStream.getTracks().forEach(track => {
                pc.addTrack(track, localStream);
            });
        }

        return pc;
    }, [roomId, setupDataChannel, localStream]);

    useEffect(() => {
        if (!roomId) return;

        const handleUserConnected = async (userId: string) => {
            console.log('User connected, initiating call with:', userId);
            
            // Host initiates the offer when a user connects
            if (isHost) {
                isInitiatorRef.current = true;
                const pc = createPeerConnection(userId);

                try {
                    const offer = await pc.createOffer();
                    await pc.setLocalDescription(offer);
                    socket.emit('offer', { roomId, offer, targetUserId: userId });
                } catch (err) {
                    console.error('Error creating offer:', err);
                }
            } else {
                // Guest - request offer from host
                console.log('Guest requesting offer from host');
                socket.emit('request-offer', { roomId });
            }
        };

        const handleOffer = async (data: { offer: RTCSessionDescriptionInit, senderId: string }) => {
            console.log('Received offer from:', data.senderId);
            try {
                const userId = data.senderId;
                const pc = createPeerConnection(userId);
                isInitiatorRef.current = false;

                if (pc.signalingState !== 'stable') {
                    console.warn('Peer connection not in stable state:', pc.signalingState);
                    return;
                }

                await pc.setRemoteDescription(new RTCSessionDescription(data.offer));

                const answer = await pc.createAnswer();
                await pc.setLocalDescription(answer);
                socket.emit('answer', { roomId, answer, targetUserId: userId });

                // Add any pending candidates
                const pendingCandidates = pendingCandidatesRef.current.get(userId) || [];
                for (const candidate of pendingCandidates) {
                    try {
                        await pc.addIceCandidate(new RTCIceCandidate(candidate));
                    } catch (err) {
                        console.error('Error adding pending candidate:', err);
                    }
                }
                pendingCandidatesRef.current.set(userId, []);
            } catch (err) {
                console.error('Error handling offer:', err);
            }
        };

        const handleAnswer = async (data: { answer: RTCSessionDescriptionInit, senderId: string }) => {
            console.log('Received answer from:', data.senderId);
            try {
                const userId = data.senderId;
                const pc = peerConnectionsRef.current.get(userId);
                if (!pc) {
                    console.error('Peer connection not found for user:', userId);
                    return;
                }

                if (pc.signalingState !== 'have-local-offer') {
                    console.warn('Wrong state for answer:', pc.signalingState);
                    return;
                }

                await pc.setRemoteDescription(new RTCSessionDescription(data.answer));

                // Add any pending candidates
                const pendingCandidates = pendingCandidatesRef.current.get(userId) || [];
                for (const candidate of pendingCandidates) {
                    try {
                        await pc.addIceCandidate(new RTCIceCandidate(candidate));
                    } catch (err) {
                        console.error('Error adding pending candidate:', err);
                    }
                }
                pendingCandidatesRef.current.set(userId, []);

                // Add user to connected list
                setConnectedUsers(prev => 
                    prev.includes(userId) ? prev : [...prev, userId]
                );
            } catch (err) {
                console.error('Error handling answer:', err);
            }
        };

        const handleIceCandidate = async (data: { candidate: RTCIceCandidate, senderId: string }) => {
            try {
                const userId = data.senderId;
                const pc = peerConnectionsRef.current.get(userId);
                
                if (!pc) {
                    console.warn('Peer connection not ready, buffering candidate');
                    const candidates = pendingCandidatesRef.current.get(userId) || [];
                    candidates.push(data.candidate);
                    pendingCandidatesRef.current.set(userId, candidates);
                    return;
                }

                if (pc.remoteDescription) {
                    await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
                } else {
                    console.warn('Remote description not set, buffering candidate');
                    const candidates = pendingCandidatesRef.current.get(userId) || [];
                    candidates.push(data.candidate);
                    pendingCandidatesRef.current.set(userId, candidates);
                }
            } catch (err) {
                console.error('Error adding ICE candidate:', err);
            }
        };

        const handleSendOffer = async (data: { requesterId: string }) => {
            console.log('Host sending offer to requester:', data.requesterId);
            if (!isHost) return;

            const pc = createPeerConnection(data.requesterId);
            try {
                const offer = await pc.createOffer();
                await pc.setLocalDescription(offer);
                socket.emit('offer', { roomId, offer, targetUserId: data.requesterId });
            } catch (err) {
                console.error('Error creating offer:', err);
            }
        };

        socket.on('user-connected', handleUserConnected);
        socket.on('send-offer', handleSendOffer);
        socket.on('offer', handleOffer);
        socket.on('answer', handleAnswer);
        socket.on('ice-candidate', handleIceCandidate);

        return () => {
            socket.off('user-connected', handleUserConnected);
            socket.off('send-offer', handleSendOffer);
            socket.off('offer', handleOffer);
            socket.off('answer', handleAnswer);
            socket.off('ice-candidate', handleIceCandidate);
        };
    }, [roomId, createPeerConnection, isHost]);

    const startCall = useCallback(async (userId?: string) => {
        const targetUserId = userId || 'broadcast';
        const pc = createPeerConnection(targetUserId);
        
        // Create data channel for the initiator (host)
        if (isHost && !dataChannelsRef.current.has(targetUserId)) {
            const dc = pc.createDataChannel('input', { ordered: true });
            setupDataChannel(dc, targetUserId);
        }
        
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit('offer', { roomId, offer, targetUserId });
    }, [createPeerConnection, roomId, isHost, setupDataChannel]);

    const sendInputEvent = useCallback((event: InputEvent, targetUserId?: string) => {
        if (targetUserId) {
            // Send to specific user
            const dc = dataChannelsRef.current.get(targetUserId);
            if (dc && dc.readyState === 'open') {
                dc.send(JSON.stringify(event));
            }
        } else {
            // Broadcast to all connected users
            dataChannelsRef.current.forEach((dc) => {
                if (dc.readyState === 'open') {
                    dc.send(JSON.stringify(event));
                }
            });
        }
    }, []);

    const setInputCallback = useCallback((callback: (event: InputEvent, userId: string) => void) => {
        inputCallbackRef.current = callback;
    }, []);

    return {
        peerConnectionsRef,
        remoteStream,
        connectedUsers,
        createPeerConnection,
        startCall,
        sendInputEvent,
        setInputCallback,
    };
};
