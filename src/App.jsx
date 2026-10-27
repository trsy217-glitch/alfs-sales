import { useEffect, useMemo, useRef, useState } from 'react'
import { AuthProvider, useAuth, inAppBrowser, openInExternalBrowser } from './auth.jsx'
import {
  demo, watchMyMember, watchMembers, requestJoin, setMember, removeMember, watchLeads, watchLogs, createLead, act, editLead, deleteLead,
  watchInvites, addInvite, removeInvite, claimInvite,
} from './store.js'
import {
  ROLES, STAGES, STAGE, OPEN_STAGES, CATEGORIES, CALL_RESULTS, CALL_RESULT, MEETING_NEXT, CONTRACT_STATUS, CONTRACT, LOG_LABEL,
  nowLocal, todayStr, fmtWhen, fmtAgo, won, telHref, fmtPhone,
} from './data.js'
import { ADMIN_EMAILS } from './config.js'
import './styles.css'

export default function App() {
  return <AuthProvider><Root /></AuthProvider>
}

function Root() {
  const auth = useAuth()
  const [me, setMe] = useState(undefined)
  useEffect(() => { if (!auth.user) { setMe(undefined); return } return watchMyMember(auth.user, setMe) }, [auth.user])
  if (auth.loading || (auth.user && me === undefined)) return <Shell><p className="muted center pad">불러오는 중…</p></Shell>
  if (!auth.user) return <Gate auth={auth} />
  if (!me) return <Join user={auth.user} onOut={auth.signOut} />
  if (me.role === 'pending') return <Waiting me={me} onOut={auth.signOut} />
  return <Main user={auth.user} me={me} onOut={auth.signOut} />
}

const Shell = ({ children }) => <div className="app"><div className="wrap">{children}</div></div>

function Gate({ auth }) {
  const inApp = inAppBrowser()
  const [msg, setMsg] = useState(auth.error || '')
  return (
    <div className="app"><div className="wrap gate">
      <div className="brand">ALFS<small>영업관리</small></div>
      <h1>전화부터 계약까지,<br />한 화면에서 함께 봅니다</h1>
      <p className="muted">알프스 TM·영업 담당자 전용입니다. 회사에서 안내받은 Google 계정으로 로그인해 주세요.</p>
      {inApp ? (
        <div className="stack">
          <p>{inApp === 'kakao' ? '카카오톡' : '앱'} 안의 브라우저에서는 Google 로그인이 막혀 있어요. 크롬·사파리에서 열어 주세요.</p>
          {inApp === 'kakao' && <button type="button" className="btn-primary" onClick={openInExternalBrowser}>기본 브라우저로 열기</button>}
        </div>
      ) : (
        <button type="button" className="btn-primary" onClick={async () => { setMsg(''); const r = await auth.signInWithGoogle(); if (r.error) setMsg(r.error) }}>
          {auth.demo ? '체험 모드로 시작하기' : 'Google 계정으로 로그인'}
        </button>
      )}
      {msg && <p className="err">{msg}</p>}
      <p className="muted small">휴대폰에서 '홈 화면에 추가'하면 앱처럼 바로 열 수 있어요.</p>
    </div></div>
  )
}

function Join({ user, onOut }) {
  const [checking, setChecking] = useState(true)
  useEffect(() => { let on = true; claimInvite(user).catch(() => false).finally(() => on && setChecking(false)); return () => { on = false } }, [user])
  const [name, setName] = useState(user.name || '')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const isAdmin = ADMIN_EMAILS.includes(user.email)
  if (checking) return <Shell><p className="muted center pad">팀원 등록을 확인하는 중…</p></Shell>
  return (
    <div className="app"><form className="wrap gate" onSubmit={async (e) => {
      e.preventDefault(); if (!name.trim()) return setErr('이름을 적어 주세요.')
      setBusy(true); setErr('')
      try { await requestJoin(user, name, isAdmin ? 'admin' : 'pending') } catch { setErr('등록하지 못했어요. 잠시 후 다시 눌러 주세요.') } finally { setBusy(false) }
    }}>
      <div className="brand">ALFS<small>영업관리</small></div>
      <h1>처음 오셨네요</h1>
      <p className="muted">{isAdmin ? '대표 계정입니다. 이름을 적으면 바로 시작합니다.' : '아직 팀원으로 등록되지 않은 계정이에요. 이름을 적고 가입을 요청하면, 팀원 누구나 팀원 탭에서 역할을 정해 줄 수 있어요. 미리 등록을 부탁했다면 그때 알려 준 Google 계정으로 로그인했는지 확인해 주세요.'}</p>
      <label className="field"><span>이름</span><input id="joinName" className="inp" value={name} maxLength={20} onChange={(e) => setName(e.target.value)} placeholder="예: 김영업" /></label>
      {err && <p className="err">{err}</p>}
      <button className="btn-primary" disabled={busy}>{isAdmin ? '시작하기' : '가입 요청'}</button>
      <p className="muted small">{user.email} · <button type="button" className="link" onClick={onOut}>다른 계정으로</button></p>
    </form></div>
  )
}

function Waiting({ me, onOut }) {
  return (
    <Shell><div className="gate">
      <div className="brand">ALFS<small>영업관리</small></div>
      <h1>{me.name}님, 승인을 기다리고 있어요</h1>
      <p className="muted">팀원 누구나 '팀원' 탭에서 역할(TM·영업사원)을 정해 주면 바로 열립니다. 정해지면 이 화면이 저절로 바뀌어요.</p>
      <button type="button" className="link" onClick={onOut}>로그아웃</button>
    </div></Shell>
  )
}

