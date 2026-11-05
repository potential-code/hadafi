'use client'

import { useEffect, useId, useRef, useState } from 'react'
import Link from 'next/link'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import { arrayMove, SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { ArrowLeft, BookOpen, EyeOff, Layers, ListChecks, Pencil, Plus, Send, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { AdminLayout } from '@/components/admin/AdminLayout'
import {
  fetchCourse,
  apiUpdateCourse,
  apiCreateModule,
  apiUpdateModule,
  apiDeleteModule,
  apiReorderModules,
  apiCreateUnit,
  apiUpdateUnit,
  apiDeleteUnit,
  apiReorderUnits,
  apiCreateBlock,
  apiUpdateBlock,
  apiDeleteBlock,
  apiReorderBlocks,
  apiCreateBlockQuestion,
  type CourseModule,
  type Unit,
  type LearningBlock,
  type BlockQuestion,
} from '@/lib/api/lms'
import type { CourseTopic } from '@/lib/api/redesign'
import { ConfirmDialog } from '@/components/admin/widgets/ConfirmDialog'
import { AssessmentSection } from '@/components/admin/lms/AssessmentSection'
import { BlockDialog } from '@/components/admin/lms/BlockEditor'
import { BlockCard, defaultCollapsed } from '@/components/admin/lms/BlockCard'
import { CurriculumTree } from '@/components/admin/lms/CurriculumTree'
import { CourseSettingsPanel, CourseStats, type EditableCourse } from '@/components/admin/lms/CourseSettingsPanel'
import { CourseThumb } from '@/components/admin/lms/CourseThumb'
import { DialogActions, FormField, errorMessage, fieldClass, textareaClass } from '@/components/admin/lms/shared'
import { IconButton, Modal, Pill, Tag } from '@/components/admin/ui'
import { Button, Card, EmptyState, Skeleton } from '@/components/kit'
import { optimizedSrc } from '@/lib/images'

/** The course settings that autosave on blur (topic saves on its own). */
function settingsKey(c: EditableCourse) {
  return JSON.stringify([c.title, c.description, c.cover, c.difficulty, c.pointsPerUnit, c.enableCertificate])
}

export default function AdminCourseBuilder({ id }: { id: string }) {
  const [course, setCourse] = useState<EditableCourse | null>(null)
  const [loading, setLoading] = useState(true)
  const [openModules, setOpenModules] = useState<Record<string, boolean>>({})
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null)
  const [collapsedBlocks, setCollapsedBlocks] = useState<Record<string, boolean>>({})
  const [editingModule, setEditingModule] = useState<CourseModule | null>(null)
  const [creatingModule, setCreatingModule] = useState(false)
  const [unitCtx, setUnitCtx] = useState<{ moduleId: string; unit: Unit | null } | null>(null)
  const [blockCtx, setBlockCtx] = useState<{
    moduleId: string
    unitId: string
    block: LearningBlock | null
  } | null>(null)
  const [confirmDeleteModuleId, setConfirmDeleteModuleId] = useState<string | null>(null)
  const [confirmDeleteUnit, setConfirmDeleteUnit] = useState<{ moduleId: string; unitId: string } | null>(null)
  const [confirmDeleteBlock, setConfirmDeleteBlock] = useState<{ moduleId: string; unitId: string; blockId: string } | null>(null)
  const [topicSaving, setTopicSaving] = useState(false)
  const savedSettings = useRef<string>('')

  useEffect(() => {
    fetchCourse(id)
      .then((data) => {
        const c = data as EditableCourse
        setCourse(c)
        savedSettings.current = settingsKey(c)
        const open: Record<string, boolean> = {}
        c.modules.forEach((m) => {
          open[m.id] = true
        })
        setOpenModules(open)
        setSelectedUnitId(c.modules.flatMap((m) => m.units)[0]?.id ?? null)
      })
      .catch((e: unknown) => toast.error(errorMessage(e)))
      .finally(() => setLoading(false))
  }, [id])

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))

  if (loading)
    return (
      <AdminLayout>
        <div className="flex flex-col gap-5" aria-busy="true">
          <Skeleton className="h-4 w-24" />
          <div className="flex items-center gap-4">
            <Skeleton className="hidden h-[60px] w-24 sm:block" />
            <div className="flex flex-1 flex-col gap-2">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-8 w-72 max-w-full" />
            </div>
          </div>
          <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-5 min-[901px]:grid-cols-[260px_minmax(0,1fr)] min-[1281px]:grid-cols-[256px_minmax(0,1fr)_280px]">
            <Skeleton className="h-96 rounded-[14px]" />
            <Skeleton className="h-[480px] rounded-[14px]" />
            <Skeleton className="hidden h-96 rounded-[14px] min-[1281px]:block" />
          </div>
        </div>
      </AdminLayout>
    )
  if (!course)
    return (
      <AdminLayout>
        <Card>
          <EmptyState
            icon={BookOpen}
            title="Course not found"
            body="It may have been deleted, or it could not be loaded."
            action={
              <Link href="/admin/courses" className="text-sm font-semibold text-ui-brand-text hover:underline">
                Back to all courses
              </Link>
            }
          />
        </Card>
      </AdminLayout>
    )

  const totalUnits = (course.modules ?? []).reduce((s, m) => s + m.units.length, 0)
  const totalBlocks = (course.modules ?? []).reduce(
    (s, m) => s + m.units.reduce((s2, u) => s2 + u.blocks.length, 0),
    0,
  )

  // Selected unit (falls back to the first unit when the selection is gone).
  const allUnits = course.modules.flatMap((m) => m.units.map((u, i) => ({ module: m, unit: u, index: i })))
  const current = allUnits.find((x) => x.unit.id === selectedUnitId) ?? allUnits[0] ?? null
  const published = course.status === 'published'

  function updateCourse(patch: Partial<EditableCourse>) {
    setCourse((c) => (c ? { ...c, ...patch } : c))
  }

  function patchUnit(moduleId: string, unitId: string, fn: (u: Unit) => Unit) {
    setCourse((c) =>
      c
        ? {
            ...c,
            modules: c.modules.map((m) =>
              m.id !== moduleId ? m : { ...m, units: m.units.map((u) => (u.id !== unitId ? u : fn(u))) },
            ),
          }
        : c,
    )
  }

  async function saveCourseSettings() {
    if (!course) return
    const key = settingsKey(course)
    if (key === savedSettings.current) return // nothing changed since the last save
    try {
      await apiUpdateCourse(course.id, {
        title: course.title,
        description: course.description,
        cover: course.cover,
        difficulty: course.difficulty,
        pointsPerUnit: course.pointsPerUnit,
        enableCertificate: course.enableCertificate,
      })
      savedSettings.current = key
      toast.success('Settings saved')
    } catch (e) {
      toast.error(errorMessage(e))
    }
  }

  async function saveTopic(next: CourseTopic | null) {
    if (!course) return
    const prev = course.category ?? null
    if (next === prev) return
    updateCourse({ category: next })
    setTopicSaving(true)
    try {
      await apiUpdateCourse(course.id, { category: next })
      toast.success(next ? `Topic set to ${next}` : 'Topic cleared')
    } catch (e) {
      updateCourse({ category: prev })
      toast.error(`Could not save the topic. ${errorMessage(e)}`)
    } finally {
      setTopicSaving(false)
    }
  }

  async function togglePublish() {
    if (!course) return
    const next = course.status === 'published' ? 'draft' : 'published'
    try {
      await apiUpdateCourse(course.id, { status: next })
      setCourse((c) => (c ? { ...c, status: next } : c))
      toast.success(next === 'published' ? 'Course published' : 'Course unpublished')
    } catch (e) {
      toast.error(errorMessage(e))
    }
  }

  function reorderModules(e: DragEndEvent) {
    const { active, over } = e
    if (!over || active.id === over.id || !course) return
    const oldIdx = course.modules.findIndex((m) => m.id === active.id)
    const newIdx = course.modules.findIndex((m) => m.id === over.id)
    const reordered = arrayMove(course.modules, oldIdx, newIdx)
    const reorderedIds = reordered.map((m) => m.id)
    const prev = course.modules
    setCourse((c) => (c ? { ...c, modules: reordered } : c))
    apiReorderModules(course.id, reorderedIds).catch((e: unknown) => {
      setCourse((c) => (c ? { ...c, modules: prev } : c))
      toast.error(errorMessage(e))
    })
  }

  function reorderUnits(moduleId: string, e: DragEndEvent) {
    const { active, over } = e
    if (!over || active.id === over.id || !course) return
    const mod = course.modules.find((m) => m.id === moduleId)!
    const oldIdx = mod.units.findIndex((u) => u.id === active.id)
    const newIdx = mod.units.findIndex((u) => u.id === over.id)
    const reordered = arrayMove(mod.units, oldIdx, newIdx)
    const reorderedIds = reordered.map((u) => u.id)
    const prevUnits = mod.units
    setCourse((c) =>
      c ? { ...c, modules: c.modules.map((m) => (m.id !== moduleId ? m : { ...m, units: reordered })) } : c,
    )
    apiReorderUnits(moduleId, reorderedIds).catch((e: unknown) => {
      setCourse((c) =>
        c ? { ...c, modules: c.modules.map((m) => (m.id !== moduleId ? m : { ...m, units: prevUnits })) } : c,
      )
      toast.error(errorMessage(e))
    })
  }

  function reorderBlocks(moduleId: string, unitId: string, e: DragEndEvent) {
    const { active, over } = e
    if (!over || active.id === over.id || !course) return
    const mod = course.modules.find((m) => m.id === moduleId)!
    const unit = mod.units.find((u) => u.id === unitId)!
    const oldIdx = unit.blocks.findIndex((b) => b.id === active.id)
    const newIdx = unit.blocks.findIndex((b) => b.id === over.id)
    const reordered = arrayMove(unit.blocks, oldIdx, newIdx)
    const reorderedIds = reordered.map((b) => b.id)
    const prevBlocks = unit.blocks
    patchUnit(moduleId, unitId, (u) => ({ ...u, blocks: reordered }))
    apiReorderBlocks(unitId, reorderedIds).catch((e: unknown) => {
      patchUnit(moduleId, unitId, (u) => ({ ...u, blocks: prevBlocks }))
      toast.error(errorMessage(e))
    })
  }

  async function saveModule(data: Partial<CourseModule>) {
    if (!course) return
    try {
      if (editingModule) {
        const updated = await apiUpdateModule(editingModule.id, {
          title: data.title,
          description: data.description ?? undefined,
        })
        setCourse((c) =>
          c ? { ...c, modules: c.modules.map((m) => (m.id === editingModule.id ? { ...m, ...updated } : m)) } : c,
        )
        toast.success('Module updated')
        setEditingModule(null)
      } else {
        const fresh = await apiCreateModule(course.id, {
          title: data.title ?? 'New module',
          description: data.description ?? undefined,
        })
        setCourse((c) => (c ? { ...c, modules: [...c.modules, fresh] } : c))
        setOpenModules((o) => ({ ...o, [fresh.id]: true }))
        toast.success('Module created')
        setCreatingModule(false)
      }
    } catch (e) {
      toast.error(errorMessage(e))
    }
  }

  async function deleteModule(modId: string) {
    try {
      await apiDeleteModule(modId)
      setCourse((c) => (c ? { ...c, modules: c.modules.filter((m) => m.id !== modId) } : c))
      toast.success('Module removed')
    } catch (e) {
      toast.error(errorMessage(e))
    }
  }

  async function saveUnit(data: Partial<Unit>) {
    if (!unitCtx || !course) return
    try {
      if (unitCtx.unit) {
        const updated = await apiUpdateUnit(unitCtx.unit.id, {
          title: data.title,
          description: data.description ?? undefined,
          durationMinutes: data.durationMinutes ?? undefined,
        })
        patchUnit(unitCtx.moduleId, unitCtx.unit.id, (u) => ({ ...u, ...updated, blocks: u.blocks }))
        toast.success('Unit updated')
      } else {
        const fresh = await apiCreateUnit(unitCtx.moduleId, {
          title: data.title ?? 'New unit',
          description: data.description ?? undefined,
          durationMinutes: data.durationMinutes ?? undefined,
        })
        setCourse((c) =>
          c
            ? {
                ...c,
                modules: c.modules.map((m) =>
                  m.id !== unitCtx.moduleId ? m : { ...m, units: [...m.units, { ...fresh, blocks: fresh.blocks ?? [] }] },
                ),
              }
            : c,
        )
        setOpenModules((o) => ({ ...o, [unitCtx.moduleId]: true }))
        setSelectedUnitId(fresh.id)
        toast.success('Unit added')
      }
      setUnitCtx(null)
    } catch (e) {
      toast.error(errorMessage(e))
    }
  }

  /** Inline description / duration edits from the unit panel. */
  async function saveUnitFields(moduleId: string, unit: Unit, fields: { description: string; durationMinutes: number | null }) {
    try {
      const updated = await apiUpdateUnit(unit.id, {
        description: fields.description,
        durationMinutes: fields.durationMinutes ?? undefined,
      })
      patchUnit(moduleId, unit.id, (u) => ({ ...u, ...updated, blocks: u.blocks }))
      toast.success('Unit saved')
    } catch (e) {
      toast.error(errorMessage(e))
    }
  }

  async function deleteUnit(moduleId: string, unitId: string) {
    try {
      await apiDeleteUnit(unitId)
      setCourse((c) =>
        c
          ? {
              ...c,
              modules: c.modules.map((m) =>
                m.id !== moduleId ? m : { ...m, units: m.units.filter((u) => u.id !== unitId) },
              ),
            }
          : c,
      )
      if (selectedUnitId === unitId) setSelectedUnitId(null)
      toast.success('Unit removed')
    } catch (e) {
      toast.error(errorMessage(e))
    }
  }

  async function saveBlock(data: LearningBlock) {
    if (!blockCtx || !course) return
    try {
      const { id: _id, unitId: _uid, order: _ord, questions: _qs, ...blockData } = data
      if (blockCtx.block) {
        const updated = await apiUpdateBlock(blockCtx.block.id, blockData)
        patchUnit(blockCtx.moduleId, blockCtx.unitId, (u) => ({
          ...u,
          blocks: u.blocks.map((b) => (b.id === blockCtx.block!.id ? { ...updated, questions: data.questions } : b)),
        }))
        toast.success('Block updated')
      } else {
        const fresh = await apiCreateBlock(blockCtx.unitId, blockData)
        const createdQs =
          data.questions && data.questions.length > 0
            ? await Promise.all(
                data.questions.map((q) =>
                  apiCreateBlockQuestion(fresh.id, {
                    kind: q.kind,
                    format: q.format,
                    prompt: q.prompt,
                    options: q.options ?? null,
                    correctIndex: q.correctIndex ?? null,
                    correctBool: q.correctBool ?? null,
                    placeholder: q.placeholder ?? null,
                  }),
                ),
              )
            : []
        const created = { ...fresh, questions: createdQs }
        patchUnit(blockCtx.moduleId, blockCtx.unitId, (u) => ({ ...u, blocks: [...u.blocks, created] }))
        toast.success('Block added')
      }
      setBlockCtx(null)
    } catch (e) {
      toast.error(errorMessage(e))
    }
  }

  async function deleteBlock(moduleId: string, unitId: string, blockId: string) {
    try {
      await apiDeleteBlock(blockId)
      patchUnit(moduleId, unitId, (u) => ({ ...u, blocks: u.blocks.filter((b) => b.id !== blockId) }))
      toast.success('Block removed')
    } catch (e) {
      toast.error(errorMessage(e))
    }
  }

  function setBlockQuestions(moduleId: string, unitId: string, blockId: string, qs: BlockQuestion[]) {
    patchUnit(moduleId, unitId, (u) => ({
      ...u,
      blocks: u.blocks.map((b) => (b.id === blockId ? { ...b, questions: qs } : b)),
    }))
  }

  function selectUnit(_moduleId: string, unitId: string) {
    setSelectedUnitId(unitId)
    // On one-column layouts the unit sits below the tree; bring it into view.
    if (typeof window !== 'undefined' && window.innerWidth < 901) {
      window.requestAnimationFrame(() =>
        document.getElementById('unit-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
      )
    }
  }

  const firstModule = course.modules[0]

  return (
    <AdminLayout>
      <div className="flex flex-col gap-5">
        <Link
          href="/admin/courses"
          className="inline-flex items-center gap-1.5 self-start text-[13px] font-semibold text-ui-brand-text hover:underline"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          All courses
        </Link>

        {/* Header */}
        <header className="flex items-center gap-4 max-md:flex-col max-md:items-start">
          {course.cover ? (
            <img
              src={optimizedSrc(course.cover)}
              alt=""
              className="hidden h-[60px] w-24 shrink-0 rounded-[10px] object-cover sm:block"
            />
          ) : (
            <CourseThumb title={course.title} size={60} className="hidden sm:inline-flex" />
          )}
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <div className="flex flex-wrap gap-1.5">
              <Pill tone={published ? 'brand' : 'neutral'} dot>
                {published ? 'Published' : 'Draft'}
              </Pill>
              <Tag>{course.difficulty}</Tag>
              {course.category && <Tag>{course.category}</Tag>}
            </div>
            <h1 className="text-2xl font-semibold tracking-[-0.02em] text-ui-text sm:text-[28px] sm:leading-tight">
              {course.title || 'Untitled course'}
            </h1>
            <p className="line-clamp-2 text-[15px] text-ui-muted">{course.description || 'No description yet.'}</p>
          </div>
          <Button variant={published ? 'secondary' : 'primary'} onClick={togglePublish}>
            {published ? <EyeOff className="h-4 w-4" aria-hidden /> : <Send className="h-4 w-4" aria-hidden />}
            {published ? 'Unpublish' : 'Publish course'}
          </Button>
        </header>

        <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-5 min-[901px]:grid-cols-[260px_minmax(0,1fr)] min-[1281px]:grid-cols-[256px_minmax(0,1fr)_280px]">
          <CurriculumTree
            className="min-[901px]:sticky min-[901px]:top-4 min-[901px]:max-h-[calc(100dvh-2rem)] min-[901px]:overflow-y-auto"
            modules={course.modules}
            openModules={openModules}
            onToggleModule={(mid) => setOpenModules((o) => ({ ...o, [mid]: !o[mid] }))}
            selectedUnitId={current?.unit.id ?? null}
            onSelectUnit={selectUnit}
            onAddModule={() => setCreatingModule(true)}
            onEditModule={(m) => setEditingModule(m)}
            onDeleteModule={(mid) => setConfirmDeleteModuleId(mid)}
            onAddUnit={(mid) => setUnitCtx({ moduleId: mid, unit: null })}
            onModulesReorder={reorderModules}
            onUnitsReorder={reorderUnits}
            preCount={course.preAssessment ? course.preAssessment.questions.length : null}
            postCount={course.postAssessment ? course.postAssessment.questions.length : null}
            sensors={sensors}
          />

          {/* Canvas */}
          <div className="flex min-w-0 flex-col gap-3.5">
            {course.modules.length === 0 ? (
              <Card>
                <EmptyState
                  icon={Layers}
                  title="No modules yet"
                  body="Add a module, then add units and learning blocks to it."
                  action={
                    <Button size="sm" onClick={() => setCreatingModule(true)}>
                      <Plus className="h-4 w-4" aria-hidden />
                      Add module
                    </Button>
                  }
                />
              </Card>
            ) : !current ? (
              <Card>
                <EmptyState
                  icon={BookOpen}
                  title="No units yet"
                  body={`Add a unit to ${firstModule.title} to start adding learning blocks.`}
                  action={
                    <Button size="sm" onClick={() => setUnitCtx({ moduleId: firstModule.id, unit: null })}>
                      <Plus className="h-4 w-4" aria-hidden />
                      Add unit
                    </Button>
                  }
                />
              </Card>
            ) : (
              <>
                <UnitPanel
                  key={current.unit.id}
                  unit={current.unit}
                  position={`Unit ${current.index + 1} of ${current.module.units.length}${
                    course.modules.length > 1 ? `, ${current.module.title}` : ''
                  }`}
                  onEdit={() => setUnitCtx({ moduleId: current.module.id, unit: current.unit })}
                  onDelete={() => setConfirmDeleteUnit({ moduleId: current.module.id, unitId: current.unit.id })}
                  onSaveFields={(fields) => saveUnitFields(current.module.id, current.unit, fields)}
                />

                <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-base font-semibold text-ui-text">
                    Learning blocks <span className="font-medium text-ui-muted">{current.unit.blocks.length}</span>
                  </h2>
                  <Button
                    size="sm"
                    onClick={() => setBlockCtx({ moduleId: current.module.id, unitId: current.unit.id, block: null })}
                  >
                    <Plus className="h-4 w-4" aria-hidden />
                    Add learning block
                  </Button>
                </div>

                {current.unit.blocks.length === 0 ? (
                  <Card>
                    <EmptyState
                      icon={ListChecks}
                      title="No learning blocks yet"
                      body="Add text, a video, an image, a survey or an action plan to this unit."
                    />
                  </Card>
                ) : (
                  <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={(e) => reorderBlocks(current.module.id, current.unit.id, e)}
                  >
                    <SortableContext items={current.unit.blocks.map((b) => b.id)} strategy={verticalListSortingStrategy}>
                      {current.unit.blocks.map((b) => (
                        <BlockCard
                          key={b.id}
                          block={b}
                          collapsed={collapsedBlocks[b.id] ?? defaultCollapsed(b)}
                          onToggleCollapsed={() =>
                            setCollapsedBlocks((s) => ({ ...s, [b.id]: !(s[b.id] ?? defaultCollapsed(b)) }))
                          }
                          onEdit={() => setBlockCtx({ moduleId: current.module.id, unitId: current.unit.id, block: b })}
                          onDelete={() =>
                            setConfirmDeleteBlock({ moduleId: current.module.id, unitId: current.unit.id, blockId: b.id })
                          }
                          onQuestionsChange={(qs) => setBlockQuestions(current.module.id, current.unit.id, b.id, qs)}
                        />
                      ))}
                    </SortableContext>
                  </DndContext>
                )}
              </>
            )}

            {/* Assessments */}
            <section aria-labelledby="assessments-heading" className="mt-1.5 overflow-hidden rounded-[14px] border border-ui-line bg-ui-surface">
              <div className="border-b border-ui-line px-5 py-3.5">
                <h2 id="assessments-heading" className="text-base font-semibold text-ui-text">
                  Assessments
                </h2>
                <p className="mt-0.5 text-[13px] text-ui-muted">
                  The pre-test is shown before the modules, the final exam comes after all modules.
                </p>
              </div>
              <AssessmentSection
                courseId={course.id}
                type="pre"
                defaultExpanded={false}
                assessment={course.preAssessment}
                onCreated={(a) => setCourse((c) => (c ? { ...c, preAssessment: a } : c))}
                onUpdated={(a) => setCourse((c) => (c ? { ...c, preAssessment: a } : c))}
                onDeleted={() => setCourse((c) => (c ? { ...c, preAssessment: null } : c))}
              />
              <AssessmentSection
                courseId={course.id}
                type="post"
                className="border-t border-ui-line"
                assessment={course.postAssessment}
                onCreated={(a) => setCourse((c) => (c ? { ...c, postAssessment: a } : c))}
                onUpdated={(a) => setCourse((c) => (c ? { ...c, postAssessment: a } : c))}
                onDeleted={() => setCourse((c) => (c ? { ...c, postAssessment: null } : c))}
              />
            </section>
          </div>

          {/* Settings rail */}
          <aside className="flex flex-col gap-4 min-[901px]:col-start-2 min-[901px]:grid min-[901px]:grid-cols-2 min-[901px]:items-start min-[1281px]:col-start-3 min-[1281px]:flex min-[1281px]:items-stretch">
            <CourseSettingsPanel
              course={course}
              onChange={updateCourse}
              onSave={saveCourseSettings}
              onTopicChange={saveTopic}
              topicSaving={topicSaving}
            />
            <CourseStats modules={course.modules.length} units={totalUnits} blocks={totalBlocks} />
          </aside>
        </div>
      </div>

      <ModuleDialog
        open={creatingModule || !!editingModule}
        initial={editingModule ?? undefined}
        onClose={() => {
          setCreatingModule(false)
          setEditingModule(null)
        }}
        onSave={saveModule}
      />

      <UnitDialog open={!!unitCtx} initial={unitCtx?.unit ?? undefined} onClose={() => setUnitCtx(null)} onSave={saveUnit} />

      <BlockDialog
        open={!!blockCtx}
        initial={blockCtx?.block ?? undefined}
        blockId={blockCtx?.block?.id}
        onClose={() => setBlockCtx(null)}
        onSave={saveBlock}
      />

      <ConfirmDialog
        open={!!confirmDeleteModuleId}
        title="Delete module"
        message="This will permanently delete this module and all its units and learning blocks. This cannot be undone."
        confirmLabel="Delete module"
        onConfirm={() => {
          if (confirmDeleteModuleId) deleteModule(confirmDeleteModuleId)
          setConfirmDeleteModuleId(null)
        }}
        onCancel={() => setConfirmDeleteModuleId(null)}
      />
      <ConfirmDialog
        open={!!confirmDeleteUnit}
        title="Delete unit"
        message="This will permanently delete this unit and all its learning blocks. This cannot be undone."
        confirmLabel="Delete unit"
        onConfirm={() => {
          if (confirmDeleteUnit) deleteUnit(confirmDeleteUnit.moduleId, confirmDeleteUnit.unitId)
          setConfirmDeleteUnit(null)
        }}
        onCancel={() => setConfirmDeleteUnit(null)}
      />
      <ConfirmDialog
        open={!!confirmDeleteBlock}
        title="Delete block"
        message="This will permanently delete this learning block and its content. This cannot be undone."
        confirmLabel="Delete block"
        onConfirm={() => {
          if (confirmDeleteBlock) deleteBlock(confirmDeleteBlock.moduleId, confirmDeleteBlock.unitId, confirmDeleteBlock.blockId)
          setConfirmDeleteBlock(null)
        }}
        onCancel={() => setConfirmDeleteBlock(null)}
      />
    </AdminLayout>
  )
}

