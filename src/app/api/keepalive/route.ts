// Supabase 자동 일시정지 막기.
//  Supabase 무료 프로젝트는 7일 동안 접속이 없으면 멈춘다. Vercel Cron(vercel.json)이 하루 한 번 이 주소를 불러
//  데이터베이스의 keepalive() 함수(1을 돌려주기만 함)를 실행한다. 사용자 데이터는 읽지 않는다.
//  CRON_SECRET 환경변수가 있으면 Vercel이 보내는 그 값이 맞을 때만 실행한다.

import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return Response.json({ ok: false, error: "supabase env missing" }, { status: 500 });

  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await supabase.rpc("keepalive");
  if (error) {
    console.error("[keepalive] failed", error.message);
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
  return Response.json({ ok: data === 1, at: new Date().toISOString() });
}