/* ─────────────── 본 화면 ─────────────── */
function Main({ user, me, onOut }) {
  const [tab, setTab] = useState('today')
  const [leads, setLeads] = useState(null)
  const [members, setMembers] = useState([])
  const [openId, setOpenId] = useState(null)
  const [adding, setAdding] = useState(false)
  const [toast, setToast] = useState('')
  const [err, setErr] = useState('')
  const t = useRef(0)
  const say = (m) => { setToast(m); clearTimeout(t.current); t.current = setTimeout(() => setToast(''), 2200) }

  useEffect(() => watchLeads(setLeads, () => setErr('고객 목록을 불러오지 못했어요. 승인된 계정인지, Firestore 규칙이 게시됐는지 확인해 주세요.')), [])
  useEffect(() => watchMembers(setMembers), [])

  const ctx = useMemo(() => {
    const map = Object.fromEntries(members.map((m) => [m.id, m]))
    map[user.id] = { ...(map[user.id] || {}), ...me }
    return {
      user, me, members, say,
      nameOf: (id) => (id ? map[id]?.name || '팀원' : ''),
      roleOf: (id) => map[id]?.role,
      salesList: members.filter((m) => m.role === 'sales' || m.role === 'admin'),
      isAdmin: me.role === 'admin',
    }
  }, [members, me, user]) // eslint-disable-line react-hooks/exhaustive-deps

  const open = leads?.find((l) => l.id === openId)
  const pendingCount = members.filter((m) => m.role === 'pending').length
  const ackCount = (leads || []).filter((l) => l.appt && !l.apptAck && l.salesId === user.id && OPEN_STAGES.includes(l.stage)).length

  return (
    <div className="app">
      <header className="top">
        <div className="brand">ALFS<small>영업관리</small></div>
        <div className="me"><span className={`role role-${me.role}`}>{ROLES[me.role]?.short}</span>{me.name}</div>
      </header>
      <div className="wrap main">
        {demo && <p className="demo">체험 모드입니다. 이 브라우저에만 저장되고, (예시) 고객 3곳이 들어 있어요. Firebase를 연결하면 팀원이 함께 씁니다.</p>}
        {err && <p className="err">{err}</p>}
        {leads === null ? <p className="muted center pad">불러오는 중…</p>
          : tab === 'today' ? <Today leads={leads} ctx={ctx} onOpen={setOpenId} />
            : tab === 'list' ? <LeadList leads={leads} ctx={ctx} onOpen={setOpenId} />
              : tab === 'stats' ? <Stats leads={leads} ctx={ctx} />
                : <Team ctx={ctx} />}
        <p className="muted small center foot">{user.email} · <button type="button" className="link" onClick={onOut}>로그아웃</button></p>
      </div>

      {tab !== 'team' && <button type="button" className="fab" onClick={() => setAdding(true)} aria-label="고객 등록">＋ 고객 등록</button>}

      <nav className="tabbar" aria-label="화면">
        {[['today', '할 일', ackCount], ['list', '고객', 0], ['stats', '현황', 0], ['team', '팀원', pendingCount]].map(([k, n, badge]) => (
          <button type="button" key={k} aria-current={tab === k ? 'page' : undefined} onClick={() => setTab(k)}>
            {n}{badge > 0 && <i className="badge">{badge}</i>}
          </button>
        ))}
      </nav>

      {open && <Detail lead={open} ctx={ctx} onClose={() => setOpenId(null)} />}
      {adding && <LeadForm ctx={ctx} onClose={() => setAdding(false)} onSaved={(id) => { setAdding(false); setOpenId(id); say('고객을 등록했어요') }} />}
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  )
}

/* ── 할 일 ── */
function Today({ leads, ctx, onOpen }) {
  const { user, me } = ctx
  const today = todayStr()
  const open = leads.filter((l) => OPEN_STAGES.includes(l.stage))
  const mineSales = (l) => me.role !== 'sales' || l.salesId === user.id
  const toAck = open.filter((l) => l.appt && !l.apptAck && l.salesId === user.id)
  const meetings = open.filter((l) => l.appt?.at && l.appt.at.slice(0, 10) >= today && mineSales(l)).sort((a, b) => a.appt.at.localeCompare(b.appt.at))
  const late = open.filter((l) => l.stage === 'booked' && l.appt?.at && l.appt.at.slice(0, 10) < today && mineSales(l))
  const calls = me.role === 'sales' ? [] : open.filter((l) => l.nextCall && l.nextCall.slice(0, 10) <= today).sort((a, b) => a.nextCall.localeCompare(b.nextCall))
  const fresh = me.role === 'sales' ? [] : open.filter((l) => l.stage === 'new')
  const news = [...leads].filter((l) => l.lastBy && l.lastBy !== user.id && mineSales(l)).sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || '')).slice(0, 6)
  const empty = !toAck.length && !meetings.length && !late.length && !calls.length && !fresh.length

  return (
    <div className="stack">
      <h2 className="h">{me.name}님, 오늘 할 일</h2>
      {toAck.length > 0 && <Group title="확인할 미팅 예약" tone="alert" note="TM이 잡은 미팅입니다. 열어서 '확인'을 눌러 주세요.">{toAck.map((l) => <Card key={l.id} l={l} ctx={ctx} onOpen={onOpen} show="appt" />)}</Group>}
      {late.length > 0 && <Group title="결과를 안 적은 미팅" tone="warn">{late.map((l) => <Card key={l.id} l={l} ctx={ctx} onOpen={onOpen} show="appt" />)}</Group>}
      {calls.length > 0 && <Group title="오늘 다시 걸 전화">{calls.map((l) => <Card key={l.id} l={l} ctx={ctx} onOpen={onOpen} show="call" />)}</Group>}
      {meetings.length > 0 && <Group title="다가오는 미팅">{meetings.map((l) => <Card key={l.id} l={l} ctx={ctx} onOpen={onOpen} show="appt" />)}</Group>}
      {fresh.length > 0 && <Group title="아직 통화 전인 신규 고객">{fresh.map((l) => <Card key={l.id} l={l} ctx={ctx} onOpen={onOpen} />)}</Group>}
      {empty && <div className="empty"><b>지금 급한 일은 없어요</b>{me.role === 'sales' ? 'TM이 미팅을 잡으면 여기에 먼저 나타나요.' : '아래 ＋ 고객 등록으로 전화할 매장을 추가해 보세요.'}</div>}
      {news.length > 0 && (
        <Group title="팀원 최근 소식">
          {news.map((l) => (
            <button type="button" key={l.id} className="news" onClick={() => onOpen(l.id)}>
              <span className="news-h"><b>{ctx.nameOf(l.lastBy)}</b> · {l.name}<span className="muted"> · {fmtAgo(l.updatedAt)}</span></span>
              <span className="news-t">{l.lastText}</span>
            </button>
          ))}
        </Group>
      )}
    </div>
  )
}
const Group = ({ title, note, tone, children }) => (
  <section className={`group ${tone ? `group-${tone}` : ''}`}>
    <h3>{title}<span className="count">{Array.isArray(children) ? children.length : ''}</span></h3>
    {note && <p className="muted small">{note}</p>}
    <div className="list">{children}</div>
  </section>
)

