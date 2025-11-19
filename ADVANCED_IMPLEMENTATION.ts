// Advanced Remote Control Implementation Examples
// Copy and adapt these for production use

// ============================================================================
// ADVANCED HOOK: useRemoteControl.ts
// ============================================================================
// For handling input with throttling, debouncing, and validation

import { useCallback, useRef, useEffect } from 'react';
import { InputEvent } from './useWebRTC';

interface RemoteControlOptions {
    throttleMs?: number;
    validateInput?: (event: InputEvent) => boolean;
    onError?: (error: Error) => void;
}

export const useRemoteControl = (
    sendInputEvent: (event: InputEvent) => void,
    options: RemoteControlOptions = {}
) => {
    const { throttleMs = 16, validateInput, onError } = options;
    const lastEventTimeRef = useRef<Record<string, number>>({});
    const coordinateBufferRef = useRef({ x: -1, y: -1 });

    // Throttle events by type
    const shouldSendEvent = useCallback((type: InputEvent['type']): boolean => {
        const now = Date.now();
        const lastTime = lastEventTimeRef.current[type] || 0;
        
        if (now - lastTime >= throttleMs) {
            lastEventTimeRef.current[type] = now;
            return true;
        }
        return false;
    }, [throttleMs]);

    // Send event with validation and error handling
    const sendEvent = useCallback((
        type: InputEvent['type'],
        data: Partial<InputEvent>
    ) => {
        try {
            const event: InputEvent = {
                type,
                timestamp: Date.now(),
                ...data,
            };

            // Validate input
            if (validateInput && !validateInput(event)) {
                console.warn('Input validation failed:', event);
                return;
            }

            // Check if event should be throttled
            if (!shouldSendEvent(type)) {
                return;
            }

            sendInputEvent(event);
        } catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            console.error('Error sending input event:', err);
            onError?.(err);
        }
    }, [sendInputEvent, validateInput, shouldSendEvent, onError]);

    // Capture input with bounds checking
    const captureInput = useCallback((
        element: HTMLElement,
        handlers?: Partial<{
            onMouseMove: (x: number, y: number) => void;
            onMouseDown: (x: number, y: number, button: number) => void;
            onMouseUp: (x: number, y: number, button: number) => void;
            onClick: (x: number, y: number, button: number) => void;
            onKeyDown: (key: string, code: string) => void;
            onKeyUp: (key: string, code: string) => void;
            onWheel: (deltaY: number) => void;
        }>
    ) => {
        const getCoordinates = (e: MouseEvent) => {
            const rect = element.getBoundingClientRect();
            if (rect.width === 0 || rect.height === 0) {
                return null;
            }
            return {
                x: ((e.clientX - rect.left) / rect.width) * 100,
                y: ((e.clientY - rect.top) / rect.height) * 100,
            };
        };

        const handleMouseMove = (e: MouseEvent) => {
            const coords = getCoordinates(e);
            if (!coords) return;

            // Deadzone: only send if moved >1%
            const deltaX = Math.abs(coords.x - coordinateBufferRef.current.x);
            const deltaY = Math.abs(coords.y - coordinateBufferRef.current.y);
            
            if (deltaX > 1 || deltaY > 1) {
                coordinateBufferRef.current = coords;
                sendEvent('mousemove', { x: coords.x, y: coords.y });
                handlers?.onMouseMove?.(coords.x, coords.y);
            }
        };

        const handleMouseDown = (e: MouseEvent) => {
            const coords = getCoordinates(e);
            if (!coords) return;
            sendEvent('mousedown', { x: coords.x, y: coords.y, button: e.button });
            handlers?.onMouseDown?.(coords.x, coords.y, e.button);
        };

        const handleMouseUp = (e: MouseEvent) => {
            const coords = getCoordinates(e);
            if (!coords) return;
            sendEvent('mouseup', { x: coords.x, y: coords.y, button: e.button });
            handlers?.onMouseUp?.(coords.x, coords.y, e.button);
        };

        const handleClick = (e: MouseEvent) => {
            const coords = getCoordinates(e);
            if (!coords) return;
            sendEvent('click', { x: coords.x, y: coords.y, button: e.button });
            handlers?.onClick?.(coords.x, coords.y, e.button);
        };

        const handleKeyDown = (e: KeyboardEvent) => {
            sendEvent('keydown', { key: e.key, code: e.code });
            handlers?.onKeyDown?.(e.key, e.code);
        };

        const handleKeyUp = (e: KeyboardEvent) => {
            sendEvent('keyup', { key: e.key, code: e.code });
            handlers?.onKeyUp?.(e.key, e.code);
        };

        const handleWheel = (e: WheelEvent) => {
            e.preventDefault();
            sendEvent('wheel', { deltaY: e.deltaY });
            handlers?.onWheel?.(e.deltaY);
        };

        // Add listeners
        element.addEventListener('mousemove', handleMouseMove);
        element.addEventListener('mousedown', handleMouseDown);
        element.addEventListener('mouseup', handleMouseUp);
        element.addEventListener('click', handleClick);
        element.addEventListener('keydown', handleKeyDown);
        element.addEventListener('keyup', handleKeyUp);
        element.addEventListener('wheel', handleWheel, { passive: false });

        // Cleanup
        return () => {
            element.removeEventListener('mousemove', handleMouseMove);
            element.removeEventListener('mousedown', handleMouseDown);
            element.removeEventListener('mouseup', handleMouseUp);
            element.removeEventListener('click', handleClick);
            element.removeEventListener('keydown', handleKeyDown);
            element.removeEventListener('keyup', handleKeyUp);
            element.removeEventListener('wheel', handleWheel);
        };
    }, [sendEvent]);

    return { sendEvent, captureInput, shouldSendEvent };
};


