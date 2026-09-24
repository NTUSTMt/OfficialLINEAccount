import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { SignJWT } from 'https://deno.land/x/jose@v4.14.4/index.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req: Request) => {
  // 處理 CORS preflight OPTIONS 請求
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const { code, redirectUri } = await req.json();

    if (!code || !redirectUri) {
      return new Response(JSON.stringify({ error: 'Missing code or redirectUri parameter' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const channelId = Deno.env.get('LINE_CHANNEL_ID');
    const channelSecret = Deno.env.get('LINE_CHANNEL_SECRET');
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const supabaseJwtSecret = Deno.env.get('SUPABASE_JWT_SECRET');

    if (!channelId || !channelSecret || !supabaseUrl || !supabaseServiceKey || !supabaseJwtSecret) {
      return new Response(
        JSON.stringify({
          error: 'Server configuration error: missing required environment variables (LINE_CHANNEL_ID, LINE_CHANNEL_SECRET, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_JWT_SECRET)',
        }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // 1. 向 LINE OAuth2 Token API 交換 access_token
    const tokenRes = await fetch('https://api.line.me/oauth2/v2.1/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
        client_id: channelId,
        client_secret: channelSecret,
      }),
    });

    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      return new Response(
        JSON.stringify({ error: `LINE token exchange failed (${tokenRes.status}): ${errText}` }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const tokenData = await tokenRes.json();
    const accessToken = tokenData.access_token;

    // 2. 向 LINE Profile API 取得使用者資料 (userId, displayName, pictureUrl)
    const profileRes = await fetch('https://api.line.me/v2/profile', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!profileRes.ok) {
      const errText = await profileRes.text();
      return new Response(
        JSON.stringify({ error: `LINE profile query failed (${profileRes.status}): ${errText}` }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const profileData = await profileRes.json();
    const userId = profileData.userId;
    const displayName = profileData.displayName || '';
    const pictureUrl = profileData.pictureUrl || '';

    // 3. 連線 Supabase 雙軌查驗幹部身分 (members 表與 officers 表)
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: memberData, error: memberErr } = await supabase
      .from('members')
      .select('is_officer, officer_role, name')
      .eq('line_user_id', userId)
      .maybeSingle();

    if (memberErr) {
      console.error('[line-auth] query members error:', memberErr.message);
    }

    const { data: officerData, error: officerErr } = await supabase
      .from('officers')
      .select('role, title, name')
      .eq('line_user_id', userId)
      .maybeSingle();

    if (officerErr) {
      console.error('[line-auth] query officers error:', officerErr.message);
    }

    const isOfficer = Boolean(
      (memberData && memberData.is_officer) ||
      officerData ||
      (memberData && memberData.officer_role)
    );

    const officerRole = (officerData as any)?.title || officerData?.role || memberData?.officer_role || null;

    // 4. 簽發 Supabase Custom JWT (效期 8 小時)
    const jwtSecretEncoded = new TextEncoder().encode(supabaseJwtSecret);
    const jwt = await new SignJWT({
      sub: userId,
      role: 'authenticated',
      is_officer: isOfficer,
      officer_role: officerRole,
      display_name: displayName,
      aud: 'authenticated',
    })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setIssuedAt()
      .setExpirationTime('8h')
      .sign(jwtSecretEncoded);

    // 5. 記錄登入稽核日誌 (audit_logs)
    const clientIp =
      req.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
      req.headers.get('cf-connecting-ip') ||
      'unknown';

    try {
      await supabase.from('audit_logs').insert({
        actor_user_id: userId,
        action: 'LOGIN',
        resource_type: 'session',
        ip_address: clientIp,
        metadata: {
          displayName,
          isOfficer,
          officerRole,
          platform: 'web',
          userAgent: req.headers.get('user-agent') || 'unknown',
        },
      });

      // 6. 異常登入偵測：同一帳號 30 分鐘內出現不同 IP 登入紀錄
      const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
      const { data: recentLogins } = await supabase
        .from('audit_logs')
        .select('ip_address')
        .eq('actor_user_id', userId)
        .eq('action', 'LOGIN')
        .gte('created_at', thirtyMinutesAgo)
        .neq('ip_address', clientIp);

      const distinctOtherIps = new Set((recentLogins || []).map((l: any) => l.ip_address));

      if (distinctOtherIps.size >= 2) {
        // 累積滿 3 個相異 IP (本次 + 過去 30 分鐘 2 個以上不同 IP) 觸發安全警報
        await supabase.from('audit_logs').insert({
          actor_user_id: userId,
          action: 'SECURITY_ALERT',
          resource_type: 'session',
          ip_address: clientIp,
          metadata: {
            reason: 'multiple_ip_login',
            targetEmail: 'ntustmountain@gmail.com',
            distinctIpCount: distinctOtherIps.size + 1,
            otherIps: Array.from(distinctOtherIps),
          },
        });
      }
    } catch (auditErr: any) {
      console.warn('[line-auth] audit log insertion warning:', auditErr.message);
    }

    return new Response(
      JSON.stringify({
        jwt,
        userId,
        displayName,
        pictureUrl,
        isOfficer,
        officerRole,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (err: any) {
    console.error('[line-auth] exception:', err);
    return new Response(
      JSON.stringify({ error: `Server exception: ${err.message || String(err)}` }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
