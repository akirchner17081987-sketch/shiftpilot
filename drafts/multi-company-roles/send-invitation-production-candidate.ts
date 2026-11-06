import { createClient } from "npm:@supabase/supabase-js@2.49.1";
import nodemailer from "npm:nodemailer@6.10.1";

const headers = {
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
};
const escapeHtml = (s: string) => s.replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]!));

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin") || "";
  const allowed = ["https://schichtfunk.de","https://www.schichtfunk.de"];
  const responseHeaders = {...headers, "Vary":"Origin", ...(allowed.includes(origin) ? {"Access-Control-Allow-Origin":origin} : {})};
  const reply = (status: number, message: string) => new Response(JSON.stringify({message}), {status, headers: responseHeaders});
  if (origin && !allowed.includes(origin)) return reply(403, "Ungültiger Ursprung.");
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: responseHeaders });
  if (req.method !== "POST") return reply(405, "Methode nicht erlaubt.");
  const auth = req.headers.get("authorization") || "";
  if (!/^Bearer\s+\S+$/.test(auth)) return reply(401, "Bitte erneut anmelden.");
  let input;
  try { const text=await req.text(); if(text.length>2048) return reply(400,"Ungültige Anfrage."); input = JSON.parse(text); } catch { return reply(400, "Ungültige Anfrage."); }
  const { companyId, inviteId, kind, token } = input || {};
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuid.test(companyId || "") || !uuid.test(inviteId || "") ||
      !["employeeInvite","teamInvite"].includes(kind) ||
      typeof token !== "string" || !/^[a-f0-9-]{64,96}$/i.test(token))
    return reply(400, "Ungültige Einladung.");
  const client = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const { data: user, error: userError } = await client.auth.getUser(auth.replace(/^Bearer\s+/i, ""));
  if (userError || !user.user) return reply(401, "Bitte erneut anmelden.");
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  const hash = Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2,"0")).join("");
  const password = Deno.env.get("SCHICHTFUNK_SMTP_PASSWORD");
  if (!password) return reply(503, "Der E-Mail-Versand ist nicht eingerichtet.");
  const { data, error } = await client.rpc("reserve_invitation_email", {
    p_company_id: companyId, p_invite_id: inviteId, p_kind: kind, p_hash: hash
  });
  if (error || !data?.email) return reply(403, error?.message || "Einladung nicht verfügbar.");
  const { data: companyNames, error: groupError } = await client.rpc("multi_invite_email_companies", {
    p_company_id: companyId, p_invite_id: inviteId, p_kind: kind, p_hash: hash
  });
  if (groupError) return reply(403, "Gemeinsame Einladung nicht verfügbar.");
  if (companyNames) data.company = companyNames;
  const link = "https://schichtfunk.de/?" + kind + "=" + encodeURIComponent(token);
  const company = escapeHtml(String(data.company || "SchichtFunk"));
  const html = `<!doctype html><html lang="de"><body style="margin:0;background:#101b29;font-family:Arial,sans-serif;color:#fff"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center"><table role="presentation" width="600" style="max-width:600px;background:#142538;border-radius:14px;overflow:hidden"><tr><td style="background:#04111e;padding:0;text-align:center"><img src="https://zbvloohfjleadjnqhbbh.supabase.co/storage/v1/object/public/public-email-branding/exec-33b15353-23ef-4d8b-b581-f16eb1a195a1.png" alt="SchichtFunk – Klar geplant. Stark besetzt." width="600" style="display:block;width:100%;max-width:600px;height:auto"></td></tr><tr><td style="padding:36px"><p style="color:#39d8ea;letter-spacing:2px;font-size:12px">DEIN ZUGANG ZU SCHICHTFUNK</p><h1>Du bist eingeladen</h1><p>Du wurdest eingeladen, SchichtFunk für ${company} zu nutzen. Über den folgenden Button kannst du deinen Zugang einrichten.</p><p style="margin:30px 0"><a href="${link}" style="background:#007b93;color:white;text-decoration:none;padding:15px 22px;border-radius:8px;display:inline-block;font-weight:bold">Einladung annehmen →</a></p><p style="color:#b7c8d7;font-size:13px">Dieser persönliche Link ist sieben Tage gültig. Falls du keine Einladung erwartest, ignoriere diese Nachricht.</p><hr style="border:0;border-top:1px solid #385063"><p style="font-size:13px;color:#b7c8d7">Fragen? <a href="mailto:info@schichtfunk.de" style="color:#4cdeef">info@schichtfunk.de</a><br>SchichtFunk · Klar geplant. Stark besetzt.</p></td></tr></table></td></tr></table></body></html>`;
  try {
    const smtp = nodemailer.createTransport({
      host: "smtp.ionos.de", port: 465, secure: true,
      auth: { user: "info@schichtfunk.de", pass: password },
      connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 15000
    });
    await smtp.sendMail({ from: '"SchichtFunk" <info@schichtfunk.de>', to: data.email,
      subject: "Deine Einladung zu SchichtFunk", html,
      text: `Du bist eingeladen, SchichtFunk für ${data.company || "SchichtFunk"} zu nutzen. Einladung annehmen: ${link}\nDer persönliche Link ist sieben Tage gültig.` });
    smtp.close();
    return reply(200, "Die Einladung wurde zum Versand angenommen.");
  } catch {
    return reply(502, "Der E-Mail-Versand ist fehlgeschlagen. Bitte versuche es erneut oder verwende den persönlichen Link.");
  }
});
