import { renderHook, act } from '@testing-library/react';
import { usePushNotifications } from './usePushNotifications';
import { supabase } from '@/integrations/supabase/client';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock Supabase
const mockPostgrestBuilder = {
    upsert: vi.fn().mockResolvedValue({ error: null }),
    delete: vi.fn().mockReturnThis(),
    eq: vi.fn().mockResolvedValue({ error: null }),
};

vi.mock('@/integrations/supabase/client', () => ({
    supabase: {
        from: vi.fn(() => mockPostgrestBuilder),
    },
}));

describe('usePushNotifications', () => {
    const originalNotification = global.Notification;
    const originalNavigator = global.navigator;

    beforeEach(() => {
        // Reset mocks
        vi.clearAllMocks();

        // Mock VAPID key
        vi.stubEnv('VITE_VAPID_PUBLIC_KEY', 'test-vapid-key');
        // For import.meta.env, we might need a different approach if relying on it.
        // However, let's fix the chaining first.

        // Mock Notification API
        global.Notification = {
            requestPermission: vi.fn(),
            permission: 'default',
        } as any;

        // Mock Service Worker
        Object.defineProperty(global.navigator, 'serviceWorker', {
            value: {
                ready: Promise.resolve({
                    pushManager: {
                        getSubscription: vi.fn().mockResolvedValue(null),
                        subscribe: vi.fn().mockResolvedValue({
                            endpoint: 'test-endpoint',
                            getKey: vi.fn().mockReturnValue(new ArrayBuffer(8)),
                            unsubscribe: vi.fn().mockResolvedValue(true),
                        }),
                    },
                }),
            },
            writable: true,
        });
    });

    afterEach(() => {
        global.Notification = originalNotification;
        global.navigator = originalNavigator;
    });

    it('should initialize with default permission', () => {
        const { result } = renderHook(() => usePushNotifications());
        expect(result.current.permission).toBe('default');
        expect(result.current.isSubscribed).toBe(false);
    });

    it('should request permission and subscribe if granted', async () => {
        (global.Notification.requestPermission as any).mockResolvedValue('granted');

        const { result } = renderHook(() => usePushNotifications());

        let success;
        await act(async () => {
            success = await result.current.requestPermission();
        });

        expect(global.Notification.requestPermission).toHaveBeenCalled();
        expect(result.current.permission).toBe('granted');
        expect(success).toBe(true);
        expect(result.current.isSubscribed).toBe(true);
    });

    it('should handle denied permission', async () => {
        (global.Notification.requestPermission as any).mockResolvedValue('denied');

        const { result } = renderHook(() => usePushNotifications());

        let success;
        await act(async () => {
            success = await result.current.requestPermission();
        });

        expect(result.current.permission).toBe('denied');
        expect(success).toBe(false);
        expect(result.current.isSubscribed).toBe(false);
    });

    it('should unsubscribe correctly', async () => {
        // Setup as subscribed first
        const mockUnsubscribe = vi.fn().mockResolvedValue(true);
        Object.defineProperty(global.navigator, 'serviceWorker', {
            value: {
                ready: Promise.resolve({
                    pushManager: {
                        getSubscription: vi.fn().mockResolvedValue({
                            endpoint: 'test-endpoint',
                            unsubscribe: mockUnsubscribe
                        }),
                    },
                }),
            },
            writable: true,
        });

        const { result } = renderHook(() => usePushNotifications());

        // Force state to subscribed (since useEffect is async/checkSubscription logic)
        // But checkSubscription runs on mount. Let's wait for it.
        await act(async () => {
            await new Promise(resolve => setTimeout(resolve, 0));
        });

        await act(async () => {
            await result.current.unsubscribe();
        });

        expect(mockUnsubscribe).toHaveBeenCalled();
        expect(result.current.isSubscribed).toBe(false);
    });
});
