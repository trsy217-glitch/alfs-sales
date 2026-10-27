// 알프스 영업관리 저장소
// Firebase 모드: Firestore
//   members/{uid}             팀원 { name, email, role: admin|tm|sales|pending, joinedAt }
//   invites/{이메일}            팀원이 미리 등록한 사람 { name, role, by } → 그 사람이 로그인하면 이 역할로 바로 들어옴
//   leads/{id}                고객(매장) 카드 — 단계·담당·다음 통화·미팅 예약·미팅 횟수·계약 상황
//   leads/{id}/logs/{logId}   통화·예약·미팅·계약·메모 기록 (팀원끼리 소통하는 대화창 역할)
// 체험 모드(Firebase 값이 없을 때): 이 브라우저 localStorage 에만 저장, 예시 고객 3곳이 들어 있음
import {
  collection, doc, getDoc, getFirestore, onSnapshot, orderBy, query, limit, setDoc, updateDoc, deleteDoc, writeBatch, increment,
} from 'firebase/firestore'
import { app, isDemoMode } from './firebase.js'
import { ls } from './safeStorage.js'
import { nowLocal, todayStr } from './data.js'

const db = app ? getFirestore(app) : null
const iso = () => new Date().toISOString()
const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
export const demo = isDemoMode

// ── 체험 모드 저장소 ──
const KEY = 'alfs_sales_demo_v1'
const listeners = new Set()
function seed() {
  const t = todayStr()
  const at = (days, hm) => { const d = new Date(`${t}T00:00`); d.setDate(d.getDate() + days); const p2 = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}T${hm}` }
  const lead = (id, o) => ({ id, sample: true, createdAt: iso(), updatedAt: iso(), tmId: 'demo-tm', salesId: null, meetings: 0, calls: 0, nextCall: null, appt: null, apptAck: false, contract: null, ...o })
  const leads = {
    s1: lead('s1', { name: '(예시) 망원 바른헬스', person: '김원장', phone: '010-1234-5678', region: '서울 마포구 망원동', category: '헬스·PT', stage: 'booked', salesId: 'demo-sales', appt: { at: at(1, '14:00'), place: '매장 방문' }, calls: 2, lastText: '원장님이 회원용 음료 메뉴에 관심. 내일 2시 방문 미팅 잡음', lastBy: 'demo-tm' }),
    s2: lead('s2', { name: '(예시) 수피부 에스테틱', person: '박실장', phone: '02-333-4444', region: '서울 송파구 잠실동', category: '뷰티·피부샵', stage: 'called', nextCall: at(0, '16:30'), calls: 1, lastText: '원장님 부재. 오후 4시 반에 다시 연락 달라고 함', lastBy: 'demo-tm' }),
    s3: lead('s3', { name: '(예시) 보은 들꽃카페', person: '이대표', phone: '010-9876-5432', region: '충북 보은군', category: '카페', stage: 'nego', salesId: 'demo-sales', meetings: 2, calls: 3, contract: { status: 'nego', amount: 0, date: '' }, lastText: '2차 미팅. 샵인샵 진열대 위치 협의 중', lastBy: 'demo-sales' }),
  }
  const logs = {
    s1: [{ id: 'l1', type: 'create', by: 'demo-tm', at: iso(), text: '네이버 지도에서 찾은 매장' }, { id: 'l2', type: 'call', by: 'demo-tm', at: iso(), result: 'talked', text: '원장님이 회원용 음료 메뉴에 관심' }, { id: 'l3', type: 'book', by: 'demo-tm', at: iso(), apptAt: at(1, '14:00'), place: '매장 방문', salesId: 'demo-sales', text: '내일 2시 방문 미팅 잡음' }],
    s2: [{ id: 'l4', type: 'call', by: 'demo-tm', at: iso(), result: 'callback', text: '원장님 부재. 오후 4시 반에 다시 연락 달라고 함' }],
    s3: [{ id: 'l5', type: 'meet', by: 'demo-sales', at: iso(), count: 2, text: '2차 미팅. 샵인샵 진열대 위치 협의 중' }],
  }
  const members = {
    'demo-tm': { name: '(예시) 최TM', role: 'tm', email: '' },
    'demo-sales': { name: '(예시) 동생 영업', role: 'sales', email: '' },
  }
  return { leads, logs, members, invites: {} }
}
const load = () => { const s = ls.get(KEY) || seed(); s.invites ||= {}; return s }
const save = (s) => { ls.set(KEY, s); listeners.forEach((f) => f()) }
const sub = (f) => { listeners.add(f); f(); return () => listeners.delete(f) }

// ── 팀원 ──
export function watchMyMember(user, cb) {
  if (demo) {
    return sub(() => { const s = load(); if (!s.members[user.id]) { s.members[user.id] = { name: user.name || '나', role: 'admin', email: user.email || '' }; ls.set(KEY, s) } cb(s.members[user.id]) })
  }
  return onSnapshot(doc(db, 'members', user.id), (d) => cb(d.exists() ? d.data() : null), () => cb(null))
}
export function watchMembers(cb) {
  if (demo) return sub(() => { const m = load().members; cb(Object.entries(m).map(([id, v]) => ({ id, ...v }))) })
  return onSnapshot(collection(db, 'members'), (q) => cb(q.docs.map((d) => ({ id: d.id, ...d.data() }))), () => cb([]))
}
export async function requestJoin(user, name, role = 'pending') {
  const body = { name: name.trim().slice(0, 20), email: user.email || '', role, joinedAt: iso() }
  if (demo) { const s = load(); s.members[user.id] = body; save(s); return }
  await setDoc(doc(db, 'members', user.id), body)
}
// ── 미리 등록(초대) ──
const emailKey = (e) => String(e || '').trim().toLowerCase()
export function watchInvites(cb) {
  if (demo) return sub(() => cb(Object.entries(load().invites).map(([email, v]) => ({ email, ...v }))))
  return onSnapshot(collection(db, 'invites'), (q) => cb(q.docs.map((d) => ({ email: d.id, ...d.data() }))), () => cb([]))
}
export async function addInvite(by, { email, name, role }) {
  const key = emailKey(email)
  const body = { name: name.trim().slice(0, 20), role, by, at: iso() }
  if (demo) { const s = load(); s.invites[key] = body; save(s); return }
  await setDoc(doc(db, 'invites', key), body)
}
export async function removeInvite(email) {
  const key = emailKey(email)
  if (demo) { const s = load(); delete s.invites[key]; save(s); return }
  await deleteDoc(doc(db, 'invites', key))
}
/** 로그인한 사람이 미리 등록돼 있으면 그 역할로 팀원이 되고 true */
export async function claimInvite(user) {
  const key = emailKey(user.email)
  if (!key) return false
  if (demo) {
    const s = load(); const inv = s.invites[key]; if (!inv) return false
    s.members[user.id] = { name: inv.name || user.name || '팀원', email: user.email, role: inv.role, joinedAt: iso() }; delete s.invites[key]; save(s); return true
  }
  const ref = doc(db, 'invites', key)
  const inv = await getDoc(ref).catch(() => null)
  if (!inv?.exists()) return false
  const v = inv.data()
  await setDoc(doc(db, 'members', user.id), { name: v.name || user.name || '팀원', email: user.email, role: v.role, joinedAt: iso() })
  await deleteDoc(ref).catch(() => {})
  return true
}

export async function setMember(uid, patch) {
  if (demo) { const s = load(); s.members[uid] = { ...s.members[uid], ...patch }; save(s); return }
  await updateDoc(doc(db, 'members', uid), patch)
}
export async function removeMember(uid) {
  if (demo) { const s = load(); delete s.members[uid]; save(s); return }
  await deleteDoc(doc(db, 'members', uid))
}

// ── 고객 ──
export function watchLeads(cb, onError) {
  if (demo) return sub(() => cb(Object.values(load().leads)))
  return onSnapshot(query(collection(db, 'leads'), orderBy('updatedAt', 'desc'), limit(1000)),
    (q) => cb(q.docs.map((d) => ({ id: d.id, ...d.data() }))), (e) => onError?.(e))
}
export function watchLogs(leadId, cb) {
  if (demo) return sub(() => cb([...(load().logs[leadId] || [])].sort((a, b) => a.at.localeCompare(b.at))))
  return onSnapshot(query(collection(db, 'leads', leadId, 'logs'), orderBy('at', 'asc'), limit(500)),
    (q) => cb(q.docs.map((d) => ({ id: d.id, ...d.data() }))), () => cb([]))
}

/** 새 고객 등록 + 첫 기록 */
export async function createLead(user, data) {
  const id = newId()
  const lead = {
    ...data, stage: 'new', tmId: user.id, salesId: data.salesId || null, meetings: 0, calls: 0, nextCall: null, appt: null, apptAck: false, contract: null,
    createdAt: iso(), updatedAt: iso(), lastText: data.memo || '고객 등록', lastBy: user.id,
  }
  const log = { type: 'create', by: user.id, at: iso(), text: data.memo || '' }
  if (demo) { const s = load(); s.leads[id] = { id, ...lead }; s.logs[id] = [{ id: newId(), ...log }]; save(s); return id }
  const b = writeBatch(db)
  b.set(doc(db, 'leads', id), lead)
  b.set(doc(collection(db, 'leads', id, 'logs')), log)
  await b.commit()
  return id
}

/** 기록 한 건을 남기면서 고객 카드도 함께 바꿈. counters: { calls: 1 } 처럼 늘릴 값 */
export async function act(user, lead, log, patch = {}, counters = {}) {
  const entry = { ...log, by: user.id, at: iso() }
  const summary = { updatedAt: iso(), lastText: (log.text || '').slice(0, 120) || undefined, lastBy: user.id }
  if (!summary.lastText) delete summary.lastText
  if (demo) {
    const s = load(); const l = s.leads[lead.id]; if (!l) return
    Object.assign(l, patch, summary)
    for (const [k, v] of Object.entries(counters)) l[k] = (l[k] || 0) + v
    ;(s.logs[lead.id] ||= []).push({ id: newId(), ...entry }); save(s); return
  }
  const b = writeBatch(db)
  const up = { ...patch, ...summary }
  for (const [k, v] of Object.entries(counters)) up[k] = increment(v)
  b.update(doc(db, 'leads', lead.id), up)
  b.set(doc(collection(db, 'leads', lead.id, 'logs')), JSON.parse(JSON.stringify(entry)))
  await b.commit()
}

export async function editLead(lead, patch) {
  if (demo) { const s = load(); Object.assign(s.leads[lead.id], patch, { updatedAt: iso() }); save(s); return }
  await updateDoc(doc(db, 'leads', lead.id), { ...patch, updatedAt: iso() })
}
export async function deleteLead(lead) {
  if (demo) { const s = load(); delete s.leads[lead.id]; delete s.logs[lead.id]; save(s); return }
  await deleteDoc(doc(db, 'leads', lead.id)) // 기록(logs)은 남지만 목록에서는 사라집니다
}
export const _now = nowLocal