// ============================================================================
// PUPPETEER HELPER: lib/puppeteer-server.ts
// Run on Node.js backend
// ============================================================================

import puppeteer from 'puppeteer';

interface BrowserControlConfig {
    headless?: boolean;
    width?: number;
    height?: number;
    url?: string;
}

class BrowserController {
    private browser: puppeteer.Browser | null = null;
    private page: puppeteer.Page | null = null;
    private config: BrowserControlConfig;

    constructor(config: BrowserControlConfig = {}) {
        this.config = {
            headless: 'new',
            width: 1920,
            height: 1080,
            url: 'about:blank',
            ...config,
        };
    }

    async init() {
        this.browser = await puppeteer.launch({
            headless: this.config.headless,
            args: [
                `--window-size=${this.config.width},${this.config.height}`,
                '--no-sandbox',
                '--disable-setuid-sandbox',
            ],
        });

        this.page = await this.browser.newPage();
        await this.page.setViewport({
            width: this.config.width,
            height: this.config.height,
        });

        if (this.config.url && this.config.url !== 'about:blank') {
            await this.page.goto(this.config.url);
        }
    }

    async handleInput(event: InputEvent) {
        if (!this.page) throw new Error('Browser not initialized');

        switch (event.type) {
            case 'mousemove':
                await this.page.mouse.move(event.x || 0, event.y || 0);
                break;

            case 'mousedown':
                await this.page.mouse.down({ button: this.getMouseButton(event.button) });
                break;

            case 'mouseup':
                await this.page.mouse.up({ button: this.getMouseButton(event.button) });
                break;

            case 'click':
                await this.page.mouse.click(event.x || 0, event.y || 0, { button: this.getMouseButton(event.button) });
                break;

            case 'keydown':
                await this.page.keyboard.down(event.key || 'Enter');
                break;

            case 'keyup':
                await this.page.keyboard.up(event.key || 'Enter');
                break;

            case 'wheel':
                await this.page.evaluate((deltaY: number) => {
                    window.scrollBy(0, deltaY);
                }, event.deltaY || 0);
                break;
        }
    }

    private getMouseButton(button?: number): 'left' | 'right' | 'middle' {
        switch (button) {
            case 1:
                return 'middle';
            case 2:
                return 'right';
            default:
                return 'left';
        }
    }

    async takeScreenshot(): Promise<Buffer> {
        if (!this.page) throw new Error('Browser not initialized');
        return await this.page.screenshot({ encoding: 'binary' });
    }

    async close() {
        if (this.browser) {
            await this.browser.close();
        }
    }
}

export default BrowserController;


// ============================================================================
// API ROUTE: pages/api/remote-input.ts
// Handle input events from guest and apply to controlled browser
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { InputEvent } from '@/hooks/useWebRTC';
import BrowserController from '@/lib/puppeteer-server';

const controllers = new Map<string, BrowserController>();

