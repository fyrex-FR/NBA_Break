import { useCallback, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAppStore } from '../stores/appStore'
import { fetchBoxGuides } from '../api/client'
import { formatChecklistName } from '../utils/checklists'
import { isUpcoming, shortProductName } from '../utils/boxGuide'
import type { BoxGuideSummary, ChecklistInfo, ViewName } from '../types'

/** Une collection du catalogue, enrichie de son guide des boîtes quand on l'a. */
export interface CollectionEntry {
  id: string
  name: string
  season: string
  rows: number
  guide?: BoxGuideSummary
  checklist: ChecklistInfo
}

/** Guides des boîtes du sport courant, indexés par checklist_id. */
export function useBoxGuideIndex() {
  const sport = useAppStore((s) => s.selectedSport)
  const { data, isLoading } = useQuery({
    queryKey: ['box-guides', sport],
    queryFn: () => fetchBoxGuides(sport),
    staleTime: 60 * 60 * 1000,
  })
  const index = useMemo(() => {
    const m = new Map<string, BoxGuideSummary>()
    for (const g of data?.guides ?? []) if (g.checklist_id) m.set(g.checklist_id, g)
    return m
  }, [data])
  return { index, guides: data?.guides ?? [], isLoading }
}

export function toEntry(cl: ChecklistInfo, guide?: BoxGuideSummary): CollectionEntry {
  const f = formatChecklistName(cl.checklist_name, cl.display_name)
  return {
    id: cl.checklist_id,
    name: guide ? shortProductName(guide.name, guide.season) : f.name.replace(/\s+(Basketball|Checklist)$/gi, ''),
    season: guide?.season ?? f.year ?? cl.year,
    rows: cl.rows,
    guide,
    checklist: cl,
  }
}

/** Collections ouvertes, dans l'ordre de la sélection. */
export function useOpenCollections(): CollectionEntry[] {
  const { availableChecklists, selectedChecklistIds } = useAppStore()
  const { index } = useBoxGuideIndex()
  return useMemo(() => {
    const byId = new Map(availableChecklists.map((c) => [c.checklist_id, c]))
    return selectedChecklistIds.map((id) => byId.get(id)).filter(Boolean).map((cl) => toEntry(cl!, index.get(cl!.checklist_id)))
  }, [availableChecklists, selectedChecklistIds, index])
}

/** Tout le catalogue : saison la plus récente d'abord, puis date de sortie, puis taille. */
export function useAllCollections(): CollectionEntry[] {
  const availableChecklists = useAppStore((s) => s.availableChecklists)
  const { index } = useBoxGuideIndex()
  return useMemo(() => {
    const entries = availableChecklists.map((cl) => toEntry(cl, index.get(cl.checklist_id)))
    entries.sort((a, b) =>
      (b.season ?? '').localeCompare(a.season ?? '') ||
      (b.guide?.release_date ?? '').localeCompare(a.guide?.release_date ?? '') ||
      b.rows - a.rows,
    )
    return entries
  }, [availableChecklists, index])
}

/** Les dernières collections du catalogue. */
export function useRecentCollections(limit: number): CollectionEntry[] {
  const all = useAllCollections()
  return useMemo(() => all.slice(0, limit), [all, limit])
}

export interface ReleaseEntry {
  date: string
  name: string
  season: string | null
  formats: string[]
  checklistId: string | null
  upcoming: boolean
}

/** Calendrier des sorties : à venir (plus proche d'abord), puis sorties récentes. */
export function useReleaseCalendar(upcomingMax = 4, recentMax = 5): ReleaseEntry[] {
  const { guides } = useBoxGuideIndex()
  return useMemo(() => {
    const byKey = new Map<string, ReleaseEntry>()
    for (const g of guides) {
      for (const f of g.formats) {
        if (!f.release_date) continue
        const key = `${g.source_slug}|${f.release_date}`
        const cur = byKey.get(key) ?? {
          date: f.release_date, name: shortProductName(g.name, g.season), season: g.season,
          formats: [], checklistId: g.checklist_id, upcoming: isUpcoming(f.release_date),
        }
        cur.formats.push(f.name)
        byKey.set(key, cur)
      }
    }
    const all = [...byKey.values()]
    const upcoming = all.filter((e) => e.upcoming).sort((a, b) => a.date.localeCompare(b.date)).slice(0, upcomingMax)
    const recent = all.filter((e) => !e.upcoming).sort((a, b) => b.date.localeCompare(a.date)).slice(0, recentMax)
    return [...upcoming, ...recent]
  }, [guides, upcomingMax, recentMax])
}

/** Ouvre une collection seule (le parcours principal) et va sur l'onglet voulu. */
export function useOpenCollection() {
  return useCallback((id: string, view: ViewName = '🌡️ Spots') => {
    const s = useAppStore.getState()
    s.setSelectedChecklistIds([id])
    s.setActiveView(view)
    s.closeSelection()
  }, [])
}
