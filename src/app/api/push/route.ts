import { NextResponse } from 'next/server';
import webpush from 'web-push';
import { supabase } from '@/lib/supabase';

webpush.setVapidDetails(
  process.env.VAPID_SUBJECT || 'mailto:user@example.com',
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!
);

export async function POST(req: Request) {
  try {
    const body = await req.json();

    if (body.action === 'subscribe') {
      await supabase
        .from('user_settings')
        .update({ push_subscription: body.subscription, updated_at: new Date().toISOString() })
        .eq('id', 1);
      return NextResponse.json({ success: true });
    }

    const { data: settings } = await supabase
      .from('user_settings')
      .select('push_subscription')
      .eq('id', 1)
      .single();

    const subscription = body.subscription || settings?.push_subscription;
    if (!subscription) {
      return NextResponse.json({ error: 'Chưa có thiết bị đăng ký Web Push' }, { status: 400 });
    }

    const payload = JSON.stringify({
      title: body.title || '🔥 MemoryCurve: Nhắc ôn tập hôm nay',
      body: body.message || 'Bạn có các thẻ ưu tiên cần lật ngay để bảo vệ trí nhớ!',
      url: '/'
    });

    await webpush.sendNotification(subscription, payload);
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}