import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const PALPLUSS_BASE = 'https://api.palpluss.com/v1';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) throw new Error('Backend credentials not configured');
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const rawBody = await req.text();
    const data = JSON.parse(rawBody);

    // OneKitty callback: independently verify via the Developer Apps API.
    if (data?.third_party_reference && data?.kitty_id !== undefined) {
      const developerKey = Deno.env.get('ONEKITTY_DEVELOPER_API_KEY');
      if (!developerKey) throw new Error('OneKitty Developer API key not configured');
      const externalRef = String(data.third_party_reference).trim();
      const kittyId = Number(data.kitty_id);
      const callbackAmount = Number(data.amount);
      const callbackCurrency = String(data.currency || 'KES').toUpperCase();
      const resultCode = String(data.result_code ?? '').trim();
      if (!externalRef || !Number.isInteger(kittyId) || !Number.isFinite(callbackAmount) || !['0', '00'].includes(resultCode)) {
        return new Response(JSON.stringify({ success: false, error: 'Invalid or unsuccessful OneKitty callback' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      const { data: local, error: localError } = await supabase.from('onekitty_test_payments')
        .select('id,amount,kitty_id,currency,callback_verified')
        .eq('external_ref', externalRef).maybeSingle();
      if (localError || !local) return new Response(JSON.stringify({ success: false, error: 'Payment reference not found' }), { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      if (Number(local.amount) !== callbackAmount || Number(local.kitty_id) !== kittyId || local.currency !== callbackCurrency) {
        return new Response(JSON.stringify({ success: false, error: 'Callback amount, kitty or currency mismatch' }), { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      if (local.callback_verified) return new Response(JSON.stringify({ success: true, duplicate: true, verified: true }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

      const query = new URLSearchParams({ kitty_id: String(kittyId), reference: externalRef, page: '0', page_size: '20', sort: '-id' });
      const verifyResponse = await fetch(`https://apisalticon.onekitty.co.ke/developer/v1/transactions/?${query.toString()}`, {
        headers: { Authorization: `Bearer ${developerKey}`, Accept: 'application/json' },
      });
      const verifyBody = await verifyResponse.json().catch(() => ({}));
      const items = Array.isArray(verifyBody?.data?.items) ? verifyBody.data.items : [];
      const verifiedTxn = items.find((item: Record<string, unknown>) =>
        String(item.external_ref || '') === externalRef &&
        Number(item.kitty_id) === kittyId &&
        Number(item.amount) === callbackAmount &&
        String(item.currency || '').toUpperCase() === callbackCurrency &&
        String(item.status || '').toUpperCase() === 'SUCCESS' &&
        String(item.type_in_out || '').toUpperCase() === 'IN'
      );
      if (!verifyResponse.ok || verifyBody?.status !== true || !verifiedTxn) {
        console.error('OneKitty transaction verification failed:', verifyResponse.status, verifyBody?.message || '');
        return new Response(JSON.stringify({ success: false, error: 'OneKitty transaction could not be independently verified' }), { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      const { error: updateError } = await supabase.from('onekitty_test_payments').update({
        callback_status: 'callback_reported_success',
        callback_result_code: resultCode,
        callback_result_desc: String(data.result_desc || '').slice(0, 500),
        callback_channel_code: String(verifiedTxn.channel_code || data.channel_code || '').slice(0, 30),
        callback_transaction_code: String(verifiedTxn.transaction_code || data.transaction_code || '').slice(0, 100),
        provider_payment_ref: String(verifiedTxn.reference || data.payment_ref || '').slice(0, 120) || null,
        request_reference: String(data.request_reference || '').slice(0, 160) || null,
        callback_received_at: new Date().toISOString(),
        callback_verified: true,
        updated_at: new Date().toISOString(),
      }).eq('id', local.id);
      if (updateError) throw updateError;
      return new Response(JSON.stringify({ success: true, verified: true, external_ref: externalRef }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Existing PalPlus callback processing continues below.
    const PALPLUSS_API_KEY = Deno.env.get('PALPLUSS_API_KEY');
    if (!PALPLUSS_API_KEY) throw new Error('PalPlus API key not configured');

    const rawBody = await req.text();
    console.log('Palpluss callback received:', rawBody);
    const data = JSON.parse(rawBody);

    // Palpluss webhook payload
    const txn = data.transaction || {};
    const providerTxnId: string | undefined = txn.id;

    if (!providerTxnId) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing transaction ID' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // PalPlus currently documents no webhook signature. Never trust the public
    // callback body by itself: retrieve the transaction using our server-side
    // API key and update access only from that authenticated provider response.
    const verification = await fetch(`${PALPLUSS_BASE}/transactions/${encodeURIComponent(providerTxnId)}`, {
      headers: { Authorization: `Basic ${PALPLUSS_API_KEY}` },
    });
    const verified = await verification.json().catch(() => ({}));
    if (!verification.ok || verified?.success === false || verified?.data?.transactionId !== providerTxnId) {
      console.error('PalPlus callback verification failed:', verification.status, verified?.error?.code || '');
      return new Response(
        JSON.stringify({ success: false, error: 'Could not verify transaction' }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const verifiedTxn = verified.data;
    const externalReference: string | undefined = verifiedTxn.accountReference;
    const status = String(verifiedTxn.status || '').toUpperCase();
    const mpesaCode: string | null = verifiedTxn.mpesaReceipt ?? verifiedTxn.mpesa_receipt ?? null;
    if (!externalReference || !status) {
      return new Response(
        JSON.stringify({ success: false, error: 'Verified transaction is incomplete' }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const newStatus = status === 'SUCCESS' ? 'completed' : 'failed';

    const { data: existing, error: lookupError } = await supabase
      .from('payments')
      .select('id, amount, provider_txn_id')
      .eq('transaction_id', externalReference)
      .eq('provider_txn_id', providerTxnId)
      .maybeSingle();

    if (lookupError || !existing || Number(existing.amount) !== Number(verifiedTxn.amount)) {
      console.error('Verified payment did not match a local record:', lookupError?.message || providerTxnId);
      return new Response(
        JSON.stringify({ success: false, error: 'Payment record mismatch' }),
        { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: payment, error: updateError } = await supabase
      .from('payments')
      .update({
        payment_status: newStatus,
        mpesa_code: mpesaCode,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id)
      .select()
      .maybeSingle();

    if (updateError) {
      console.error('Update error:', updateError);
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to update payment' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Payment updated:', payment?.id, 'Status:', newStatus);

    return new Response(
      JSON.stringify({ success: true, status: newStatus, transaction_id: externalReference ?? providerTxnId }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: unknown) {
    console.error('Callback error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
