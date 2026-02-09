import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY;

export function usePushNotifications() {
    const [permission, setPermission] = useState<NotificationPermission>('default');
    const [isSubscribed, setIsSubscribed] = useState(false);

    useEffect(() => {
        if ('Notification' in window) {
            setPermission(Notification.permission);
            checkSubscription();
        }
    }, []);

    const checkSubscription = async () => {
        if ('serviceWorker' in navigator) {
            const registration = await navigator.serviceWorker.ready;
            const subscription = await registration.pushManager.getSubscription();
            setIsSubscribed(!!subscription);
        }
    };

    const requestPermission = async () => {
        if (!('Notification' in window)) {
            console.warn('Notificações não suportadas');
            return false;
        }

        const result = await Notification.requestPermission();
        setPermission(result);

        if (result === 'granted') {
            const success = await subscribeToPush();
            return success;
        }

        return false;
    };

    const subscribeToPush = async () => {
        try {
            if (!VAPID_PUBLIC_KEY) {
                console.error('VAPID Public Key not found');
                return false;
            }

            const registration = await navigator.serviceWorker.ready;

            // Verifica se já está inscrito
            let subscription = await registration.pushManager.getSubscription();

            if (!subscription) {
                // Cria nova subscrição
                subscription = await registration.pushManager.subscribe({
                    userVisibleOnly: true,
                    applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
                });
            }

            // Salva no Supabase
            const { error } = await supabase
                .from('push_subscriptions')
                .upsert({
                    endpoint: subscription.endpoint,
                    p256dh: arrayBufferToBase64(subscription.getKey('p256dh')!),
                    auth: arrayBufferToBase64(subscription.getKey('auth')!),
                    user_agent: navigator.userAgent,
                    last_used_at: new Date().toISOString(),
                }, {
                    onConflict: 'endpoint',
                });

            if (error) {
                console.error('Push notification subscription error (Supabase):', error);
                throw error; // Rethrow to trigger catch block
            }

            setIsSubscribed(true);
            return true;
        } catch (error) {
            console.error('Erro ao inscrever push:', error);
            return false;
        }
    };

    const unsubscribe = async () => {
        try {
            const registration = await navigator.serviceWorker.ready;
            const subscription = await registration.pushManager.getSubscription();

            if (subscription) {
                // Remove do Supabase first
                await supabase
                    .from('push_subscriptions')
                    .delete()
                    .eq('endpoint', subscription.endpoint);

                await subscription.unsubscribe();
                setIsSubscribed(false);
            }
        } catch (error) {
            console.error('Erro ao desinscrever:', error);
        }
    };

    return {
        permission,
        isSubscribed,
        requestPermission,
        unsubscribe,
    };
}

// Helpers
function urlBase64ToUint8Array(base64String: string) {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
}

function arrayBufferToBase64(buffer: ArrayBuffer) {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
}
