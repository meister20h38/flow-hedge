"use client";

import { useEffect, useState } from "react";
import { ModeToggle } from "@/components/ModeToggle"; 
import Calendar from 'react-calendar';
import 'react-calendar/dist/Calendar.css'; // 標準スタイル
import './calendar-custom.css'; // ダークモード用などの自作スタイル

const STATUS_CYCLE = ["未着手", "進行中", "通過", "お祈り"];
const SELECTION_GROUPS = ["第一志望群", "第二志望群", "検討中", "終了"];

const getStatusClass = (status: string) => {
  switch (status) {
    case "進行中": return "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800";
    case "通過":   return "bg-green-100 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-300 dark:border-green-800";
    case "お祈り": return "bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800 text-opacity-70";
    default:       return "bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700";
  }
};

const getGroupLabelClass = (group: string) => {
  switch (group) {
    case "第一志望群": 
      return "bg-rose-500 dark:bg-rose-600 text-white";
    case "第二志望群": 
      return "bg-amber-500 dark:bg-amber-600 text-white";
    case "検討中":     
      return "bg-slate-400 dark:bg-slate-600 text-white";
    default:           
      return "bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300";
  }
};

const getGroupBorderClass = (group: string) => {
  switch (group) {
    case "第一志望群": 
      return "border-l-4 border-l-rose-500 dark:border-l-rose-400";
    case "第二志望群": 
      return "border-l-4 border-l-amber-500 dark:border-l-amber-400";
    case "検討中":     
      return "border-l-4 border-l-slate-400 dark:border-l-slate-500";
    default:           
      return "border-l-4 border-l-slate-200 dark:border-l-slate-700 opacity-50";
  }
};

const toLocalISOString = (date: Date) => {
  const offset = date.getTimezoneOffset() * 60000; // 差分をミリ秒で取得
  const localISOTime = new Date(date.getTime() - offset).toISOString().slice(0, 16);
  return localISOTime;
};

interface SelectionStep {
  id: number;
  step_name: string;
  status: string;
  scheduled_date: string;
  step_order: number;
}

interface Company {
  id: number;
  name: string;
  priority: number;
  selection_group: string;
  steps: SelectionStep[];
}