function StagePill({ k }) { const s = STAGE[k] || STAGE.new; return <span className={`pill tone-${s.tone}`}>{s.n}</span> }

function Card({ l, ctx, onOpen, show }) {
  const when = show === 'call' ? (l.nextCall && `☎ ${fmtWhen(l.nextCall)} 다시 전화`)
    : (l.appt?.at && `미팅 ${fmtWhen(l.appt.at)}${l.appt.place ? ` · ${l.appt.place}` : ''}`)
  return (
    <button type="button" className="card" onClick={() => onOpen(l.id)}>
      <span className="card-h"><b>{l.name}</b><StagePill k={l.stage} /></span>
      <span className="card-s">{[l.category, l.region, l.person].filter(Boolean).join(' · ')}</span>
      {when && <span className="card-when">{when}{show === 'appt' && l.appt && !l.apptAck && <em className="unack">미확인</em>}</span>}
      <span className="card-f">
        {l.salesId ? <>영업 {ctx.nameOf(l.salesId)}</> : <span className="muted">영업 미배정</span>}
        {' · '}미팅 {l.meetings || 0}회{l.contract?.status && ` · 계약 ${CONTRACT[l.contract.status]?.n}`}
      </span>
      {l.lastText && <span className="card-last">{l.lastText}</span>}
    </button>
  )
}

/* ── 고객 목록 ── */
function LeadList({ leads, ctx, onOpen }) {
  const [q, setQ] = useState('')
  const [stage, setStage] = useState('open')
  const [mine, setMine] = useState(false)
  const uid = ctx.user.id
  const counts = useMemo(() => { const c = { all: leads.length, open: 0 }; leads.forEach((l) => { c[l.stage] = (c[l.stage] || 0) + 1; if (OPEN_STAGES.includes(l.stage)) c.open++ }); return c }, [leads])
  const shown = leads.filter((l) => {
    if (stage === 'open' ? !OPEN_STAGES.includes(l.stage) : stage !== 'all' && l.stage !== stage) return false
    if (mine && l.salesId !== uid && l.tmId !== uid) return false
    if (q) { const s = `${l.name} ${l.person} ${l.phone} ${l.region}`.toLowerCase(); if (!s.includes(q.toLowerCase().trim())) return false }
    return true
  }).sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''))
  return (
    <div className="stack">
      <div className="search"><input id="q" className="inp" value={q} onChange={(e) => setQ(e.target.value)} placeholder="매장·이름·전화번호·지역 검색" aria-label="검색" /></div>
      <div className="chips scroll">
        {[['open', '진행 중'], ['all', '전체'], ...STAGES.map((s) => [s.k, s.n])].map(([k, n]) => (
          <button type="button" key={k} aria-pressed={stage === k} onClick={() => setStage(k)}>{n}<small>{counts[k] || 0}</small></button>
        ))}
      </div>
      <label className="check"><input type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} /> 내가 맡은 고객만</label>
      <div className="list">
        {shown.length ? shown.map((l) => <Card key={l.id} l={l} ctx={ctx} onOpen={onOpen} show={l.nextCall && !l.appt ? 'call' : 'appt'} />)
          : <div className="empty"><b>조건에 맞는 고객이 없어요</b>검색어나 단계를 바꿔 보세요.</div>}
      </div>
    </div>
  )
}

