'use client';

import { Bell, BellOff, Loader2 } from 'lucide-react';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { cn } from '@/lib/utils';
import { useState } from 'react';
import { useToast } from '@/hooks/use-toast';

export function PushNotificationToggle() {
    const { permission, isSubscribed, requestPermission, unsubscribe } = usePushNotifications();
    const [isLoading, setIsLoading] = useState(false);
    const { toast } = useToast();

    const handleToggle = async () => {
        setIsLoading(true);
        try {
            if (isSubscribed) {
                await unsubscribe();
                toast({
                    title: "Notificações desativadas",
                    description: "Você não receberá mais avisos de saldo.",
                });
            } else {
                const success = await requestPermission();
                if (success) {
                    toast({
                        title: "Notificações ativadas!",
                        description: "Você será avisado quando o saldo for atualizado.",
                    });
                } else if (permission === 'denied') {
                    toast({
                        title: "Permissão negada",
                        description: "Ative as notificações nas configurações do seu navegador.",
                        variant: "destructive",
                    });
                }
            }
        } catch (error) {
            console.error('Toggle error:', error);
            toast({
                title: "Erro",
                description: "Não foi possível alterar as notificações.",
                variant: "destructive",
            });
        } finally {
            setIsLoading(false);
        }
    };

    if (permission === 'denied' && !isSubscribed) {
        return (
            <button
                onClick={handleToggle}
                className="p-2 rounded-xl bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 transition-all duration-300 group"
                title="Notificações Bloqueadas"
            >
                <BellOff className="w-5 h-5 opacity-60 group-hover:opacity-100" />
            </button>
        );
    }

    return (
        <button
            onClick={handleToggle}
            disabled={isLoading}
            className={cn(
                "relative p-2 rounded-xl transition-all duration-300 group overflow-hidden border",
                isSubscribed
                    ? "bg-primary/10 text-primary border-primary/20 hover:bg-primary/20"
                    : "bg-white/5 text-muted-foreground border-white/10 hover:bg-white/10 hover:text-white"
            )}
            title={isSubscribed ? "Notificações Ativas" : "Ativar Notificações"}
        >
            <div className="relative z-10 flex items-center justify-center">
                {isLoading ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                ) : isSubscribed ? (
                    <Bell className="w-5 h-5 fill-current animate-gentle-pulse" />
                ) : (
                    <Bell className="w-5 h-5" />
                )}
            </div>

            {/* Glow Effect for Subscribed State */}
            {isSubscribed && (
                <div className="absolute inset-0 bg-primary/20 blur-xl opacity-50 group-hover:opacity-100 transition-opacity" />
            )}
        </button>
    );
}
