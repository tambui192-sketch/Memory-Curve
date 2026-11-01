'use client';

import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

const STAGE_DAYS: Record<number, number> = { 1: 1, 2: 3, 3: 7, 4: 14, 5: 30, 6: 60 };

interface CardItem {
  id: string;
  title: string;
  category: string;
  context: string;
  notes: string[];
  diagram: string;
  stage: number;
  next_review_date: string;
  status: string;
}

export default function MemoryCurveApp() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'review'>('dashboard');
  const [cards, setCards] = useState<CardItem[]>([]);
  const [categories, setCategories] = useState<string[]>(['Tất cả']);
  const [activeCategory, setActiveCategory] = useState<string>('Tất cả');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);

  // Tiến độ & Cài đặt
  const [dailyCap, setDailyCap] = useState<number>(5);
  const [completedToday, setCompletedToday] = useState<number>(0);
  const [pushTime, setPushTime] = useState<string>('07:30');
  const [pushStatus, setPushStatus] = useState<string>('');

  // Flashcard state
  const [isFlipped, setIsFlipped] = useState<boolean>(false);

  // Modals
  const [showAddModal, setShowAddModal] = useState<boolean>(false);
  const [showSettingsModal, setShowSettingsModal] = useState<boolean>(false);

  // Form thêm thẻ & AI
  const [inputTitle, setInputTitle] = useState('');
  const [inputCategory, setInputCategory] = useState('Tự động hóa');
  const [inputContext, setInputContext] = useState('');
  const [inputNotes, setInputNotes] = useState('');
  const [showNewCatBox, setShowNewCatBox] = useState(false);
  const [newCatName, setNewCatName] = useState('');

  const [aiRawInput, setAiRawInput] = useState('');
  const [aiSplitCheckbox, setAiSplitCheckbox] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [splitPreviewCards, setSplitPreviewCards] = useState<any[]>([]);

  // 1. Tải dữ liệu từ Supabase khi mở App
  const fetchAllData = async () => {
    setLoading(true);
    const todayStr = new Date().toISOString().split('T')[0];

    const [{ data: catData }, { data: cardData }, { data: settingData }] = await Promise.all([
      supabase.from('categories').select('name').order('created_at', { ascending: true }),
      supabase.from('cards').select('*'),
      supabase.from('user_settings').select('*').eq('id', 1).single()
    ]);

    if (catData) {
      const names = catData.map((c) => c.name);
      setCategories(['Tất cả', ...names]);
      if (names.length > 0) setInputCategory(names[0]);
    }

    if (cardData) {
      setCards(cardData as CardItem[]);
    }

    if (settingData) {
      setDailyCap(settingData.daily_cap || 5);
      setPushTime(settingData.push_time || '07:30');
      const countToday = settingData.last_completed_date === todayStr ? settingData.completed_today : 0;
      setCompletedToday(countToday);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchAllData();
  }, []);

  // 2. Tính số ngày chênh lệch so với hôm nay (Âm = Trễ hạn, 0 = Hôm nay, Dương = Chưa tới hạn)
  const getDueOffsetDays = (nextDateStr: string) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const target = new Date(nextDateStr);
    target.setHours(0, 0, 0, 0);
    return Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  };

  // Điểm Criticality để đẩy thẻ nguy cơ quên cao nhất lên đầu
  const getCriticalityScore = (card: CardItem) => {
    const offset = getDueOffsetDays(card.next_review_date);
    if (offset < 0) return 1000 + Math.abs(offset) * 50 + (10 - card.stage) * 20;
    if (offset === 0) return 500 + (10 - card.stage) * 20;
    return 100 - offset * 2 - card.stage;
  };

  const getCriticalMeta = (card: CardItem) => {
    const offset = getDueOffsetDays(card.next_review_date);
    if (offset < 0) {
      return {
        badge: `🔴 Khẩn cấp • Trễ ${Math.abs(offset)} ngày`,
        badgeClass: 'bg-rose-50 text-rose-700 border-rose-200',
        borderClass: 'border-l-4 border-l-rose-500',
        reason: `Stage ${card.stage} (${STAGE_DAYS[card.stage]}d) & trễ lịch ➔ Ôn đầu tiên`
      };
    }
    if (offset === 0) {
      if (card.stage <= 2) {
        return {
          badge: '🟠 Ưu tiên cao • Hôm nay',
          badgeClass: 'bg-amber-50 text-amber-800 border-amber-200',
          borderClass: 'border-l-4 border-l-amber-500',
          reason: `Kiến thức mới (Stage ${card.stage}), cần củng cố hôm nay`
        };
      }
      return {
        badge: '🟡 Ôn định kỳ • Hôm nay',
        badgeClass: 'bg-yellow-50 text-yellow-800 border-yellow-200',
        borderClass: 'border-l-4 border-l-yellow-400',
        reason: `Đã qua ${card.stage} vòng lặp, ôn định kỳ hôm nay`
      };
    }
    return {
      badge: `🟢 An toàn • Còn ${offset} ngày`,
      badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      borderClass: 'border-l-4 border-l-emerald-400',
      reason: `Đã nắm khá vững (Stage ${card.stage})`
    };
  };

  const sortedCards = [...cards].sort((a, b) => getCriticalityScore(b) - getCriticalityScore(a));
  const dueQueue = sortedCards.filter((c) => getDueOffsetDays(c.next_review_date) <= 0);
  const currentReviewCard = dueQueue[0] || null;

  const filteredCards = sortedCards.filter((c) => {
    const matchCat = activeCategory === 'Tất cả' || c.category === activeCategory;
    const q = searchQuery.toLowerCase();
    const matchQ = c.title.toLowerCase().includes(q) || (c.context || '').toLowerCase().includes(q);
    return matchCat && matchQ;
  });

  // 3. Chấm điểm thẻ trong chế độ Ôn tập và lưu lên Supabase
  const handleGradeCard = async (action: 'reset' | 'hold' | 'next') => {
    if (!currentReviewCard) return;

    let newStage = currentReviewCard.stage;
    if (action === 'reset') newStage = 1;
    if (action === 'next') newStage = Math.min(6, currentReviewCard.stage + 1);

    const daysToAdd = STAGE_DAYS[newStage];
    const nextDate = new Date();
    nextDate.setDate(nextDate.getDate() + daysToAdd);
    const nextDateStr = nextDate.toISOString().split('T')[0];
    const todayStr = new Date().toISOString().split('T')[0];

    await supabase
      .from('cards')
      .update({
        stage: newStage,
        next_review_date: nextDateStr,
        last_reviewed_at: new Date().toISOString(),
        status: newStage === 6 ? 'mastered' : 'learning'
      })
      .eq('id', currentReviewCard.id);

    const newCompleted = completedToday + 1;
    setCompletedToday(newCompleted);
    await supabase
      .from('user_settings')
      .update({ completed_today: newCompleted, last_completed_date: todayStr })
      .eq('id', 1);

    setIsFlipped(false);
    fetchAllData();
  };

  // 4. Cập nhật Daily Cap
  const handleUpdateDailyCap = async (cap: number) => {
    setDailyCap(cap);
    await supabase.from('user_settings').update({ daily_cap: cap }).eq('id', 1);
  };

  // 5. Thêm Chủ đề mới vào Supabase
  const handleAddCategory = async () => {
    const val = newCatName.trim();
    if (!val) return;
    await supabase.from('categories').insert({ name: val });
    setCategories((prev) => (prev.includes(val) ? prev : [...prev, val]));
    setInputCategory(val);
    setNewCatName('');
    setShowNewCatBox(false);
  };

  // 6. Lưu 1 thẻ mới vào Supabase
  const handleSaveSingleCard = async () => {
    if (!inputTitle.trim() || !inputNotes.trim()) {
      alert('Vui lòng nhập Tên khái niệm và Các điểm chính cần nhớ!');
      return;
    }
    const notesArray = inputNotes
      .split('\n')
      .map((s) => s.replace(/^[-•]\s*/, '').trim())
      .filter(Boolean);

    const todayStr = new Date().toISOString().split('T')[0];
    await supabase.from('cards').insert({
      title: inputTitle.trim(),
      category: inputCategory,
      context: inputContext.trim() || 'Ghi chú học tập cá nhân',
      notes: notesArray,
      diagram: '[Khái niệm mới] ➔ [Stage 1: Nhắc sau 1 ngày]',
      stage: 1,
      next_review_date: todayStr
    });

    setInputTitle('');
    setInputContext('');
    setInputNotes('');
    setShowAddModal(false);
    fetchAllData();
  };

  // 7. Gọi Gemini AI Tóm tắt hoặc Tách nhiều thẻ
  const handleRunAI = async () => {
    if (!aiRawInput.trim()) {
      alert('Hãy dán nội dung tài liệu hoặc gõ chủ đề bạn muốn AI tổng hợp!');
      return;
    }
    setAiLoading(true);
    try {
      const res = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rawText: aiRawInput,
          splitCards: aiSplitCheckbox,
          categories: categories.filter((c) => c !== 'Tất cả')
        })
      });
      const data = await res.json();
      if (data.error) {
        alert(data.error);
      } else if (data.cards && data.cards.length > 0) {
        if (!aiSplitCheckbox || data.cards.length === 1) {
          const c = data.cards[0];
          setSplitPreviewCards([]);
          setInputTitle(c.title || '');
          setInputCategory(c.category || inputCategory);
          setInputContext(c.context || '');
          setInputNotes((c.notes || []).map((n: string) => `- ${n}`).join('\n'));
        } else {
          setSplitPreviewCards(data.cards);
        }
      }
    } catch (e) {
      alert('Không thể kết nối AI API.');
    }
    setAiLoading(false);
  };

  const handleSaveAllSplitCards = async () => {
    const todayStr = new Date().toISOString().split('T')[0];
    const rows = splitPreviewCards.map((c) => ({
      title: c.title,
      category: c.category || inputCategory,
      context: c.context || 'AI tách từ tài liệu kỹ thuật',
      notes: c.notes || [],
      diagram: c.diagram || '[Tài liệu] ➔ [AI Tách thẻ] ➔ [Stage 1]',
      stage: 1,
      next_review_date: todayStr
    }));
    await supabase.from('cards').insert(rows);
    setSplitPreviewCards([]);
    setAiRawInput('');
    setShowAddModal(false);
    fetchAllData();
  };

  // 8. Đăng ký & Bắn thử Web Push Notification thật
  const handleEnableAndTestWebPush = async () => {
    try {
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        setPushStatus('Trình duyệt này không hỗ trợ Web Push.');
        return;
      }
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setPushStatus('Bạn cần bấm Cho phép (Allow) thông báo trên trình duyệt.');
        return;
      }

      const reg = await navigator.serviceWorker.register('/sw.js');
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
      });

      await fetch('/api/push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'subscribe', subscription: sub })
      });

      await fetch('/api/push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subscription: sub,
          title: `🔥 MemoryCurve: ${dueQueue.length} thẻ cần ôn hôm nay`,
          message: currentReviewCard
            ? `Ưu tiên #1: ${currentReviewCard.title} (Stage ${currentReviewCard.stage}). Chạm để ôn ngay!`
            : 'Tất cả thẻ hôm nay đã hoàn thành!'
        })
      });

      setPushStatus('✅ Đã kích hoạt & bắn thông báo Web Push thành công!');
    } catch (err: any) {
      setPushStatus('⚠️ Lưu ý: Kiểm tra lại NEXT_PUBLIC_VAPID_PUBLIC_KEY trong .env.local');
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900 pb-20 md:pb-8">
      {/* HEADER CHUẨN MOBILE-FIRST V2.1 */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-slate-200">
        <div className="max-w-5xl mx-auto px-3.5 sm:px-4 py-2.5 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 shrink-0">
            <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center text-white font-bold text-base shadow-sm">
              M
            </div>
            <div className="leading-tight">
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-slate-900 tracking-tight text-sm sm:text-base">MemoryCurve</span>
                <span className="hidden sm:inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600 border border-indigo-100">
                  Live App
                </span>
              </div>
              <span className="block sm:hidden text-[10px] font-medium text-slate-400">Spaced Repetition</span>
            </div>
          </div>

          <nav className="hidden md:flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200/70">
            <button
              onClick={() => setActiveTab('dashboard')}
              className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${
                activeTab === 'dashboard' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              📚 Kho thẻ & Tiến độ
            </button>
            <button
              onClick={() => setActiveTab('review')}
              className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 whitespace-nowrap ${
                activeTab === 'review' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span>⚡ Ôn tập</span>
              <span className="px-1.5 py-0.2 text-[10px] rounded-full bg-rose-500 text-white font-bold">
                {dueQueue.length}
              </span>
            </button>
          </nav>

          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <button
              onClick={() => setShowAddModal(true)}
              className="px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-sm transition flex items-center gap-1 whitespace-nowrap"
            >
              <span>+ Thêm thẻ</span>
            </button>
            <button
              onClick={() => setShowSettingsModal(true)}
              className="w-9 h-9 rounded-xl border border-slate-200 hover:bg-slate-100 text-slate-600 transition flex items-center justify-center shrink-0"
            >
              ⚙️
            </button>
          </div>
        </div>

        {/* Thanh Tab cho Điện thoại */}
        <div className="md:hidden px-3.5 pb-2.5">
          <div className="grid grid-cols-2 bg-slate-100 p-1 rounded-xl border border-slate-200/70">
            <button
              onClick={() => setActiveTab('dashboard')}
              className={`py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-1.5 whitespace-nowrap ${
                activeTab === 'dashboard' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
              }`}
            >
              📚 Kho thẻ & Tiến độ
            </button>
            <button
              onClick={() => setActiveTab('review')}
              className={`py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-1.5 whitespace-nowrap ${
                activeTab === 'review' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
              }`}
            >
              <span>⚡ Chế độ Ôn tập</span>
              <span className="px-1.5 py-0.2 text-[10px] rounded-full bg-rose-500 text-white font-bold">
                {dueQueue.length}
              </span>
            </button>
          </div>
        </div>
      </header>

      {/* NỘI DUNG CHÍNH */}
      <main className="flex-1 max-w-5xl w-full mx-auto px-3.5 sm:px-4 py-4 sm:py-6">
        {activeTab === 'dashboard' ? (
          <section className="space-y-4 sm:space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-12 gap-3.5 sm:gap-4">
              {/* Khối 1: Ưu tiên chống quên hôm nay */}
              <div className="md:col-span-7 bg-gradient-to-br from-indigo-600 to-violet-700 rounded-2xl p-4 sm:p-5 text-white shadow-sm flex items-center justify-between gap-3">
                <div className="space-y-1 min-w-0">
                  <div className="inline-flex items-center gap-1 text-[11px] font-medium text-indigo-100 bg-white/15 px-2.5 py-0.5 rounded-full whitespace-nowrap">
                    🔥 Ưu tiên chống quên hôm nay
                  </div>
                  <div className="flex items-baseline gap-2 pt-1">
                    <span className="text-3xl sm:text-4xl font-extrabold tracking-tight">{dueQueue.length}</span>
                    <span className="text-xs sm:text-sm text-indigo-100 font-medium whitespace-nowrap">
                      thẻ đến hạn cần ôn
                    </span>
                  </div>
                  <p className="text-[11px] sm:text-xs text-indigo-100/90 leading-snug">
                    {dueQueue.length > 0
                      ? `Thẻ ưu tiên #1: ${dueQueue[0].title} (Stage ${dueQueue[0].stage})`
                      : 'Tất cả thẻ hôm nay đã được ôn xong!'}
                  </p>
                </div>
                <button
                  onClick={() => setActiveTab('review')}
                  className="px-4 py-2.5 sm:px-5 sm:py-3 rounded-xl bg-white text-indigo-700 hover:bg-indigo-50 font-bold text-xs sm:text-sm shadow-md transition shrink-0 whitespace-nowrap"
                >
                  Ôn ngay →
                </button>
              </div>

              {/* Khối 2: Tiến độ hôm nay */}
              <div className="md:col-span-5 bg-white rounded-2xl p-4 sm:p-5 border border-slate-200/80 shadow-xs flex flex-col justify-between gap-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 whitespace-nowrap">
                    Tiến độ hôm nay
                  </span>
                  <div className="flex items-center gap-0.5 bg-slate-100 p-0.5 rounded-lg border border-slate-200/60 shrink-0">
                    <span className="text-[11px] text-slate-500 px-1.5">Mục tiêu:</span>
                    {[3, 5, 10].map((num) => (
                      <button
                        key={num}
                        onClick={() => handleUpdateDailyCap(num)}
                        className={`px-2 py-0.5 text-xs rounded-md ${
                          dailyCap === num ? 'font-semibold bg-white text-indigo-600 shadow-sm' : 'text-slate-600'
                        }`}
                      >
                        {num}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex items-baseline justify-between gap-2">
                  <div className="whitespace-nowrap">
                    <span className="text-2xl sm:text-3xl font-extrabold text-slate-900">{completedToday}</span>
                    <span className="text-xs sm:text-sm text-slate-500 font-medium">
                      / {dailyCap} thẻ tối đa/ngày
                    </span>
                  </div>
                  <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200/60 px-2.5 py-0.5 rounded-full whitespace-nowrap">
                    {completedToday >= dailyCap
                      ? 'Đã đạt mục tiêu'
                      : `Còn ${Math.max(0, dailyCap - completedToday)} thẻ trong ngưỡng`}
                  </span>
                </div>

                <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-indigo-600 transition-all duration-300"
                    style={{ width: `${Math.min(100, Math.round((completedToday / dailyCap) * 100))}%` }}
                  />
                </div>
              </div>
            </div>

            {/* Danh sách thẻ theo Criticality */}
            <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200/80 shadow-xs space-y-3.5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3.5">
                <div>
                  <h2 className="text-sm sm:text-base font-bold text-slate-900">
                    Danh sách thẻ theo mức độ ưu tiên (Criticality)
                  </h2>
                  <p className="text-[11px] sm:text-xs text-slate-500 mt-0.5">
                    Tự động xếp thẻ <b>Trễ hạn & Stage thấp (mới học, dễ quên nhất)</b> lên đầu.
                  </p>
                </div>
                <input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  type="text"
                  placeholder="🔍 Tìm thiết bị, khái niệm..."
                  className="w-full sm:w-64 px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                {categories.map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setActiveCategory(cat)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap transition ${
                      activeCategory === cat
                        ? 'bg-slate-900 text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200/70'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>

              {loading ? (
                <div className="py-12 text-center text-xs text-slate-400">Đang tải dữ liệu từ Supabase...</div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                  {filteredCards.map((card, idx) => {
                    const meta = getCriticalMeta(card);
                    return (
                      <div
                        key={card.id}
                        className={`p-3.5 sm:p-4 rounded-2xl bg-white border border-slate-200/80 ${meta.borderClass} hover:shadow-md transition flex flex-col justify-between gap-2.5`}
                      >
                        <div className="space-y-2">
                          <div className="flex items-center justify-between gap-1.5 flex-wrap">
                            <span
                              className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full border ${meta.badgeClass} whitespace-nowrap`}
                            >
                              #{idx + 1} • {meta.badge}
                            </span>
                            <span className="text-[11px] font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md whitespace-nowrap">
                              Stage {card.stage}/6 ({STAGE_DAYS[card.stage]}d)
                            </span>
                          </div>
                          <h3 className="font-bold text-slate-900 text-sm">{card.title}</h3>
                          <p className="text-xs text-slate-500 line-clamp-1">📍 {card.context}</p>
                          <ul className="text-xs text-slate-600 space-y-1 pt-1 border-t border-slate-100">
                            {(card.notes || []).slice(0, 2).map((n, i) => (
                              <li key={i} className="line-clamp-1">
                                • {n}
                              </li>
                            ))}
                          </ul>
                        </div>
                        <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-[11px] gap-2">
                          <span className="text-slate-400 italic truncate">{meta.reason}</span>
                          <span className="font-semibold text-indigo-600 whitespace-nowrap">{card.category}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </section>
        ) : (
          /* TAB 2: CHẾ ĐỘ ÔN TẬP */
          <section className="max-w-2xl mx-auto space-y-4">
            <div className="flex items-center justify-between bg-white px-4 py-3 rounded-2xl border border-slate-200/80 shadow-xs">
              <span className="text-xs font-semibold text-slate-700">🔥 Ôn tập theo thứ tự Critical</span>
              <span className="text-xs font-medium text-slate-500">
                Còn lại: <b className="text-indigo-600">{dueQueue.length}</b> thẻ hôm nay
              </span>
            </div>

            {currentReviewCard ? (
              <div className="bg-white rounded-3xl border border-slate-200/90 shadow-sm overflow-hidden">
                <div className="px-4 sm:px-6 py-3.5 bg-slate-50/70 border-b border-slate-100 flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-lg bg-indigo-50 text-indigo-700">
                      {currentReviewCard.category}
                    </span>
                    <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-lg bg-rose-50 text-rose-600 border border-rose-200">
                      Stage {currentReviewCard.stage}/6
                    </span>
                  </div>
                  <span className="text-[11px] font-medium text-slate-400">
                    Chu kỳ: {STAGE_DAYS[currentReviewCard.stage]} ngày
                  </span>
                </div>

                <div className="p-5 sm:p-8 space-y-4">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      Khái niệm / Thiết bị
                    </span>
                    <h3 className="text-xl sm:text-2xl font-extrabold text-slate-900 mt-1">
                      {currentReviewCard.title}
                    </h3>
                  </div>

                  <div className="p-3 rounded-xl bg-amber-50/70 border border-amber-200/70 text-xs text-amber-900">
                    📍 <b>Bối cảnh thực tế:</b> {currentReviewCard.context}
                  </div>

                  {!isFlipped ? (
                    <div className="pt-4 pb-1 text-center">
                      <p className="text-[11px] text-slate-400 mb-3">
                        Tự nhẩm lại nguyên lý hoạt động trước khi lật thẻ
                      </p>
                      <button
                        onClick={() => setIsFlipped(true)}
                        className="w-full sm:w-auto px-6 py-3 rounded-2xl bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs sm:text-sm shadow-md"
                      >
                        👁️ Lật thẻ xem điểm cốt lõi
                      </button>
                    </div>
                  ) : (
                    <div className="pt-4 border-t border-slate-100 space-y-4">
                      <div>
                        <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-600">
                          📌 Điểm chính cần nhớ
                        </span>
                        <ul className="mt-2 space-y-2 text-xs sm:text-sm text-slate-700">
                          {(currentReviewCard.notes || []).map((n, i) => (
                            <li key={i} className="flex items-start gap-2">
                              <span className="text-indigo-600 font-bold">•</span>
                              <span>{n}</span>
                            </li>
                          ))}
                        </ul>
                      </div>

                      {currentReviewCard.diagram && (
                        <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/80">
                          <div className="text-[11px] font-semibold text-slate-500 mb-1.5">
                            📐 Sơ đồ ghi nhớ nhanh
                          </div>
                          <div className="text-[11px] sm:text-xs font-mono text-slate-700 bg-white p-2.5 rounded-xl border border-slate-200/60">
                            {currentReviewCard.diagram}
                          </div>
                        </div>
                      )}

                      <div className="grid grid-cols-3 gap-2 pt-2">
                        <button
                          onClick={() => handleGradeCard('reset')}
                          className="p-2.5 rounded-2xl border border-rose-200 bg-rose-50/60 text-rose-700 text-center"
                        >
                          <div className="font-bold text-xs">1. Quên mất</div>
                          <div className="text-[10px] opacity-80 mt-0.5">Về Stage 1 (1d)</div>
                        </button>
                        <button
                          onClick={() => handleGradeCard('hold')}
                          className="p-2.5 rounded-2xl border border-amber-200 bg-amber-50/60 text-amber-800 text-center"
                        >
                          <div className="font-bold text-xs">2. Nhớ sơ sơ</div>
                          <div className="text-[10px] opacity-80 mt-0.5">
                            Giữ Stage {currentReviewCard.stage} ({STAGE_DAYS[currentReviewCard.stage]}d)
                          </div>
                        </button>
                        <button
                          onClick={() => handleGradeCard('next')}
                          className="p-2.5 rounded-2xl border border-emerald-200 bg-emerald-50/70 text-emerald-800 text-center"
                        >
                          <div className="font-bold text-xs">3. Nhớ rõ</div>
                          <div className="text-[10px] opacity-80 mt-0.5">
                            Lên Stage {Math.min(6, currentReviewCard.stage + 1)} (
                            {STAGE_DAYS[Math.min(6, currentReviewCard.stage + 1)]}d)
                          </div>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="bg-white rounded-3xl p-8 text-center border border-slate-200 space-y-3">
                <div className="text-3xl">🎉</div>
                <h3 className="text-base sm:text-lg font-bold text-slate-900">
                  Đã hoàn thành toàn bộ thẻ ưu tiên hôm nay!
                </h3>
                <button
                  onClick={() => setActiveTab('dashboard')}
                  className="px-5 py-2.5 rounded-xl bg-slate-900 text-white text-xs font-semibold"
                >
                  Quay về Kho thẻ
                </button>
              </div>
            )}
          </section>
        )}
      </main>

      {/* MODAL THÊM THẺ + AI TỔNG HỢP */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white rounded-t-3xl sm:rounded-3xl max-w-2xl w-full max-h-[92vh] overflow-y-auto border border-slate-200">
            <div className="sticky top-0 bg-white px-5 py-3.5 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-bold text-slate-900 text-sm sm:text-base">Thêm kiến thức mới</h3>
              <button onClick={() => setShowAddModal(false)} className="w-8 h-8 rounded-lg hover:bg-slate-100">
                ✕
              </button>
            </div>

            <div className="p-4 sm:p-6 space-y-5">
              {/* Khối AI */}
              <div className="p-4 rounded-2xl bg-indigo-50/70 border border-indigo-200/80 space-y-3">
                <div className="text-xs font-bold text-indigo-900">
                  ✨ Trợ lý AI Tổng hợp & Tách thẻ từ Tài liệu
                </div>
                <textarea
                  value={aiRawInput}
                  onChange={(e) => setAiRawInput(e.target.value)}
                  rows={3}
                  placeholder="Dán đoạn tài liệu kỹ thuật, ghi chú hoặc chủ đề bạn muốn học..."
                  className="w-full p-2.5 text-xs rounded-xl bg-white border border-indigo-200"
                />
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                  <label className="inline-flex items-center gap-2 text-xs text-slate-700 font-medium cursor-pointer">
                    <input
                      type="checkbox"
                      checked={aiSplitCheckbox}
                      onChange={(e) => setAiSplitCheckbox(e.target.checked)}
                    />
                    Tách thành nhiều thẻ nhỏ (Bỏ chọn nếu muốn giữ chung 1 thẻ)
                  </label>
                  <button
                    onClick={handleRunAI}
                    disabled={aiLoading}
                    className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-xs font-semibold"
                  >
                    {aiLoading ? 'Đang phân tích...' : '✨ AI Phân tích & Điền'}
                  </button>
                </div>

                {splitPreviewCards.length > 0 && (
                  <div className="pt-3 border-t border-indigo-200 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-indigo-950">
                        AI đã tách thành {splitPreviewCards.length} thẻ:
                      </span>
                      <button
                        onClick={handleSaveAllSplitCards}
                        className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold"
                      >
                        💾 Lưu tất cả vào Kho
                      </button>
                    </div>
                    {splitPreviewCards.map((c, i) => (
                      <div key={i} className="p-2.5 rounded-xl bg-white border border-indigo-100 text-xs">
                        <b>#{i + 1}: {c.title}</b> ({c.category})
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Form thủ công */}
              <div className="space-y-3.5">
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                  <div className="sm:col-span-7">
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Tên khái niệm *</label>
                    <input
                      value={inputTitle}
                      onChange={(e) => setInputTitle(e.target.value)}
                      type="text"
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200"
                    />
                  </div>
                  <div className="sm:col-span-5">
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-semibold text-slate-700">Chủ đề *</label>
                      <button
                        type="button"
                        onClick={() => setShowNewCatBox(!showNewCatBox)}
                        className="text-[11px] font-semibold text-indigo-600"
                      >
                        + Thêm chủ đề
                      </button>
                    </div>
                    <select
                      value={inputCategory}
                      onChange={(e) => setInputCategory(e.target.value)}
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-white"
                    >
                      {categories
                        .filter((c) => c !== 'Tất cả')
                        .map((cat) => (
                          <option key={cat} value={cat}>
                            {cat}
                          </option>
                        ))}
                    </select>
                    {showNewCatBox && (
                      <div className="mt-2 flex gap-1.5">
                        <input
                          value={newCatName}
                          onChange={(e) => setNewCatName(e.target.value)}
                          placeholder="Tên chủ đề mới..."
                          className="flex-1 px-2 py-1 text-xs rounded-lg border border-indigo-300"
                        />
                        <button
                          onClick={handleAddCategory}
                          className="px-2.5 py-1 rounded-lg bg-indigo-600 text-white text-xs font-semibold"
                        >
                          Thêm
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Bối cảnh thực tế</label>
                  <input
                    value={inputContext}
                    onChange={(e) => setInputContext(e.target.value)}
                    type="text"
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Các điểm chính cần nhớ (Mỗi ý 1 dòng) *
                  </label>
                  <textarea
                    value={inputNotes}
                    onChange={(e) => setInputNotes(e.target.value)}
                    rows={4}
                    className="w-full p-3 text-xs rounded-xl border border-slate-200"
                  />
                </div>
              </div>
            </div>

            <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-100 flex justify-end gap-2">
              <button
                onClick={() => setShowAddModal(false)}
                className="px-4 py-2 rounded-xl border border-slate-200 bg-white text-xs font-semibold"
              >
                Hủy
              </button>
              <button
                onClick={handleSaveSingleCard}
                className="px-5 py-2 rounded-xl bg-slate-900 text-white text-xs font-semibold"
              >
                Lưu thẻ vào Kho
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL CÀI ĐẶT WEB PUSH */}
      {showSettingsModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white rounded-t-3xl sm:rounded-3xl max-w-lg w-full border border-slate-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-bold text-slate-900 text-sm sm:text-base">⚙️ Cài đặt Web Push Notification</h3>
              <button onClick={() => setShowSettingsModal(false)} className="w-8 h-8 rounded-lg hover:bg-slate-100">
                ✕
              </button>
            </div>
            <div className="p-5 space-y-4 text-xs">
              <div className="p-4 rounded-2xl bg-indigo-50/70 border border-indigo-200 space-y-3">
                <div className="font-bold text-indigo-950">🔔 Web Push Notification (Trình duyệt Điện thoại & PC)</div>
                <div className="flex items-center justify-between gap-2">
                  <span>Giờ nhắc mỗi sáng:</span>
                  <input
                    type="time"
                    value={pushTime}
                    onChange={(e) => setPushTime(e.target.value)}
                    className="px-2.5 py-1 rounded-lg border border-indigo-200 bg-white font-semibold"
                  />
                </div>
                <button
                  onClick={handleEnableAndTestWebPush}
                  className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold"
                >
                  📲 Cấp quyền & Bắn thử Web Push ngay
                </button>
                {pushStatus && <p className="text-[11px] text-indigo-700 font-medium">{pushStatus}</p>}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}