// ─── Selected unit panel ──────────────────────────────────────────────────────

function UnitPanel({
  unit,
  position,
  onEdit,
  onDelete,
  onSaveFields,
}: {
  unit: Unit
  position: string
  onEdit: () => void
  onDelete: () => void
  onSaveFields: (fields: { description: string; durationMinutes: number | null }) => void
}) {
  const descId = useId()
  const durId = useId()
  const [description, setDescription] = useState(unit.description ?? '')
  const [duration, setDuration] = useState(unit.durationMinutes != null ? String(unit.durationMinutes) : '')

  // Follow outside changes (e.g. the Edit unit dialog).
  useEffect(() => {
    setDescription(unit.description ?? '')
    setDuration(unit.durationMinutes != null ? String(unit.durationMinutes) : '')
  }, [unit.description, unit.durationMinutes])

  function commit() {
    const nextDuration = duration.trim() === '' ? null : Math.max(0, Number(duration))
    const descChanged = description !== (unit.description ?? '')
    const durChanged = nextDuration !== null && nextDuration !== unit.durationMinutes
    if (!descChanged && !durChanged) return
    onSaveFields({ description, durationMinutes: nextDuration })
  }

  return (
    <section
      id="unit-panel"
      aria-labelledby="unit-panel-heading"
      className="flex scroll-mt-20 flex-col gap-3.5 rounded-[14px] border border-ui-line bg-ui-surface px-5 py-[18px]"
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="mb-0.5 text-[13px] text-ui-muted">{position}</p>
          <h2 id="unit-panel-heading" className="text-lg font-semibold leading-snug text-ui-text">
            {unit.title}
          </h2>
        </div>
        <Button variant="secondary" size="sm" onClick={onEdit}>
          <Pencil className="h-4 w-4" aria-hidden />
          Edit unit
        </Button>
        <IconButton label={`Delete unit ${unit.title}`} icon={Trash2} tone="danger" onClick={onDelete} />
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-[minmax(0,1fr)_180px]">
        <div className="flex flex-col gap-1.5">
          <label htmlFor={descId} className="text-[13px] font-semibold text-ui-text">
            Description
          </label>
          <input
            id={descId}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
            placeholder="Add a short description"
            className={fieldClass}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={durId} className="text-[13px] font-semibold text-ui-text">
            Duration (minutes, optional)
          </label>
          <input
            id={durId}
            type="number"
            min={0}
            inputMode="numeric"
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
            placeholder="e.g. 15"
            className={fieldClass}
          />
        </div>
      </div>
    </section>
  )
}