// Initialize controller for a room
export async function POST(request: NextRequest) {
    const body = await request.json();
    const { action, roomId, input } = body;

    try {
        if (action === 'init') {
            const controller = new BrowserController({
                url: input?.url || 'about:blank',
            });
            await controller.init();
            controllers.set(roomId, controller);
            return NextResponse.json({ success: true });
        }

        if (action === 'input') {
            const controller = controllers.get(roomId);
            if (!controller) {
                return NextResponse.json({ error: 'Controller not found' }, { status: 404 });
            }

            await controller.handleInput(input as InputEvent);
            return NextResponse.json({ success: true });
        }

        if (action === 'screenshot') {
            const controller = controllers.get(roomId);
            if (!controller) {
                return NextResponse.json({ error: 'Controller not found' }, { status: 404 });
            }

            const buffer = await controller.takeScreenshot();
            return new NextResponse(buffer, {
                headers: { 'Content-Type': 'image/png' },
            });
        }

        if (action === 'close') {
            const controller = controllers.get(roomId);
            if (controller) {
                await controller.close();
                controllers.delete(roomId);
            }
            return NextResponse.json({ success: true });
        }

        return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
    } catch (error) {
        console.error('Remote input error:', error);
        return NextResponse.json(
            { error: String(error) },
            { status: 500 }
        );
    }
}


// ============================================================================
// INPUT VALIDATOR: lib/input-validator.ts
// Security-focused input validation
// ============================================================================

import { InputEvent } from '@/hooks/useWebRTC';

interface ValidationRules {
    maxCoordinateValue?: number;
    allowedKeys?: string[];
    blockedKeys?: string[];
    maxClicksPerSecond?: number;
    maxKeysPerSecond?: number;
}

class InputValidator {
    private clickCount = 0;
    private keyCount = 0;
    private lastSecond = Date.now();
    private rules: ValidationRules;

    constructor(rules: ValidationRules = {}) {
        this.rules = {
            maxCoordinateValue: 100,
            maxClicksPerSecond: 10,
            maxKeysPerSecond: 20,
            blockedKeys: ['F12', 'Meta', 'Alt'],
            ...rules,
        };
    }

    validate(event: InputEvent): boolean {
        // Reset counters every second
        const now = Date.now();
        if (now - this.lastSecond > 1000) {
            this.clickCount = 0;
            this.keyCount = 0;
            this.lastSecond = now;
        }

        // Validate coordinates
        if (event.x !== undefined) {
            if (event.x < 0 || event.x > (this.rules.maxCoordinateValue || 100)) {
                console.warn('Invalid X coordinate:', event.x);
                return false;
            }
        }
        if (event.y !== undefined) {
            if (event.y < 0 || event.y > (this.rules.maxCoordinateValue || 100)) {
                console.warn('Invalid Y coordinate:', event.y);
                return false;
            }
        }

        // Check rate limits
        if (event.type === 'click') {
            this.clickCount++;
            if (this.clickCount > (this.rules.maxClicksPerSecond || 10)) {
                console.warn('Click rate limit exceeded');
                return false;
            }
        }

        if (['keydown', 'keyup'].includes(event.type)) {
            this.keyCount++;
            if (this.keyCount > (this.rules.maxKeysPerSecond || 20)) {
                console.warn('Key rate limit exceeded');
                return false;
            }

            // Check blocked keys
            if (this.rules.blockedKeys?.includes(event.key || '')) {
                console.warn('Blocked key:', event.key);
                return false;
            }

            // Check allowed keys (whitelist if provided)
            if (this.rules.allowedKeys && !this.rules.allowedKeys.includes(event.key || '')) {
                console.warn('Key not in whitelist:', event.key);
                return false;
            }
        }

        return true;
    }
}

export default InputValidator;


// ============================================================================
// USAGE EXAMPLE: Enhanced Guest Component with Validation
// ============================================================================

/*
import { useRemoteControl } from '@/hooks/useRemoteControl';
import InputValidator from '@/lib/input-validator';

export default function GuestPageEnhanced() {
    const { remoteStream, sendInputEvent } = useWebRTC(roomId, null, false);
    
    const validator = useMemo(() => {
        return new InputValidator({
            maxClicksPerSecond: 5,
            maxKeysPerSecond: 15,
            blockedKeys: ['F12', 'Meta', 'Alt'],
        });
    }, []);

    const { captureInput } = useRemoteControl(sendInputEvent, {
        throttleMs: 32, // 30 FPS
        validateInput: (event) => validator.validate(event),
        onError: (error) => {
            console.error('Input error:', error);
            // Could show toast notification
        },
    });

    useEffect(() => {
        if (!overlayRef.current || !isConnected) return;
        
        return captureInput(overlayRef.current, {
            onMouseMove: (x, y) => {
                // Visual feedback on host
                setMousePos({ x, y });
            },
            onKeyDown: (key) => {
                // Log key presses
                console.log('Key pressed:', key);
            },
        });
    }, [isConnected, captureInput]);

    return (
        // ... JSX same as before
    );
}
*/
