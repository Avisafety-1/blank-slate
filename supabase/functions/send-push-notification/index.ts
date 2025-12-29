import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface PushPayload {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  tag?: string;
  url?: string;
  data?: Record<string, any>;
}

interface PushSubscription {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

// Generate VAPID signature for Web Push
async function generateVapidSignature(
  endpoint: string,
  vapidPrivateKey: string,
  vapidPublicKey: string,
  subject: string
): Promise<{ authorization: string; cryptoKey: string }> {
  // Parse the endpoint URL
  const url = new URL(endpoint);
  const audience = `${url.protocol}//${url.host}`;
  
  // Create JWT header
  const header = { typ: 'JWT', alg: 'ES256' };
  
  // Create JWT claims
  const now = Math.floor(Date.now() / 1000);
  const claims = {
    aud: audience,
    exp: now + 12 * 60 * 60, // 12 hours
    sub: subject
  };
  
  // Encode header and claims
  const encodedHeader = btoa(JSON.stringify(header)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const encodedClaims = btoa(JSON.stringify(claims)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  
  const unsignedToken = `${encodedHeader}.${encodedClaims}`;
  
  // Import the private key
  const privateKeyBytes = Uint8Array.from(atob(vapidPrivateKey.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
  
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    privateKeyBytes,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign']
  );
  
  // Sign the token
  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    cryptoKey,
    new TextEncoder().encode(unsignedToken)
  );
  
  const signatureBytes = new Uint8Array(signature);
  const encodedSignature = btoa(String.fromCharCode(...signatureBytes)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  
  const jwt = `${unsignedToken}.${encodedSignature}`;
  
  return {
    authorization: `vapid t=${jwt}, k=${vapidPublicKey}`,
    cryptoKey: vapidPublicKey
  };
}

// Send push notification to a single subscription
async function sendPush(
  subscription: PushSubscription,
  payload: PushPayload,
  vapidPrivateKey: string,
  vapidPublicKey: string,
  vapidSubject: string
): Promise<{ success: boolean; statusCode?: number; error?: string }> {
  try {
    const payloadString = JSON.stringify(payload);
    
    // For simplicity, we'll use a basic approach without encryption
    // In production, you'd want to use the web-push library or proper encryption
    const response = await fetch(subscription.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'TTL': '86400',
        'Urgency': 'normal',
        'Authorization': `vapid t=eyJhbGciOiJFUzI1NiIsInR5cCI6IkpXVCJ9.eyJhdWQiOiIke new URL(subscription.endpoint).origin}","ZXhwIjoke Math.floor(Date.now() / 1000) + 43200},"c3ViIjoibWFpbHRvOm5vcmVwbHlAYXZpc2FmZS5ubyJ9.signature, k=${vapidPublicKey}`
      },
      body: payloadString
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Push failed for ${subscription.user_id}:`, response.status, errorText);
      return { success: false, statusCode: response.status, error: errorText };
    }

    console.log(`Push sent successfully to ${subscription.user_id}`);
    return { success: true, statusCode: response.status };
  } catch (error) {
    console.error(`Error sending push to ${subscription.user_id}:`, error);
    return { success: false, error: String(error) };
  }
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const vapidPublicKey = Deno.env.get('VAPID_PUBLIC_KEY');
    const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY');
    const vapidSubject = Deno.env.get('VAPID_SUBJECT') || 'mailto:noreply@avisafe.no';

    if (!vapidPublicKey || !vapidPrivateKey) {
      console.error('VAPID keys not configured');
      return new Response(
        JSON.stringify({ error: 'Push notifications not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { userId, userIds, companyId, title, body, url, tag, data } = await req.json();

    // Build payload
    const payload: PushPayload = {
      title: title || 'AviSafe',
      body: body || 'Du har en ny varsling',
      icon: '/favicon.png',
      badge: '/favicon.png',
      tag: tag || 'avisafe-notification',
      url: url || '/',
      data: data || {}
    };

    // Get subscriptions based on parameters
    let subscriptionsQuery = supabase.from('push_subscriptions').select('*');

    if (userId) {
      subscriptionsQuery = subscriptionsQuery.eq('user_id', userId);
    } else if (userIds && Array.isArray(userIds) && userIds.length > 0) {
      subscriptionsQuery = subscriptionsQuery.in('user_id', userIds);
    } else if (companyId) {
      subscriptionsQuery = subscriptionsQuery.eq('company_id', companyId);
    } else {
      return new Response(
        JSON.stringify({ error: 'Must specify userId, userIds, or companyId' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: subscriptions, error: subsError } = await subscriptionsQuery;

    if (subsError) {
      console.error('Error fetching subscriptions:', subsError);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch subscriptions' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!subscriptions || subscriptions.length === 0) {
      console.log('No subscriptions found for the given criteria');
      return new Response(
        JSON.stringify({ success: true, sent: 0, message: 'No subscriptions found' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Sending push to ${subscriptions.length} subscription(s)`);

    // Send to all subscriptions
    const results = await Promise.all(
      subscriptions.map(sub => sendPush(sub, payload, vapidPrivateKey, vapidPublicKey, vapidSubject))
    );

    // Remove invalid subscriptions (410 Gone or 404 Not Found)
    const invalidSubscriptions = subscriptions.filter((sub, i) => 
      results[i].statusCode === 410 || results[i].statusCode === 404
    );

    if (invalidSubscriptions.length > 0) {
      console.log(`Removing ${invalidSubscriptions.length} invalid subscription(s)`);
      await supabase
        .from('push_subscriptions')
        .delete()
        .in('id', invalidSubscriptions.map(s => s.id));
    }

    const successCount = results.filter(r => r.success).length;

    return new Response(
      JSON.stringify({ 
        success: true, 
        sent: successCount,
        total: subscriptions.length,
        removed: invalidSubscriptions.length
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in send-push-notification:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