// ─── Dialogs ──────────────────────────────────────────────────────────────────

function ModuleDialog({
  open,
  initial,
  onClose,
  onSave,
}: {
  open: boolean
  initial?: Partial<CourseModule>
  onClose: () => void
  onSave: (m: Partial<CourseModule>) => void
}) {
  const formId = useId()
  const [form, setForm] = useState<Partial<CourseModule>>(initial ?? {})
  useEffect(() => {
    if (open) setForm(initial ?? {})
  }, [open, initial])

  return (
    <Modal
      open={open}
      title={initial?.id ? 'Edit module' : 'New module'}
      onClose={onClose}
      footer={<DialogActions formId={formId} onCancel={onClose} />}
    >
      <form
        id={formId}
        onSubmit={(e) => {
          e.preventDefault()
          onSave(form)
        }}
        className="flex flex-col gap-4"
      >
        <FormField label="Title">
          <input
            value={form.title ?? ''}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            className={fieldClass}
            required
          />
        </FormField>
        <FormField label="Description">
          <textarea
            value={form.description ?? ''}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            rows={3}
            className={textareaClass}
          />
        </FormField>
      </form>
    </Modal>
  )
}

function UnitDialog({
  open,
  initial,
  onClose,
  onSave,
}: {
  open: boolean
  initial?: Partial<Unit>
  onClose: () => void
  onSave: (u: Partial<Unit>) => void
}) {
  const formId = useId()
  const isEdit = !!initial?.id
  const [form, setForm] = useState<Partial<Unit>>(initial ?? {})

  useEffect(() => {
    if (open) setForm(initial ?? {})
  }, [open, initial])

  return (
    <Modal
      open={open}
      title={isEdit ? 'Edit unit' : 'New unit'}
      onClose={onClose}
      footer={<DialogActions formId={formId} onCancel={onClose} />}
    >
      <form
        id={formId}
        onSubmit={(e) => {
          e.preventDefault()
          onSave(form)
        }}
        className="flex flex-col gap-4"
      >
        <FormField label="Title">
          <input
            value={form.title ?? ''}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            className={fieldClass}
            required
          />
        </FormField>
        <FormField label="Description">
          <textarea
            value={form.description ?? ''}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            rows={3}
            className={textareaClass}
          />
        </FormField>
        <FormField label="Duration (minutes, optional)">
          <input
            type="number"
            min={0}
            value={form.durationMinutes ?? ''}
            onChange={(e) =>
              setForm((f) => ({
                ...f,
                durationMinutes: e.target.value === '' ? undefined : Number(e.target.value),
              }))
            }
            className={fieldClass}
            placeholder="e.g. 15"
          />
        </FormField>
      </form>
    </Modal>
  )
}
