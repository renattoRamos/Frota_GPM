import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY")!;
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY")!;
const VAPID_SUBJECT = "mailto:admin@frotagpm.compesa.com.br"; // Recommended by spec

// Web Push libraries for Deno are scarce, implementing raw Web Push
// or using a lightweight approach.
// Using a simple implementation for now.

function urlBase64ToUint8Array(base64String: string) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding)
        .replace(/\-/g, '+')
        .replace(/_/g, '/');

    const rawData = atob(base64);
    const outputArray = new Uint8Array(rawData.length);

    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
}

// Simple VAPID JWT generation
async function generateVAPIDHeader(audience: string) {
    const header = { typ: "JWT", alg: "ES256" };
    const claims = {
        aud: audience,
        exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
        sub: VAPID_SUBJECT
    };

    const encodedHeader = btoa(JSON.stringify(header)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const encodedClaims = btoa(JSON.stringify(claims)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const unsignedToken = `${encodedHeader}.${encodedClaims}`;

    // Import private key
    const key = await crypto.subtle.importKey(
        "jwk",
        {
            kty: "EC",
            crv: "P-256",
            d: VAPID_PRIVATE_KEY,
            x: "", // Optional for private key import in some envs, but usually needed. 
            // Actually for raw EC import we might need coordinates.
            // Let's use a simpler library if possible or minimal implementation.
            // But valid VAPID signing is complex without a lib.
            // Let's assume we can fetch a library from esm.sh
        },
        { name: "ECDSA", namedCurve: "P-256" },
        false,
        ["sign"]
    ).catch(async () => {
        // Fallback: try importing PKCS8 if available, or use web-push lib from esm.sh
        return null;
    });

    // NOTE: Implementing robust VAPID signing from scratch in Deno without 'web-push' lib is error-prone.
    // We will use 'web-push' from esm.sh which is compatible with Deno (mostly).
}

// Better approach: Use web-push library from npm
import webpush from "npm:web-push@3.6.7";

// Configure web-push
// Note: web-push relies on Node.js globals. Deno compatibility might vary.
// If web-push fails in Deno, we use a specialized Deno library or fetch.
// 'web-push' on esm.sh bundles polyfills.

serve(async (req) => {
    try {
        // 1. Parse request
        const { event } = await req.json();

        // 2. Initialize Supabase
        const supabase = createClient(
            Deno.env.get("SUPABASE_URL")!,
            Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
        );

        // 3. Set VAPID details
        try {
            webpush.setVapidDetails(
                VAPID_SUBJECT,
                VAPID_PUBLIC_KEY,
                VAPID_PRIVATE_KEY
            );
        } catch (err) {
            console.error("Error setting VAPID details:", err);
            return new Response(JSON.stringify({ error: "VAPID configuration error" }), { status: 500 });
        }

        // 4. Fetch subscriptions
        const { data: subscriptions, error } = await supabase
            .from("push_subscriptions")
            .select("*");

        if (error) {
            console.error("Database error:", error);
            throw error;
        }

        console.log(`Found ${subscriptions?.length || 0} subscriptions`);

        if (!subscriptions || subscriptions.length === 0) {
            return new Response(JSON.stringify({ message: "No subscriptions" }), { headers: { "Content-Type": "application/json" } });
        }

        // 5. Send notifications
        const notificationPayload = JSON.stringify({
            title: "Aviso",
            body: "Saldo de combustível atualizado pela GPM!",
            icon: "/icons/icon-192.png",
            badge: "/icons/icon-192.png",
            tag: "fuel-update",
            data: {
                url: "/",
                timestamp: Date.now()
            }
        });

        const results = await Promise.allSettled(
            subscriptions.map(async (sub) => {
                try {
                    const pushSubscription = {
                        endpoint: sub.endpoint,
                        keys: {
                            p256dh: sub.p256dh,
                            auth: sub.auth,
                        },
                    };

                    await webpush.sendNotification(pushSubscription, notificationPayload);
                    return { status: "fulfilled", endpoint: sub.endpoint };
                } catch (err: any) {
                    if (err.statusCode === 410 || err.statusCode === 404) {
                        // Subscription expired or invalid
                        console.log(`Subscription expired for ${sub.id}, deleting...`);
                        await supabase.from("push_subscriptions").delete().eq("id", sub.id);
                        return { status: "rejected", endpoint: sub.endpoint, reason: "Expired" };
                    }
                    console.error(`Error sending to ${sub.id}:`, err);
                    return { status: "rejected", endpoint: sub.endpoint, reason: err.message };
                }
            })
        );

        const successCount = results.filter((r) => r.status === "fulfilled").length;
        const failureCount = results.filter((r) => r.status === "rejected").length;

        console.log(`Sent: ${successCount}, Failed: ${failureCount}`);

        return new Response(
            JSON.stringify({
                success: true,
                sent: successCount,
                failed: failureCount,
            }),
            { headers: { "Content-Type": "application/json" } }
        );
    } catch (error: any) {
        console.error("Edge Function Error:", error);
        return new Response(
            JSON.stringify({ error: error.message }),
            { status: 500, headers: { "Content-Type": "application/json" } }
        );
    }
});