export default function Home() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [name, setName] = useState("");
  const [priority, setPriority] = useState(1);
  const [selectionGroup, setSelectionGroup] = useState("第二志望群");
  const [loading, setLoading] = useState(false);
  const [addingStepTo, setAddingStepTo] = useState<number | null>(null);
  const [newStepName, setNewStepName] = useState("");
  const [newStepDate, setNewStepDate] = useState("");
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [editingStepId, setEditingStepId] = useState<number | null>(null);
  const [editStepName, setEditStepName] = useState("");
  const [editStepDate, setEditStepDate] = useState("");
  const [editStepEndDate, setEditStepEndDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [newStepEndDate, setNewStepEndDate] = useState("");

  // 開始時間が変更された時の処理
  const handleNewStepDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newStart = e.target.value;
    setNewStepDate(newStart); // 開始時間をセット

    if (newStart) {
      const startDate = new Date(newStart);
      // 1時間後を計算
      const endDate = new Date(startDate.getTime() + 60 * 60 * 1000);

      // YYYY-MM-DDTHH:mm 形式に整形
      const year = endDate.getFullYear();
      const month = String(endDate.getMonth() + 1).padStart(2, '0');
      const day = String(endDate.getDate()).padStart(2, '0');
      const hours = String(endDate.getHours()).padStart(2, '0');
      const minutes = String(endDate.getMinutes()).padStart(2, '0');

      setNewStepEndDate(`${year}-${month}-${day}T${hours}:${minutes}`);
    }
  };

  const fetchCompanies = async () => {
    try {
      const res = await fetch("http://localhost:8080/companies");
      const data = await res.json();
      const sortedData = data.map((company: any) => ({
        ...company,
        steps: company.steps?.sort((a: any, b: any) => a.step_order - b.step_order)
      }));

      setCompanies(sortedData);
    } catch (err) {
      console.error("取得エラー:", err);
      setCompanies([]);
    }
  };

  useEffect(() => { fetchCompanies(); }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // フロント側での簡易チェック
    const isDuplicate = companies.some(c => c.name.toLowerCase() === name.toLowerCase());
    if (isDuplicate) {
      alert("その企業は既にリストに存在します。");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("http://localhost:8080/companies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, priority: Number(priority), selection_group: selectionGroup }),
      });
      if (res.ok) {
        setName(""); setPriority(1); setSelectionGroup("第二志望群");
        fetchCompanies();
      }
    } catch (err) { console.error("送信エラー:", err); } finally { setLoading(false); }
  };

  const updateCompanyGroup = async (companyId: number, newGroup: string) => {
    try {
      const res = await fetch(`http://localhost:8080/companies/${companyId}/group`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ selection_group: newGroup }),
      });
      if (res.ok) fetchCompanies();
    } catch (err) { console.error("グループ更新エラー:", err); }
  };

  const handleStatusClick = async (stepId: number, currentStatus: string) => {
    // ステータスの順序を定義（クリックするたびに次へ）
    const statuses = ["未着手", "準備中", "完了", "通過", "お祈り"];
    const currentIndex = statuses.indexOf(currentStatus);
    const nextStatus = statuses[(currentIndex + 1) % statuses.length];

    try {
      // PATCH エンドポイントを叩く
      const res = await fetch(`http://localhost:8080/steps/${stepId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: nextStatus, // ステータスのみ更新
        }),
      });

      if (res.ok) {
        fetchCompanies(); // リストを再取得して反映
      }
    } catch (err) {
      console.error("ステータス更新エラー:", err);
    }
  };

  const handleAddStep = async (companyId: number) => {
    // ... (リクエスト送信) ...
    const response = await fetch(`http://localhost:8080/companies/${companyId}/steps`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        step_name: newStepName,
        scheduled_date: newStepDate ? new Date(newStepDate).toISOString() : null,
        end_time: newStepEndDate ? new Date(newStepEndDate).toISOString() : null,
        status: "未着手"
      })
    });

    if (response.ok) {
      const savedStep = await response.json(); // サーバーで生成された id, step_order が入っている

      // companies ステートを更新
      setCompanies(prev => prev.map(c => {
        if (c.id === companyId) {
          return {
            ...c,
            steps: [...(c.steps || []), savedStep] // サーバーから来た最新のオブジェクトを追加
          };
        }
        return c;
      }));

      // 入力欄をクリア
      setNewStepName("");
      setAddingStepTo(null);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("本当に削除しますか？")) return;
    await fetch(`http://localhost:8080/companies/${id}`, { method: "DELETE" });
    fetchCompanies();
  };

  const handleDeleteStep = async (id: number) => {
    if (!confirm("ステップを削除しますか？")) return;
    await fetch(`http://localhost:8080/steps/${id}`, { method: "DELETE" });
    fetchCompanies();
  };

  const getTileContent = ({ date, view }: { date: Date, view: string }) => {
    if (view !== 'month') return null;

    const daySteps = getStepsByDate(date);
    if (daySteps.length === 0) return null;

    const sortedSteps = daySteps.slice().sort((a, b) => {
      // 日付データがない場合は後ろに回す
      if (!a.scheduled_date) return 1;
      if (!b.scheduled_date) return -1;

      return new Date(a.scheduled_date).getTime() - new Date(b.scheduled_date).getTime();
    });

    return (
      <div className="flex flex-col gap-1 mt-1 w-full">
        {sortedSteps.map(s => {
          const parentCompany = companies.find(c => c.name === s.companyName);
          const groupClass = getGroupLabelClass(parentCompany?.selection_group || "");

          const timeStr = s.scheduled_date
            ? new Date(s.scheduled_date).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })
            : "";
          
          return (
            <div
              key={s.id}
              className={`calendar-label text-[9px] flex justify-between items-center px-1 ${groupClass}`}
              title={`${s.companyName} (${timeStr}): ${s.step_name}`}
            >
              <span className="truncate">{s.companyName}</span>
            </div>
          );
        })}
      </div>
    );
  };

  const getStepsByDate = (date: Date) => {
    // 選択された日付を "YYYY-MM-DD" 形式の文字列にする
    const dateStr = date.toLocaleDateString('sv-SE'); // sv-SEロケールを使うと YYYY-MM-DD が簡単に取れます

    const filteredSteps = companies.flatMap(company =>
      (company.steps || [])
        .filter(step => {
          if (!step.scheduled_date) return false;
          // DBの日付文字列から日付部分だけを抽出して比較
          const stepDate = new Date(step.scheduled_date).toLocaleDateString('sv-SE');
          return stepDate === dateStr;
        })
        .map(step => ({
          ...step,
          companyName: company.name,
          // グループ情報も持たせておくと、詳細パネルでの色分けに便利です
          selection_group: company.selection_group
        }))
    );

    // --- ここで時間順（昇順）にソート ---
    return filteredSteps.sort((a, b) => {
      const timeA = a.scheduled_date ? new Date(a.scheduled_date).getTime() : 0;
      const timeB = b.scheduled_date ? new Date(b.scheduled_date).getTime() : 0;
      return timeA - timeB;
    });
  };

  const handleUpdateStep = async (stepId: number) => {
    const payload = {
      step_name: editStepName,
      // 秒まで含めたISO形式で送信
      scheduled_date: editStepDate ? new Date(editStepDate).toISOString() : null,
      end_time: editStepEndDate ? new Date(editStepEndDate).toISOString() : null,
    };

    try {
      const res = await fetch(`http://localhost:8080/steps/${stepId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        setEditingStepId(null);
        fetchCompanies(); // 成功したら再取得
      } else {
        const errorText = await res.text();
        console.error("更新失敗:", errorText);
        alert("更新に失敗しました。サーバーログを確認してください。");
      }
    } catch (err) {
      console.error("通信エラー:", err);
    }
  };

  const moveStep = async (companyId: number | string, stepId: number | string, direction: 'up' | 'down') => {
    // 1. 数値に強制変換（文字列だと findIndex 等で失敗することがあるため）
    const cId = Number(companyId);
    const sId = Number(stepId);

    const company = companies.find((c) => Number(c.id) === cId);
    if (!company || !company.steps) return;

    const newSteps = [...company.steps];
    const currentIndex = newSteps.findIndex((s) => Number(s.id) === sId);
    const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;

    if (targetIndex < 0 || targetIndex >= newSteps.length) return;

    // 要素入れ替え
    const [movedItem] = newSteps.splice(currentIndex, 1);
    newSteps.splice(targetIndex, 0, movedItem);

    // 2. 送信データ作成（ここでも id を Number にする）
    const payload = {
      steps: newSteps.map((s, index) => ({
        id: Number(s.id),
        step_order: index // ここが "stepOrder" になっていないか確認！
      }))
    };

    console.log("Sending Payload:", payload); // デバッグ用

    try {
      const response = await fetch(`http://localhost:8080/companies/${cId}/steps/reorder`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        fetchCompanies();
      } else {
        const errorData = await response.json();
        console.error("Server Error:", errorData);
      }
    } catch (error) {
      console.error("Network Error:", error);
    }
  };

  // 単一のstep_orderを更新するヘルパー
  const handleUpdateStepOrder = async (stepId: number, newOrder: int) => {
    await fetch(`http://localhost:8080/steps/${stepId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ step_order: newOrder }),
    });
  };

return (
    <main className="min-h-screen bg-slate-50 dark:bg-slate-900 py-8 px-6 transition-colors duration-300 text-slate-900 dark:text-slate-100">
      <div className="max-w-[1600px] mx-auto">
        
        {/* --- ヘッダー --- */}
        <div className="flex justify-between items-center mb-10">
          <h1 className="text-4xl font-black tracking-tighter text-slate-800 dark:text-white">🚀 Flow Hedge</h1>
          <ModeToggle />
        </div>

        {/* --- メイングリッド (12カラム) --- */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          
          {/* 左側：メインエリア (カレンダー & フォーム) -> 8カラム分 */}
          <div className="lg:col-span-8 space-y-8">
            
            {/* カレンダーセクション */}
            <section className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700">
              <div className="flex flex-col xl:flex-row gap-8">
                {/* カレンダー本体 */}
                <div className="flex-[3] min-w-0"> 
                  <h2 className="text-xs font-bold text-slate-500 mb-4 uppercase tracking-widest">選考カレンダー</h2>
                  <div className="calendar-container border dark:border-slate-700 rounded-xl p-4 bg-slate-50/50 dark:bg-slate-900/20">
                    <Calendar 
                      locale="ja-JP"
                      value={selectedDate}
                      onClickDay={(date) => setSelectedDate(date)}
                      tileContent={getTileContent}
                      className="w-full border-none bg-transparent dark:text-slate-100"
                    />
                  </div>
                </div>

                {/* 選択日の詳細パネル */}
              <div className="space-y-3">
                {getStepsByDate(selectedDate).length > 0 ? (
                  (() => {
                    const steps = getStepsByDate(selectedDate);
                    return steps.map((s, index) => {
                      // --- 重複チェックロジック ---
                      let isOverlapping = false;
                      if (s.scheduled_date && s.end_time && index < steps.length - 1) {
                        const nextStep = steps[index + 1];
                        if (nextStep.scheduled_date) {
                          // 自分の終了時間が次の開始時間より遅ければ重複
                          isOverlapping = new Date(s.end_time) > new Date(nextStep.scheduled_date);
                        }
                      }

                      return (
                        <div
                          key={s.id}
                          className={`p-4 rounded-xl border shadow-sm transition-all ${isOverlapping
                              ? "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800"
                              : "bg-slate-50 dark:bg-slate-900/50 border-slate-100 dark:border-slate-800"
                            }`}
                        >
                          <div className="flex justify-between items-start mb-1">
                            <div className="text-[10px] font-bold text-blue-600 dark:text-blue-400 uppercase tracking-tight">
                              {s.companyName}
                            </div>
                            {isOverlapping && (
                              <span className="text-[9px] font-bold text-red-500 animate-pulse">⚠️ 時間重複</span>
                            )}
                          </div>

                          <div className="text-sm font-bold mb-2">{s.step_name}</div>

                          <div className="flex items-center gap-2">
                            <div className="text-[11px] font-mono font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 px-2 py-0.5 rounded">
                              {s.scheduled_date ? new Date(s.scheduled_date).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' }) : "--:--"}
                              {" 〜 "}
                              {s.end_time ? new Date(s.end_time).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' }) : "??:??"}
                            </div>
                          </div>
                        </div>
                      );
                    });
                  })()
                ) : (
                  <div className="text-xs text-slate-400 italic mt-10 text-center">予定はありません</div>
                )}
              </div>
              </div>
            </section>

            {/* 新規企業追加フォーム */}
            <form onSubmit={handleSubmit} className="bg-white dark:bg-slate-800 p-8 rounded-2xl shadow-lg border border-slate-200 dark:border-slate-700 transition-colors">
              <h2 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-6">新規企業追加</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-end">
                <div className="md:col-span-1">
                  <label className="block text-[10px] font-black text-slate-400 mb-2 uppercase">Company Name</label>
                  <input
                    type="text" value={name} onChange={(e) => setName(e.target.value)}
                    className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-600 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                    placeholder="Google" required
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-slate-400 mb-2 uppercase">Group</label>
                  <select
                    value={selectionGroup} onChange={(e) => setSelectionGroup(e.target.value)}
                    className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-600 rounded-xl outline-none cursor-pointer transition-all"
                  >
                    {SELECTION_GROUPS.map(g => <option key={g} value={g}>{g}</option>)}
                  </select>
                </div>
                <button
                  type="submit" disabled={loading}
                  className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl shadow-lg shadow-blue-500/20 transition-all active:scale-[0.98] disabled:opacity-50"
                >
                  {loading ? "Adding..." : "Add to List"}
                </button>
              </div>
            </form>
          </div>

        {/* 右側：サイドバー (現在の選考リスト) -> 4カラム分 */}
        <div className="lg:col-span-4 space-y-4 max-h-[calc(100vh-120px)] overflow-y-auto pr-2 custom-scrollbar">
          <h2 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest px-2 mb-4 sticky top-0 bg-slate-50 dark:bg-slate-900 py-2 z-10">
            Selection List
          </h2>

          {companies.map((company, index) => {
            // 前の企業とグループが違う場合に境界線を表示
            const showSeparator = index === 0 || companies[index - 1].selection_group !== company.selection_group;

            return (
              <div key={company.id}>
                {/* --- 志望群の境界線 --- */}
                {showSeparator && (
                  <div className="flex items-center gap-3 mt-8 mb-4 px-2">
                    <span className={`text-[10px] font-black uppercase tracking-[0.2em] whitespace-nowrap ${company.selection_group === "第一志望群" ? "text-rose-500" :
                        company.selection_group === "第二志望群" ? "text-amber-500" : "text-slate-400"
                      }`}>
                      {company.selection_group}
                    </span>
                    <div className="h-[1px] w-full bg-slate-200 dark:bg-slate-700/50"></div>
                  </div>
                )}

                {/* --- 企業カード --- */}
                <div className={`bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm transition-all hover:shadow-md ${getGroupBorderClass(company.selection_group)}`}>
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-lg font-bold tracking-tight">{company.name}</span>
                        <select
                          value={company.selection_group}
                          onChange={(e) => updateCompanyGroup(company.id, e.target.value)}
                          className="text-[9px] font-bold border dark:border-slate-600 rounded px-1.5 py-0.5 bg-slate-50 dark:bg-slate-900 text-slate-500 dark:text-slate-400 outline-none"
                        >
                          {SELECTION_GROUPS.map(g => <option key={g} value={g}>{g}</option>)}
                        </select>
                      </div>
                    </div>
                  </div>

                  {/* ステップ表示セクション */}
                  <div className="border-t border-slate-100 dark:border-slate-700 pt-3">
                    <div className="flex flex-col gap-2">
                      {company.steps && company.steps.map((step, index) => (
                        <div key={step.id}>
                          {editingStepId === step.id ? (
                            <div className="flex flex-col gap-2 p-3 bg-slate-100 dark:bg-slate-900 rounded-xl mb-2">
                              <input
                                type="text"
                                value={editStepName}
                                onChange={(e) => setEditStepName(e.target.value)}
                                className="text-xs p-2 rounded border dark:bg-slate-800 dark:border-slate-700 text-slate-900 dark:text-white"
                              />

                              <div className="grid grid-cols-2 gap-2">
                                <div className="flex flex-col gap-1">
                                  <label className="text-[8px] font-bold text-slate-400">開始</label>
                                  <input
                                    type="datetime-local"
                                    value={editStepDate}
                                    onChange={(e) => {
                                      const val = e.target.value;
                                      setEditStepDate(val);
                                      // 編集時も「開始を変えたら自動で1時間後をセット」させるとさらに楽です
                                      if (val) {
                                        const end = new Date(new Date(val).getTime() + 60 * 60 * 1000);
                                        setEditStepEndDate(toLocalISOString(end));
                                      }
                                    }}
                                    className="text-[10px] p-2 rounded border dark:bg-slate-800 dark:border-slate-700 text-slate-900 dark:text-white"
                                  />
                                </div>
                                <div className="flex flex-col gap-1">
                                  <label className="text-[8px] font-bold text-slate-400">終了</label>
                                  <input
                                    type="datetime-local"
                                    value={editStepEndDate}
                                    onChange={(e) => setEditStepEndDate(e.target.value)}
                                    className="text-[10px] p-2 rounded border dark:bg-slate-800 dark:border-slate-700 text-slate-900 dark:text-white"
                                  />
                                </div>
                              </div>

                              <div className="flex justify-end gap-2">
                                <button onClick={() => setEditingStepId(null)} className="text-[10px] text-slate-500">キャンセル</button>
                                <button onClick={() => handleUpdateStep(step.id)} className="text-[10px] bg-green-600 text-white px-3 py-1 rounded shadow-sm">更新</button>
                              </div>
                            </div>
                          ) : (
                            <div className={`text-[11px] border px-3 py-1.5 rounded-full flex items-center justify-between gap-2 transition-all mb-1 ${getStatusClass(step.status)}`}>
                              <div className="flex items-center gap-2 flex-1 cursor-pointer"
                                onClick={() => {
                                  setEditingStepId(step.id);
                                  setEditStepName(step.step_name);
                                  setEditStepDate(step.scheduled_date ? toLocalISOString(new Date(step.scheduled_date)) : "");
                                  setEditStepEndDate(step.end_time ? toLocalISOString(new Date(step.end_time)) : "");
                                }}>
                                <span className="font-bold">{step.step_name}</span>
                                {step.scheduled_date && (
                                  <span className="text-[9px] opacity-60">
                                    ({new Date(step.scheduled_date).toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' })})
                                  </span>
                                )}
                              </div>
                              {/* ステップの通常表示モード内 */}
                                <div className="flex items-center gap-2">
                                  <span
                                    onClick={() => handleStatusClick(step.id, step.status)}
                                    className="cursor-pointer font-bold px-2 py-0.5 hover:bg-black/5 dark:hover:bg-white/10 rounded transition-colors"
                                  >
                                    {step.status || "未着手"}
                                  </span>

                                  <div className="flex items-center border-l border-slate-200 dark:border-slate-700 ml-1 pl-2 gap-1">
                                    {/* 最初の要素でなければ上ボタンを表示 */}
                                    {index > 0 && (
                                      <button
                                        onClick={(e) => { e.stopPropagation(); moveStep(company.id, step.id, 'up'); }}
                                        className="hover:bg-blue-100 dark:hover:bg-blue-900/30 text-blue-600 dark:text-blue-400 p-1 rounded text-[10px] transition-colors"
                                        title="上に移動"
                                      >
                                        ▲
                                      </button>
                                    )}

                                    {/* 最後の要素でなければ下ボタンを表示 */}
                                    {index < company.steps.length - 1 && (
                                      <button
                                        onClick={(e) => { e.stopPropagation(); moveStep(company.id, step.id, 'down'); }}
                                        className="hover:bg-blue-100 dark:hover:bg-blue-900/30 text-blue-600 dark:text-blue-400 p-1 rounded text-[10px] transition-colors"
                                        title="下に移動"
                                      >
                                        ▼
                                      </button>
                                    )}

                                    <button
                                      onClick={() => handleDeleteStep(step.id)}
                                      className="hover:text-red-500 opacity-40 ml-1 transition-colors"
                                      title="削除"
                                    >
                                      ×
                                    </button>
                                  </div>
                                </div>
                            </div>
                          )}
                        </div>
                      ))}

                      {/* +Stepボタンのロジック */}
                      {addingStepTo === company.id ? (
                        <div className="flex flex-col gap-2 p-3 border border-blue-200 dark:border-blue-800 rounded-xl bg-blue-50/50 dark:bg-blue-900/10 w-full mt-2">
                          <input
                            autoFocus
                            type="text"
                            value={newStepName}
                            onChange={(e) => setNewStepName(e.target.value)}
                            className="text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 dark:text-white"
                            placeholder="面接名（例：一次面接）"
                          />

                          {/* 時間入力エリアを2列に分割 */}
                          <div className="grid grid-cols-2 gap-2">
                            <div className="flex flex-col gap-1">
                              <label className="text-[8px] font-bold text-slate-400 ml-1">開始</label>
                              <input
                                type="datetime-local"
                                value={newStepDate}
                                onChange={handleNewStepDateChange} // 先ほど作った連動関数
                                className="text-[10px] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1.5 outline-none text-slate-900 dark:text-white"
                              />
                            </div>
                            <div className="flex flex-col gap-1">
                              <label className="text-[8px] font-bold text-slate-400 ml-1">終了</label>
                              <input
                                type="datetime-local"
                                value={newStepEndDate} // 新しく作ったステート
                                onChange={(e) => setNewStepEndDate(e.target.value)}
                                className="text-[10px] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1.5 outline-none text-slate-900 dark:text-white"
                              />
                            </div>
                          </div>

                          <div className="flex justify-end gap-2 mt-1">
                            <button onClick={() => {
                              setAddingStepTo(null);
                              setNewStepEndDate(""); // クリアを忘れずに
                            }} className="text-[10px] text-slate-500">キャンセル</button>
                            <button onClick={() => handleAddStep(company.id)} className="text-[10px] bg-blue-600 text-white px-4 py-1.5 rounded-lg shadow-sm">保存</button>
                          </div>
                        </div>
                      ) : (
                        <button
                          onClick={() => setAddingStepTo(company.id)}
                          className="text-[10px] text-blue-600 dark:text-blue-400 border border-dashed border-blue-200 dark:border-blue-800 px-3 py-1 rounded-full hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors mt-2"
                        >
                          + Step
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        </div>
      </div>
    </main>
  );}