/* ── 현황 ── */
function Stats({ leads, ctx }) {
  const month = todayStr().slice(0, 7)
  const by = (k) => leads.filter((l) => l.stage === k).length
  const open = leads.filter((l) => OPEN_STAGES.includes(l.stage)).length
  const wonMonth = leads.filter((l) => l.contract?.status === 'won' && (l.contract.date || '').startsWith(month))
  const upcoming = leads.filter((l) => l.appt?.at && l.appt.at.slice(0, 10) >= todayStr() && OPEN_STAGES.includes(l.stage)).length
  const max = Math.max(1, ...STAGES.map((s) => by(s.k)))
  const people = ctx.members.filter((m) => m.role !== 'pending')
  return (
    <div className="stack">
      <h2 className="h">영업 현황</h2>
      <div className="kpis">
        <div><b>{open}</b>진행 중 고객</div>
        <div><b>{upcoming}</b>예정된 미팅</div>
        <div><b>{wonMonth.length}</b>이번 달 계약</div>
      </div>
      {wonMonth.some((l) => l.contract.amount) && <p className="muted small">이번 달 계약 금액 합계 {won(wonMonth.reduce((n, l) => n + (Number(l.contract.amount) || 0), 0))}원</p>}
      <section className="group">
        <h3>단계별 고객 수</h3>
        <div className="bars">
          {STAGES.map((s) => (
            <div className="bar" key={s.k}><span>{s.n}</span><i className={`tone-${s.tone}`} style={{ width: `${(by(s.k) / max) * 100}%` }} /><b>{by(s.k)}</b></div>
          ))}
        </div>
      </section>
      <section className="group">
        <h3>팀원별</h3>
        <div className="table-wrap">
          <table className="tbl">
            <thead><tr><th>이름</th><th>등록</th><th>통화</th><th>담당</th><th>미팅</th><th>계약</th></tr></thead>
            <tbody>
              {people.map((m) => {
                const reg = leads.filter((l) => l.tmId === m.id)
                const own = leads.filter((l) => l.salesId === m.id)
                return (
                  <tr key={m.id}>
                    <td><b>{m.name}</b> <span className={`role role-${m.role}`}>{ROLES[m.role]?.short}</span></td>
                    <td>{reg.length}</td><td>{reg.reduce((n, l) => n + (l.calls || 0), 0)}</td>
                    <td>{own.length}</td><td>{own.reduce((n, l) => n + (l.meetings || 0), 0)}</td><td>{own.filter((l) => l.stage === 'won').length}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <p className="muted small">등록·통화는 그 사람이 등록한 고객 기준, 담당·미팅·계약은 영업 담당 기준입니다.</p>
      </section>
    </div>
  )
}

/* ── 팀원 (모두가 등록·역할 지정) ── */
const ROLE_PICK = ['tm', 'sales', 'admin']
function Team({ ctx }) {
  const [invites, setInvites] = useState([])
  const [f, setF] = useState({ name: '', email: '', role: 'tm' })
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [sure, setSure] = useState('')
  useEffect(() => watchInvites(setInvites), [])
  const pending = ctx.members.filter((m) => m.role === 'pending')
  const active = ctx.members.filter((m) => m.role !== 'pending').sort((a, b) => ROLE_PICK.indexOf(a.role) - ROLE_PICK.indexOf(b.role))
  const change = async (m, r) => { try { await setMember(m.id, { role: r }); ctx.say(`${m.name}님을 ${ROLES[r].short}(으)로 정했어요`) } catch { ctx.say('바꾸지 못했어요') } }
  const remove = async (m) => { if (sure !== m.id) return setSure(m.id); try { await removeMember(m.id); ctx.say('팀에서 뺐어요') } catch { ctx.say('빼지 못했어요') } }

  const add = async (e) => {
    e.preventDefault()
    const email = f.email.trim().toLowerCase()
    if (!f.name.trim()) return setErr('이름을 적어 주세요.')
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return setErr('Google 계정 이메일을 정확히 적어 주세요.')
    if (ctx.members.some((m) => (m.email || '').toLowerCase() === email && m.role !== 'pending')) return setErr('이미 팀원으로 등록된 이메일이에요.')
    const waiting = ctx.members.find((m) => (m.email || '').toLowerCase() === email && m.role === 'pending')
    setBusy(true); setErr('')
    try {
      if (waiting) { await setMember(waiting.id, { role: f.role, name: f.name.trim() }); ctx.say(`${f.name.trim()}님을 ${ROLES[f.role].short}(으)로 등록했어요`) }
      else { await addInvite(ctx.user.id, { ...f, email }); ctx.say(`${f.name.trim()}님을 등록했어요`) }
      setF({ name: '', email: '', role: f.role })
    } catch { setErr('등록하지 못했어요. 다시 눌러 주세요.') } finally { setBusy(false) }
  }

  return (
    <div className="stack">
      <h2 className="h">팀원</h2>
      <form className="addmember" onSubmit={add} noValidate>
        <h3>팀원 등록</h3>
        <p className="muted small">이름과 Google 계정 이메일, 역할을 적어 두면 그 사람이 로그인할 때 승인 없이 바로 들어옵니다. 팀원 누구나 등록하고 역할을 바꿀 수 있어요.</p>
        <div className="row2">
          <label className="field"><span>이름</span><input id="mName" className="inp" value={f.name} maxLength={20} onChange={(e) => setF((s) => ({ ...s, name: e.target.value }))} placeholder="예: 김TM" /></label>
          <label className="field"><span>Google 이메일</span><input id="mEmail" className="inp" type="email" inputMode="email" autoCapitalize="off" value={f.email} onChange={(e) => setF((s) => ({ ...s, email: e.target.value }))} placeholder="name@gmail.com" /></label>
        </div>
        <div className="field"><span>역할</span><Chips items={ROLE_PICK.map((r) => ({ k: r, n: ROLES[r].short === '대표' ? '대표·관리' : ROLES[r].n }))} value={f.role} onChange={(r) => setF((s) => ({ ...s, role: r }))} /></div>
        {err && <p className="err">{err}</p>}
        <button className="btn-primary" disabled={busy}>{busy ? '등록하는 중…' : '등록'}</button>
      </form>

      {pending.length > 0 && (
        <section className="group group-alert">
          <h3>역할을 기다리는 사람<span className="count">{pending.length}</span></h3>
          <p className="muted small">로그인해서 가입을 요청한 사람이에요. 역할을 누르면 바로 쓸 수 있어요.</p>
          <div className="list">{pending.map((m) => <MemberRow key={m.id} m={m} ctx={ctx} onRole={change} onRemove={remove} sure={sure} />)}</div>
        </section>
      )}

      {invites.length > 0 && (
        <section className="group">
          <h3>등록해 두고 아직 로그인 전<span className="count">{invites.length}</span></h3>
          <div className="list">
            {invites.map((v) => (
              <div className="member" key={v.email}>
                <div><b>{v.name}</b> <span className={`role role-${v.role}`}>{ROLES[v.role]?.short}</span><span className="muted small"> {v.email}</span></div>
                <div className="seg">
                  {ROLE_PICK.map((r) => <button type="button" key={r} aria-pressed={v.role === r} onClick={async () => { try { await addInvite(v.by || ctx.user.id, { email: v.email, name: v.name, role: r }); ctx.say('역할을 바꿨어요') } catch { ctx.say('바꾸지 못했어요') } }}>{ROLES[r].short}</button>)}
                </div>
                <button type="button" className="link danger small" onClick={async () => { if (sure !== v.email) return setSure(v.email); try { await removeInvite(v.email); ctx.say('등록을 취소했어요') } catch { ctx.say('취소하지 못했어요') } }}>
                  {sure === v.email ? '한 번 더 누르면 등록이 취소돼요' : '등록 취소'}
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="group">
        <h3>함께 쓰는 팀원<span className="count">{active.length}</span></h3>
        <div className="list">{active.map((m) => <MemberRow key={m.id} m={m} ctx={ctx} onRole={change} onRemove={remove} sure={sure} />)}</div>
        <p className="muted small">모든 팀원이 모든 고객과 기록·대화를 함께 봅니다. TM은 주로 등록·통화·미팅 예약, 영업사원은 예약 확인·미팅 결과·계약을 적어요.</p>
      </section>
    </div>
  )
}
function MemberRow({ m, ctx, onRole, onRemove, sure }) {
  const self = m.id === ctx.user.id
  return (
    <div className="member">
      <div><b>{m.name}</b>{self && <span className="muted small"> (나)</span>}<span className="muted small"> {m.email}</span></div>
      <div className="seg">
        {ROLE_PICK.map((r) => <button type="button" key={r} aria-pressed={m.role === r} disabled={self} onClick={() => onRole(m, r)}>{ROLES[r].short}</button>)}
      </div>
      {!self && <button type="button" className="link danger small" onClick={() => onRemove(m)}>{sure === m.id ? '한 번 더 누르면 팀에서 빠져요' : '팀에서 빼기'}</button>}
    </div>
  )
}

/* ─────────────── 고객 상세 ─────────────── */
function Detail({ lead: l, ctx, onClose }) {
  const [logs, setLogs] = useState([])
  const [sheet, setSheet] = useState(null) // call · book · meet · contract · edit
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const endRef = useRef(null)
  useEffect(() => watchLogs(l.id, setLogs), [l.id])
  // 처음 열 때는 위(고객 정보)부터, 새 기록이 생기면 맨 아래로
  const seen = useRef(-1)
  useEffect(() => {
    if (seen.current >= 0 && logs.length > seen.current) endRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' })
    if (logs.length || seen.current >= 0) seen.current = logs.length
  }, [logs.length])
  useEffect(() => { const k = (e) => e.key === 'Escape' && !sheet && onClose(); window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k) }, [sheet, onClose])

  const uid = ctx.user.id
  const needAck = l.appt && !l.apptAck && l.salesId === uid
  const run = async (fn, msg) => { setBusy(true); try { await fn(); ctx.say(msg); return true } catch { ctx.say('저장하지 못했어요. 다시 눌러 주세요.'); return false } finally { setBusy(false) } }

  return (
    <div className="detail" role="dialog" aria-label={l.name}>
      <header className="d-top">
        <button type="button" className="back" onClick={onClose} aria-label="목록으로">‹</button>
        <div className="d-title"><b>{l.name}</b><StagePill k={l.stage} /></div>
        <button type="button" className="link" onClick={() => setSheet('edit')}>수정</button>
      </header>

      <div className="d-body">
        <div className="info">
          <div className="info-row"><span>담당자</span><b>{l.person || '—'}</b></div>
          <div className="info-row"><span>전화</span>
            {l.phone ? <span className="phone"><a href={telHref(l.phone)} className="call-btn">☎ {fmtPhone(l.phone)}</a>
              <button type="button" className="link small" onClick={() => navigator.clipboard?.writeText(l.phone).then(() => ctx.say('번호를 복사했어요'), () => {})}>복사</button></span> : <b>—</b>}
          </div>
          <div className="info-row"><span>지역·업종</span><b>{[l.region, l.category].filter(Boolean).join(' · ') || '—'}</b></div>
          <div className="info-row"><span>TM · 영업</span><b>{ctx.nameOf(l.tmId) || '—'} · {l.salesId ? ctx.nameOf(l.salesId) : <span className="muted">미배정</span>}</b></div>
        </div>

        <div className="status">
          <div className={l.appt ? (l.apptAck ? '' : 'hot') : 'off'}>
            <span>미팅 예약</span>
            <b>{l.appt?.at ? fmtWhen(l.appt.at) : '없음'}</b>
            {l.appt?.place && <small>{l.appt.place}</small>}
            {l.appt && <small>{l.apptAck ? '영업 확인 완료' : '영업 미확인'}</small>}
          </div>
          <div><span>미팅 횟수</span><b>{l.meetings || 0}회</b><small>통화 {l.calls || 0}회</small></div>
          <div className={l.contract ? '' : 'off'}><span>계약</span><b>{l.contract ? CONTRACT[l.contract.status]?.n : '—'}</b>{l.contract?.amount ? <small>{won(l.contract.amount)}원</small> : null}</div>
          <div className={l.nextCall ? '' : 'off'}><span>다음 통화</span><b>{l.nextCall ? fmtWhen(l.nextCall) : '—'}</b></div>
        </div>

        {needAck && (
          <button type="button" className="btn-primary ack" disabled={busy}
            onClick={() => run(() => act(ctx.user, l, { type: 'ack', text: `${fmtWhen(l.appt.at)} 미팅 확인했습니다` }, { apptAck: true }), '예약을 확인했어요')}>
            {fmtWhen(l.appt.at)} 미팅 확인했어요
          </button>
        )}

        <div className="actions">
          <button type="button" onClick={() => setSheet('call')}><b>통화 기록</b><small>결과·다음 통화</small></button>
          <button type="button" onClick={() => setSheet('book')}><b>미팅 예약</b><small>일시·영업 배정</small></button>
          <button type="button" onClick={() => setSheet('meet')}><b>미팅 결과</b><small>횟수·다음 단계</small></button>
          <button type="button" onClick={() => setSheet('contract')}><b>계약 상황</b><small>협의·완료·금액</small></button>
        </div>

        <h3 className="h3">기록과 대화</h3>
        <div className="timeline">
          {logs.length === 0 && <p className="muted small">아직 기록이 없어요.</p>}
          {logs.map((g) => <LogItem key={g.id} g={g} ctx={ctx} mine={g.by === uid} />)}
          <div ref={endRef} />
        </div>
      </div>

      <form className="composer" onSubmit={async (e) => {
        e.preventDefault(); const v = note.trim(); if (!v) return
        if (await run(() => act(ctx.user, l, { type: 'note', text: v }), '남겼어요')) setNote('')
      }}>
        <input id="note" className="inp" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder="팀원에게 남길 말" aria-label="메모 남기기" />
        <button className="btn-send" disabled={busy || !note.trim()}>보내기</button>
      </form>

      {sheet === 'call' && <CallSheet l={l} ctx={ctx} onClose={() => setSheet(null)} />}
      {sheet === 'book' && <BookSheet l={l} ctx={ctx} onClose={() => setSheet(null)} />}
      {sheet === 'meet' && <MeetSheet l={l} ctx={ctx} onClose={() => setSheet(null)} />}
      {sheet === 'contract' && <ContractSheet l={l} ctx={ctx} onClose={() => setSheet(null)} />}
      {sheet === 'edit' && <LeadForm ctx={ctx} lead={l} onClose={() => setSheet(null)} onSaved={() => { setSheet(null); ctx.say('고쳤어요') }} onDeleted={() => { setSheet(null); onClose(); ctx.say('삭제했어요') }} />}
    </div>
  )
}

function LogItem({ g, ctx, mine }) {
  const role = ctx.roleOf(g.by)
  let head = LOG_LABEL[g.type] || '기록'
  let detail = ''
  if (g.type === 'call') { head = `통화 · ${CALL_RESULT[g.result]?.n || ''}`; if (g.nextCall) detail = `다음 통화 ${fmtWhen(g.nextCall)}` }
  if (g.type === 'book') detail = [`${fmtWhen(g.apptAt)}`, g.place, g.salesId && `영업 ${ctx.nameOf(g.salesId)}`].filter(Boolean).join(' · ')
  if (g.type === 'meet') { head = `${g.count || ''}번째 미팅 결과`; detail = g.nextLabel ? `다음: ${g.nextLabel}${g.apptAt ? ` (${fmtWhen(g.apptAt)})` : ''}` : '' }
  if (g.type === 'contract') { head = `계약 · ${CONTRACT[g.status]?.n || ''}`; detail = [g.amount ? `${won(g.amount)}원` : '', g.date].filter(Boolean).join(' · ') }
  if (g.type === 'assign') detail = `영업 ${ctx.nameOf(g.salesId)}`
  if (g.type === 'stage') detail = `${STAGE[g.stage]?.n || ''}(으)로`
  const isNote = g.type === 'note'
  return (
    <div className={`log ${isNote ? 'log-note' : `log-${g.type}`} ${mine ? 'mine' : ''}`}>
      <div className="log-h"><b>{ctx.nameOf(g.by)}</b>{role && <span className={`role role-${role}`}>{ROLES[role]?.short}</span>}<span className="muted">{fmtAgo(g.at)}</span></div>
      {!isNote && <div className="log-type">{head}</div>}
      {detail && <div className="log-d">{detail}</div>}
      {g.text && <div className="log-t">{g.text}</div>}
    </div>
  )
}

/* ── 입력 시트들 ── */
function Sheet({ title, onClose, children, onSubmit, busy, submitLabel = '저장' }) {
  useEffect(() => { const k = (e) => e.key === 'Escape' && onClose(); window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k) }, [onClose])
  return (
    <div className="sheet" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <form className="panel" onSubmit={(e) => { e.preventDefault(); onSubmit() }} noValidate>
        <h2>{title}<button type="button" onClick={onClose} aria-label="닫기">×</button></h2>
        {children}
        <button className="btn-primary" disabled={busy}>{busy ? '저장하는 중…' : submitLabel}</button>
      </form>
    </div>
  )
}
function useSave(ctx, onClose) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const save = async (fn, msg) => { setBusy(true); setErr(''); try { await fn(); ctx.say(msg); onClose() } catch { setErr('저장하지 못했어요. 네트워크를 확인하고 다시 눌러 주세요.') } finally { setBusy(false) } }
  return { busy, err, setErr, save }
}
const Chips = ({ items, value, onChange }) => (
  <div className="chips">{items.map((o) => <button type="button" key={o.k} aria-pressed={value === o.k} onClick={() => onChange(o.k)}>{o.n}</button>)}</div>
)
function SalesPick({ ctx, value, onChange }) {
  return (
    <select id="salesPick" className="inp" value={value || ''} onChange={(e) => onChange(e.target.value)}>
      <option value="">영업사원 고르기</option>
      {ctx.salesList.map((m) => <option key={m.id} value={m.id}>{m.name} ({ROLES[m.role].short})</option>)}
    </select>
  )
}

function CallSheet({ l, ctx, onClose }) {
  const [result, setResult] = useState('talked')
  const [next, setNext] = useState('')
  const [text, setText] = useState('')
  const { busy, err, setErr, save } = useSave(ctx, onClose)
  const needNext = result === 'callback' || result === 'noanswer'
  return (
    <Sheet title="통화 기록" onClose={onClose} busy={busy} onSubmit={() => {
      if (needNext && !next) return setErr('다시 걸 날짜·시간을 정해 주세요.')
      const patch = { nextCall: needNext ? next : null }
      if (l.stage === 'new') patch.stage = 'called'
      if (result === 'reject') patch.stage = 'lost'
      save(() => act(ctx.user, l, { type: 'call', result, nextCall: needNext ? next : null, text: text.trim() }, patch, { calls: 1 }), '통화를 기록했어요')
    }}>
      <div className="field"><span>통화 결과</span><Chips items={CALL_RESULTS} value={result} onChange={setResult} /></div>
      {needNext && <label className="field"><span>다시 걸 때</span><input type="datetime-local" className="inp" value={next} min={nowLocal()} onChange={(e) => setNext(e.target.value)} /></label>}
      {result === 'reject' && <p className="hint">'관심 없음'을 저장하면 이 고객은 무산 단계로 옮겨져요.</p>}
      <label className="field"><span>통화 내용</span><textarea className="inp" rows={3} value={text} maxLength={500} onChange={(e) => setText(e.target.value)} placeholder="예: 원장님이 회원 음료 메뉴에 관심. 가격은 미팅 때 설명 원함" /></label>
      {err && <p className="err">{err}</p>}
    </Sheet>
  )
}

function BookSheet({ l, ctx, onClose }) {
  const [at, setAt] = useState(l.appt?.at || '')
  const [place, setPlace] = useState(l.appt?.place || '매장 방문')
  const [sales, setSales] = useState(l.salesId || (ctx.me.role === 'sales' ? ctx.user.id : ''))
  const [text, setText] = useState('')
  const { busy, err, setErr, save } = useSave(ctx, onClose)
  return (
    <Sheet title="미팅 예약" onClose={onClose} busy={busy} onSubmit={() => {
      if (!at) return setErr('미팅 날짜·시간을 정해 주세요.')
      if (!sales) return setErr('미팅에 갈 영업사원을 골라 주세요.')
      const selfBooked = sales === ctx.user.id
      save(() => act(ctx.user, l, { type: 'book', apptAt: at, place: place.trim(), salesId: sales, text: text.trim() },
        { appt: { at, place: place.trim() }, apptAck: selfBooked, salesId: sales, nextCall: null, stage: ['new', 'called', 'met', 'hold'].includes(l.stage) ? 'booked' : l.stage }), '미팅을 예약했어요')
    }}>
      <label className="field"><span>미팅 일시</span><input type="datetime-local" className="inp" value={at} onChange={(e) => setAt(e.target.value)} /></label>
      <label className="field"><span>장소</span><input className="inp" value={place} maxLength={60} onChange={(e) => setPlace(e.target.value)} placeholder="예: 매장 방문, 화상" /></label>
      <label className="field"><span>담당 영업사원</span><SalesPick ctx={ctx} value={sales} onChange={setSales} /></label>
      <label className="field"><span>영업사원에게 전할 말</span><textarea className="inp" rows={3} value={text} maxLength={500} onChange={(e) => setText(e.target.value)} placeholder="예: 원장님이 샘플 먼저 맛보고 싶어 함. 체험용 2병 챙겨 주세요" /></label>
      <p className="hint">저장하면 영업사원 '할 일'에 확인할 예약으로 올라갑니다.</p>
      {err && <p className="err">{err}</p>}
    </Sheet>
  )
}

function MeetSheet({ l, ctx, onClose }) {
  const [next, setNext] = useState('nego')
  const [again, setAgain] = useState('')
  const [text, setText] = useState('')
  const { busy, err, setErr, save } = useSave(ctx, onClose)
  const count = (l.meetings || 0) + 1
  return (
    <Sheet title={`${count}번째 미팅 결과`} onClose={onClose} busy={busy} onSubmit={() => {
      if (!text.trim()) return setErr('미팅에서 나눈 이야기를 적어 주세요.')
      if (next === 'again' && !again) return setErr('다음 미팅 일시를 정해 주세요.')
      const label = MEETING_NEXT.find((o) => o.k === next).n
      const patch = next === 'again'
        ? { stage: 'booked', appt: { at: again, place: l.appt?.place || '' }, apptAck: l.salesId === ctx.user.id }
        : { stage: next, appt: null, apptAck: false, ...(next === 'nego' && !l.contract ? { contract: { status: 'nego', amount: 0, date: '' } } : {}) }
      if (!l.salesId) patch.salesId = ctx.user.id
      save(() => act(ctx.user, l, { type: 'meet', count, next, nextLabel: label, apptAt: next === 'again' ? again : null, text: text.trim() }, patch, { meetings: 1 }), '미팅 결과를 남겼어요')
    }}>
      <label className="field"><span>미팅 내용</span><textarea className="inp" rows={4} value={text} maxLength={800} onChange={(e) => setText(e.target.value)} placeholder="예: 원장님·실장님 두 분 미팅. 샵인샵 진열 위치와 첫 입고 수량 협의" /></label>
      <div className="field"><span>다음 단계</span><Chips items={MEETING_NEXT} value={next} onChange={setNext} /></div>
      {next === 'again' && <label className="field"><span>다음 미팅 일시</span><input type="datetime-local" className="inp" value={again} onChange={(e) => setAgain(e.target.value)} /></label>}
      {err && <p className="err">{err}</p>}
    </Sheet>
  )
}

function ContractSheet({ l, ctx, onClose }) {
  const [status, setStatus] = useState(l.contract?.status || 'nego')
  const [amount, setAmount] = useState(l.contract?.amount ? Number(l.contract.amount).toLocaleString('ko-KR') : '')
  const [date, setDate] = useState(l.contract?.date || '')
  const [text, setText] = useState('')
  const { busy, err, save } = useSave(ctx, onClose)
  return (
    <Sheet title="계약 상황" onClose={onClose} busy={busy} onSubmit={() => {
      const amt = Number(amount.replace(/[^\d]/g, '')) || 0
      const d = status === 'won' ? (date || todayStr()) : date
      save(() => act(ctx.user, l, { type: 'contract', status, amount: amt, date: d, text: text.trim() },
        { contract: { status, amount: amt, date: d }, stage: status, ...(status !== 'nego' ? { appt: null, nextCall: null } : {}) }), '계약 상황을 남겼어요')
    }}>
      <div className="field"><span>상태</span><Chips items={CONTRACT_STATUS} value={status} onChange={setStatus} /></div>
      <div className="row2">
        <label className="field"><span>금액 (선택)</span><input className="inp" inputMode="numeric" value={amount} placeholder="0" onChange={(e) => { const v = e.target.value.replace(/[^\d]/g, ''); setAmount(v ? Number(v).toLocaleString('ko-KR') : '') }} /></label>
        <label className="field"><span>계약일</span><input type="date" className="inp" value={date} onChange={(e) => setDate(e.target.value)} /></label>
      </div>
      <label className="field"><span>내용</span><textarea className="inp" rows={3} value={text} maxLength={500} onChange={(e) => setText(e.target.value)} placeholder="예: 첫 입고 300병, 진열대 설치 다음 주. 계약서 서명 완료" /></label>
      {err && <p className="err">{err}</p>}
    </Sheet>
  )
}

function LeadForm({ ctx, lead, onClose, onSaved, onDeleted }) {
  const [f, setF] = useState({ name: lead?.name || '', person: lead?.person || '', phone: lead?.phone || '', region: lead?.region || '', category: lead?.category || '', memo: '', salesId: lead?.salesId || '' })
  const [sure, setSure] = useState(false)
  const { busy, err, setErr } = useSave(ctx, () => {})
  const [saving, setSaving] = useState(false)
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }))
  const submit = async () => {
    if (!f.name.trim()) return setErr('매장 이름을 적어 주세요.')
    if (!f.phone.trim()) return setErr('전화번호를 적어 주세요.')
    setSaving(true); setErr('')
    try {
      const data = { name: f.name.trim(), person: f.person.trim(), phone: f.phone.trim(), region: f.region.trim(), category: f.category }
      if (lead) {
        if ((f.salesId || null) !== (lead.salesId || null)) await act(ctx.user, lead, { type: 'assign', salesId: f.salesId || null, text: '' }, { ...data, salesId: f.salesId || null, apptAck: false })
        else await editLead(lead, data)
        onSaved()
      } else {
        const id = await createLead(ctx.user, { ...data, memo: f.memo.trim(), salesId: f.salesId || null })
        onSaved(id)
      }
    } catch { setErr('저장하지 못했어요. 다시 눌러 주세요.') } finally { setSaving(false) }
  }
  return (
    <Sheet title={lead ? '고객 정보 수정' : '고객 등록'} onClose={onClose} busy={busy || saving} onSubmit={submit} submitLabel={lead ? '저장' : '등록'}>
      <label className="field"><span>매장 이름</span><input className="inp" value={f.name} maxLength={40} onChange={set('name')} placeholder="예: 망원 바른헬스" /></label>
      <div className="row2">
        <label className="field"><span>원장·담당자</span><input className="inp" value={f.person} maxLength={20} onChange={set('person')} placeholder="예: 김원장" /></label>
        <label className="field"><span>전화번호</span><input className="inp" type="tel" inputMode="tel" value={f.phone} maxLength={20} onChange={set('phone')} placeholder="010-0000-0000" /></label>
      </div>
      <label className="field"><span>지역</span><input className="inp" value={f.region} maxLength={40} onChange={set('region')} placeholder="예: 서울 마포구 망원동" /></label>
      <div className="field"><span>업종</span><Chips items={CATEGORIES.map((c) => ({ k: c, n: c }))} value={f.category} onChange={(v) => setF((s) => ({ ...s, category: v }))} /></div>
      <label className="field"><span>담당 영업사원 (나중에 정해도 돼요)</span><SalesPick ctx={ctx} value={f.salesId} onChange={(v) => setF((s) => ({ ...s, salesId: v }))} /></label>
      {!lead && <label className="field"><span>메모 (어떻게 찾은 매장인지 등)</span><textarea className="inp" rows={2} value={f.memo} maxLength={300} onChange={set('memo')} placeholder="예: 네이버 지도 검색, 회원 200명 규모" /></label>}
      {err && <p className="err">{err}</p>}
      {lead && ctx.isAdmin && (
        <button type="button" className="link danger" onClick={async () => { if (!sure) return setSure(true); try { await deleteLead(lead); onDeleted() } catch { setErr('삭제하지 못했어요.') } }}>
          {sure ? '한 번 더 누르면 이 고객이 삭제돼요' : '이 고객 삭제'}
        </button>
      )}
    </Sheet>
  )
}
