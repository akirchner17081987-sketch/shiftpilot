import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "npm:@supabase/server@1.5.3";
import { sendPushBatch } from "npm:@mmmike/web-push@1.3.0/send";
import { generateVapidKeys } from "npm:@mmmike/web-push@1.3.0/vapid";

const uuidRe=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const base64url=(bytes:Uint8Array)=>btoa(String.fromCharCode(...bytes)).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,"");

const handler=withSupabase({auth:"none"},async(req,ctx)=>{
  if(req.method!=="POST")return Response.json({error:"METHOD_NOT_ALLOWED"},{status:405});
  let body:any={};
  try{body=await req.json()}catch{return Response.json({error:"INVALID_JSON"},{status:400})}

  const {data:cfgRows,error:cfgError}=await ctx.supabaseAdmin.rpc("server_get_push_config");
  if(cfgError)return Response.json({error:"PUSH_CONFIG_READ_FAILED"},{status:500});

  if(body?.bootstrap===true){
    if(cfgRows?.length)return Response.json({ok:true,status:"ALREADY_CONFIGURED"});
    const vapid=await generateVapidKeys();
    const random=new Uint8Array(48);crypto.getRandomValues(random);
    const functionUrl=`${Deno.env.get("SUPABASE_URL")}/functions/v1/push-dispatch`;
    const {data:created,error:bootstrapError}=await ctx.supabaseAdmin.rpc("server_bootstrap_push_config",{
      p_function_url:functionUrl,
      p_webhook_secret:base64url(random),
      p_vapid_public_key:vapid.publicKey,
      p_vapid_private_key:vapid.privateKey,
      p_vapid_subject:"https://shiftpilot-two.vercel.app/"
    });
    if(bootstrapError)return Response.json({error:"BOOTSTRAP_FAILED"},{status:500});
    return Response.json({ok:true,status:created?"CONFIGURED":"ALREADY_CONFIGURED"});
  }

  if(!cfgRows?.length)return Response.json({error:"PUSH_NOT_CONFIGURED"},{status:503});
  const cfg=cfgRows[0];
  const supplied=req.headers.get("x-schichtfunk-push-secret")||"";
  if(!supplied||supplied!==cfg.webhook_secret)return Response.json({error:"UNAUTHORIZED"},{status:401});

  const notificationId=String(body.notification_id||"");
  if(!uuidRe.test(notificationId))return Response.json({error:"INVALID_NOTIFICATION_ID"},{status:400});

  const {data:notification,error:nError}=await ctx.supabaseAdmin.from("notifications")
    .select("id,company_id,user_id,kind,title,message,link_view,entity_type,entity_id,created_at")
    .eq("id",notificationId).maybeSingle();
  if(nError||!notification)return Response.json({error:"NOTIFICATION_NOT_FOUND"},{status:404});

  const mark=async(status:string,delivered=0,failed=0,error:string|null=null)=>{
    await ctx.supabaseAdmin.rpc("server_mark_push_dispatch",{
      p_notification_id:notificationId,p_status:status,p_delivered:delivered,p_failed:failed,p_error:error
    });
  };

  // Erlaubt aktive Manager-Mitglieder ODER regulär verknüpfte aktive Mitarbeiterkonten.
  const {data:membership,error:mError}=await ctx.supabaseAdmin.from("company_members")
    .select("user_id").eq("company_id",notification.company_id).eq("user_id",notification.user_id).eq("status","ACTIVE").maybeSingle();
  if(mError)throw mError;
  let activeEmployee:any=null;
  if(!membership){
    const {data,error}=await ctx.supabaseAdmin.from("employees")
      .select("id").eq("company_id",notification.company_id).eq("auth_user_id",notification.user_id)
      .eq("status","active").eq("access_status","ACTIVE").maybeSingle();
    if(error)throw error;
    activeEmployee=data;
  }
  if(!membership&&!activeEmployee){await mark("SKIPPED");return Response.json({ok:true,status:"SKIPPED",reason:"INACTIVE_ACCOUNT"})}

  const {data:subs,error:sError}=await ctx.supabaseAdmin.from("push_subscriptions")
    .select("id,endpoint,p256dh,auth_key")
    .eq("user_id",notification.user_id).eq("enabled",true);
  if(sError)throw sError;
  if(!subs?.length){await mark("SKIPPED");return Response.json({ok:true,status:"SKIPPED",delivered:0})}

  const link=notification.link_view?`/?sf_push_view=${encodeURIComponent(notification.link_view)}#app`:"/#app";
  const payload={
    title:notification.title||"SchichtFunk",
    body:notification.message||"Neue Benachrichtigung in SchichtFunk",
    url:link,
    tag:`sf-${notification.kind||"notice"}-${notification.entity_id||notification.id}`
  };
  const subscriptions=subs.map((s:any)=>({endpoint:s.endpoint,keys:{p256dh:s.p256dh,auth:s.auth_key}}));
  const urgent=new Set(["DISRUPTION_OFFER","ABSENCE_CONFLICT","TIME_ENTRY_CORRECTION"]);

  try{
    const result=await sendPushBatch(subscriptions,payload,{
      publicKey:cfg.vapid_public_key,privateKey:cfg.vapid_private_key,subject:cfg.vapid_subject
    },{ttl:86400,urgency:urgent.has(notification.kind)?"high":"normal",concurrency:20,timeoutMs:12000});

    const goneEndpoints=(result.gone||[]).map((g:any)=>typeof g==="string"?g:g?.endpoint).filter(Boolean);
    if(goneEndpoints.length)await ctx.supabaseAdmin.from("push_subscriptions").delete().in("endpoint",goneEndpoints);
    const delivered=Number(result.delivered||0),failed=(result.failed||[]).length;
    const errors=(result.failed||[]).slice(0,3).map((x:any)=>String(x?.error?.message||x?.error||"push failed")).join(" | ");
    const status=delivered>0?(failed>0?"PARTIAL":"SENT"):(failed>0?"FAILED":"SKIPPED");
    await mark(status,delivered,failed,errors||null);
    return Response.json({ok:status!=="FAILED",status,delivered,failed,gone:goneEndpoints.length});
  }catch(error){
    const message=String((error as Error)?.message||error).slice(0,1800);
    await mark("FAILED",0,subs.length,message);
    return Response.json({error:"PUSH_SEND_FAILED"},{status:502});
  }
});

export default {fetch:handler};
