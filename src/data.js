// 알프스 영업관리 — 고정 목록과 도우미

export const ROLES = {
  admin: { n: '대표', short: '대표' },
  tm: { n: 'TM (전화 상담)', short: 'TM' },
  sales: { n: '영업사원', short: '영업' },
  pending: { n: '승인 대기', short: '대기' },
}

// 고객 단계 (영업 흐름 순서)
export const STAGES = [
  { k: 'new', n: '신규', tone: 'gray' },
  { k: 'called', n: '통화 중', tone: 'blue' },
  { k: 'booked', n: '미팅 예약', tone: 'violet' },
  { k: 'met', n: '미팅 진행', tone: 'teal' },
  { k: 'nego', n: '계약 협의', tone: 'amber' },
  { k: 'won', n: '계약 완료', tone: 'green' },
  { k: 'hold', n: '보류', tone: 'gray' },
  { k: 'lost', n: '무산', tone: 'red' },
]
export const STAGE = Object.fromEntries(STAGES.map((s) => [s.k, s]))
export const OPEN_STAGES = ['new', 'called', 'booked', 'met', 'nego']

export const CATEGORIES = ['건강·웰니스샵', '뷰티·피부샵', '카페', '헬스·PT', '약국', '기타']

export const CALL_RESULTS = [
  { k: 'talked', n: '통화 완료' },
  { k: 'callback', n: '다시 연락 요청' },
  { k: 'noanswer', n: '부재중' },
  { k: 'reject', n: '관심 없음' },
]
export const CALL_RESULT = Object.fromEntries(CALL_RESULTS.map((s) => [s.k, s]))

export const MEETING_NEXT = [
  { k: 'nego', n: '계약 협의로' },
  { k: 'again', n: '다시 미팅' },
  { k: 'hold', n: '보류' },
  { k: 'lost', n: '무산' },
]

export const CONTRACT_STATUS = [
  { k: 'nego', n: '협의 중' },
  { k: 'won', n: '계약 완료' },
  { k: 'hold', n: '보류' },
  { k: 'lost', n: '무산' },
]
export const CONTRACT = Object.fromEntries(CONTRACT_STATUS.map((s) => [s.k, s]))

export const LOG_LABEL = {
  create: '고객 등록', call: '통화', book: '미팅 예약', ack: '예약 확인', meet: '미팅 결과', contract: '계약 상황', note: '메모', assign: '담당 변경', stage: '단계 변경',
}

// 날짜·시간
const pad = (n) => String(n).padStart(2, '0')
export const nowLocal = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}` }
export const todayStr = () => nowLocal().slice(0, 10)
const WD = ['일', '월', '화', '수', '목', '금', '토']
export function fmtWhen(s) {
  if (!s) return ''
  const [d, t] = s.split('T')
  const dt = new Date(`${d}T00:00`)
  const diff = Math.round((dt - new Date(`${todayStr()}T00:00`)) / 864e5)
  const day = diff === 0 ? '오늘' : diff === 1 ? '내일' : diff === -1 ? '어제' : `${Number(d.slice(5, 7))}.${Number(d.slice(8, 10))}(${WD[dt.getDay()]})`
  return t ? `${day} ${t.slice(0, 5)}` : day
}
export function fmtAgo(iso) {
  if (!iso) return ''
  const m = Math.round((Date.now() - new Date(iso)) / 6e4)
  if (m < 1) return '방금'
  if (m < 60) return `${m}분 전`
  const h = Math.round(m / 60)
  if (h < 24) return `${h}시간 전`
  const d = Math.round(h / 24)
  return d < 7 ? `${d}일 전` : iso.slice(5, 10).replace('-', '.')
}
export const won = (n) => (Math.round(n) || 0).toLocaleString('ko-KR')
export const telHref = (p) => `tel:${String(p || '').replace(/[^\d+]/g, '')}`
export const fmtPhone = (p) => {
  const d = String(p || '').replace(/\D/g, '')
  if (d.length === 11) return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`
  if (d.length === 10) return d.startsWith('02') ? `${d.slice(0, 2)}-${d.slice(2, 6)}-${d.slice(6)}` : `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`
  if (d.length === 9 && d.startsWith('02')) return `02-${d.slice(2, 5)}-${d.slice(5)}`
  return p || ''
}
