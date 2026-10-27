// 알프스 영업관리 저장소
// Firebase 모드: Firestore
//   members/{uid}             팀원 { name, email, role: admin|tm|sales|pending, joinedAt }
//   invites/{이메일}            팀원이 미리 등록한 사람 { name, role, by } → 그 사람이 로그인하면 이 역할로 바로 들어옴
//   leads/{id}                고객(매장) 카드 — 단계, 역할별 담당(tmId·salesId·managerId), 다음 통화·미팅 예약·다음 관리, 횟수, 계약, 완료 체크(checks)
//   leads/{id}/logs/{logId}   통화·예약·미팅·계약·메모 기록 (팀원끼리 소통하는 대화창 역할)
// 체험 모드(Firebase 값이 없을 때): 이 브라우저 localStorage 에만 저장, 빈 상태로 시작
import {
  collection, doc, getDoc, getFirestore, onSnapshot, orderBy, query, limit, setDoc, updateDoc, deleteDoc, writeBatch, increment, deleteField,
} from 'firebase/firestore'
import { app, isDemoMode } from './firebase.js'
import { ls } from './safeStorage.js'
import { nowLocal } from './data.js'

const db = app ? getFirestore(app) : null
const iso = () => new Date().toISOString()
const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
export const demo = isDemoMode

// ── 체험 모드 저장소 ──
const KEY = 'alfs_sales_demo_v2' // v2: 예시 데이터 없이 빈 상태로 시작
const listeners = new Set()
const seed = () => ({ leads: {}, logs: {}, members: {}, invites: {} })
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
    ...data, stage: 'new', tmId: data.tmId || user.id, salesId: data.salesId || null, managerId: data.managerId || null, createdBy: user.id,
    meetings: 0, calls: 0, manages: 0, nextCall: null, nextManage: null, appt: null, apptAck: false, contract: null, checks: {},
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
    applyDemo(l, { ...patch, ...summary })
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
  if (demo) { const s = load(); applyDemo(s.leads[lead.id], { ...patch, updatedAt: iso() }); save(s); return }
  await updateDoc(doc(db, 'leads', lead.id), { ...patch, updatedAt: iso() })
}
export async function deleteLead(lead) {
  if (demo) { const s = load(); delete s.leads[lead.id]; delete s.logs[lead.id]; save(s); return }
  await deleteDoc(doc(db, 'leads', lead.id)) // 기록(logs)은 남지만 목록에서는 사라집니다
}
export const _now = nowLocal

// 체험 모드: 'checks.키' 처럼 점으로 된 경로와 DELETE 표시를 처리
const DELETE = '__delete__'
function applyDemo(obj, patch) {
  for (const [k, v] of Object.entries(patch)) {
    const parts = k.split('.'); let o = obj
    for (const p of parts.slice(0, -1)) o = (o[p] ||= {})
    const last = parts[parts.length - 1]
    if (v === DELETE) delete o[last]; else o[last] = v
  }
}

/** 대시보드 체크: 켜면 기록도 남김, 끄면 체크만 지움 */
export async function setCheck(user, lead, key, on, info) {
  const path = `checks.${key}`
  if (on) return act(user, lead, { type: 'check', ...info }, { [path]: { by: user.id, at: iso() } })
  return editLead(lead, { [path]: demo ? DELETE : deleteField() })
}
