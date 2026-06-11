'use client'

import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import Link from 'next/link'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  GripVertical,
  Plus,
  Pencil,
  Trash2,
  FileText,
  Video,
  HelpCircle,
  ImageIcon,
  Save,
  Eye,
  Sparkles,
  Settings,
  BookOpen,
  BookOpenCheck,
  Layers,
  ListChecks,
  Clock,
} from 'lucide-react'
import { toast } from 'sonner'
import { AdminLayout } from '@/components/admin/AdminLayout'
import {
  newBlock,
  newQuestion,
  type AdminLearningBlock,
  type AdminQuestion,
  type AdminQuestionBlock,
  type AdminQuestionFormat,
  type AdminQuestionKind,
} from '@/lib/adminData'
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
  apiUpdateBlockQuestion,
  apiDeleteBlockQuestion,
  type CourseWithContent,
  type CourseModule,
  type Unit,
  type LearningBlock,
  type BlockQuestion,
} from '@/lib/api/lms'
import { cn } from '@/lib/utils'
import { Field, SimpleDialog, DialogStyles } from '@/components/admin/widgets/CourseDialog'
import { ConfirmDialog } from '@/components/admin/widgets/ConfirmDialog'
import { AssessmentSection } from '@/components/admin/lms/AssessmentSection'
import { RichTextEditor } from '@/components/admin/widgets/RichTextEditor'
import MediaPicker from '@/components/admin/MediaPicker'
import type { MediaFile } from '@/lib/api/media'

const SERVER_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:5000'

const BLOCK_ICON = { text: FileText, video: Video, question: HelpCircle, image: ImageIcon }
const BLOCK_LABEL = { text: 'Text', video: 'Video', question: 'Question', image: 'Image' }
const BLOCK_TONE = {
  text: 'bg-brand-primary/10 text-brand-primary',
  video: 'bg-brand-violet/15 text-brand-violet',
  question: 'bg-amber-500/15 text-amber-700',
  image: 'bg-teal-500/15 text-teal-700',
}

export default function AdminCourseBuilder({ id }: { id: string }) {
  const [course, setCourse] = useState<CourseWithContent | null>(null)
  const [loading, setLoading] = useState(true)
  const [openModules, setOpenModules] = useState<Record<string, boolean>>({})
  const [openUnits, setOpenUnits] = useState<Record<string, boolean>>({})
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

  useEffect(() => {
    fetchCourse(id)
      .then((data) => {
        setCourse(data)
        const open: Record<string, boolean> = {}
        data.modules.forEach((m) => {
          open[m.id] = true
        })
        setOpenModules(open)
      })
      .catch(() => toast.error('Failed to load course'))
      .finally(() => setLoading(false))
  }, [id])

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))

  if (loading)
    return (
      <AdminLayout>
        <div className="flex items-center justify-center h-64 text-brand-text-muted">Loading…</div>
      </AdminLayout>
    )
  if (!course)
    return (
      <AdminLayout>
        <div className="flex items-center justify-center h-64 text-brand-text-muted">Course not found.</div>
      </AdminLayout>
    )

  const totalUnits = (course.modules ?? []).reduce((s, m) => s + m.units.length, 0)
  const totalBlocks = (course.modules ?? []).reduce(
    (s, m) => s + m.units.reduce((s2, u) => s2 + u.blocks.length, 0),
    0,
  )

  function updateCourse(patch: Partial<CourseWithContent>) {
    setCourse((c) => (c ? { ...c, ...patch } : c))
  }

  async function saveCourseSettings() {
    if (!course) return
    try {
      await apiUpdateCourse(course.id, {
        title: course.title,
        description: course.description,
        cover: course.cover,
        difficulty: course.difficulty,
        pointsPerUnit: course.pointsPerUnit,
        enableCertificate: course.enableCertificate,
      })
      toast.success('Settings saved')
    } catch {
      toast.error('Failed to save settings')
    }
  }

  async function togglePublish() {
    if (!course) return
    const next = course.status === 'published' ? 'draft' : 'published'
    try {
      await apiUpdateCourse(course.id, { status: next })
      setCourse((c) => (c ? { ...c, status: next } : c))
      toast.success(next === 'published' ? 'Course published' : 'Course unpublished')
    } catch {
      toast.error('Failed to update status')
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
    apiReorderModules(course.id, reorderedIds).catch(() => {
      setCourse((c) => (c ? { ...c, modules: prev } : c))
      toast.error('Failed to save order')
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
      c
        ? { ...c, modules: c.modules.map((m) => (m.id !== moduleId ? m : { ...m, units: reordered })) }
        : c,
    )
    apiReorderUnits(moduleId, reorderedIds).catch(() => {
      setCourse((c) =>
        c
          ? { ...c, modules: c.modules.map((m) => (m.id !== moduleId ? m : { ...m, units: prevUnits })) }
          : c,
      )
      toast.error('Failed to save order')
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
    setCourse((c) =>
      c
        ? {
            ...c,
            modules: c.modules.map((m) =>
              m.id !== moduleId
                ? m
                : {
                    ...m,
                    units: m.units.map((u) =>
                      u.id !== unitId ? u : { ...u, blocks: reordered },
                    ),
                  },
            ),
          }
        : c,
    )
    apiReorderBlocks(unitId, reorderedIds).catch(() => {
      setCourse((c) =>
        c
          ? {
              ...c,
              modules: c.modules.map((m) =>
                m.id !== moduleId
                  ? m
                  : {
                      ...m,
                      units: m.units.map((u) =>
                        u.id !== unitId ? u : { ...u, blocks: prevBlocks },
                      ),
                    },
              ),
            }
          : c,
      )
      toast.error('Failed to save order')
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
          c
            ? {
                ...c,
                modules: c.modules.map((m) =>
                  m.id === editingModule.id ? { ...m, ...updated } : m,
                ),
              }
            : c,
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
    } catch {
      toast.error('Failed to save module')
    }
  }

  async function deleteModule(modId: string) {
    try {
      await apiDeleteModule(modId)
      setCourse((c) => (c ? { ...c, modules: c.modules.filter((m) => m.id !== modId) } : c))
      toast.success('Module removed')
    } catch {
      toast.error('Failed to delete module')
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
        setCourse((c) =>
          c
            ? {
                ...c,
                modules: c.modules.map((m) =>
                  m.id !== unitCtx.moduleId
                    ? m
                    : {
                        ...m,
                        units: m.units.map((u) =>
                          u.id === unitCtx.unit!.id ? { ...u, ...updated } : u,
                        ),
                      },
                ),
              }
            : c,
        )
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
                  m.id !== unitCtx.moduleId ? m : { ...m, units: [...m.units, fresh] },
                ),
              }
            : c,
        )
        setOpenUnits((o) => ({ ...o, [fresh.id]: true }))
        toast.success('Unit added')
      }
      setUnitCtx(null)
    } catch {
      toast.error('Failed to save unit')
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
      toast.success('Unit removed')
    } catch {
      toast.error('Failed to delete unit')
    }
  }

  async function saveBlock(data: LearningBlock) {
    if (!blockCtx || !course) return
    try {
      const { id: _id, unitId: _uid, order: _ord, questions: _qs, ...blockData } = data
      if (blockCtx.block) {
        const updated = await apiUpdateBlock(blockCtx.block.id, blockData)
        setCourse((c) =>
          c
            ? {
                ...c,
                modules: c.modules.map((m) =>
                  m.id !== blockCtx.moduleId
                    ? m
                    : {
                        ...m,
                        units: m.units.map((u) =>
                          u.id !== blockCtx.unitId
                            ? u
                            : {
                                ...u,
                                blocks: u.blocks.map((b) =>
                                  b.id === blockCtx.block!.id
                                    ? { ...updated, questions: data.questions }
                                    : b,
                                ),
                              },
                        ),
                      },
                ),
              }
            : c,
        )
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
        const newBlock = { ...fresh, questions: createdQs }
        setCourse((c) =>
          c
            ? {
                ...c,
                modules: c.modules.map((m) =>
                  m.id !== blockCtx.moduleId
                    ? m
                    : {
                        ...m,
                        units: m.units.map((u) =>
                          u.id !== blockCtx.unitId
                            ? u
                            : { ...u, blocks: [...u.blocks, newBlock] },
                        ),
                      },
                ),
              }
            : c,
        )
        toast.success('Block added')
      }
      setBlockCtx(null)
    } catch {
      toast.error('Failed to save block')
    }
  }

  async function deleteBlock(moduleId: string, unitId: string, blockId: string) {
    try {
      await apiDeleteBlock(blockId)
      setCourse((c) =>
        c
          ? {
              ...c,
              modules: c.modules.map((m) =>
                m.id !== moduleId
                  ? m
                  : {
                      ...m,
                      units: m.units.map((u) =>
                        u.id !== unitId
                          ? u
                          : { ...u, blocks: u.blocks.filter((b) => b.id !== blockId) },
                      ),
                    },
              ),
            }
          : c,
      )
      toast.success('Block removed')
    } catch {
      toast.error('Failed to delete block')
    }
  }

  return (
    <AdminLayout>
      <div className="mb-6">
        <Link
          href="/admin/courses"
          className="inline-flex items-center gap-1.5 text-xs font-bold text-brand-primary hover:gap-2 transition-all"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          All courses
        </Link>
      </div>

      {/* Header */}
      <motion.header
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl bg-white border border-brand-surface-2 p-5 mb-6 flex flex-col lg:flex-row lg:items-center gap-4"
      >
        {course.cover ? (
          <img
            src={course.cover}
            alt=""
            className="w-full lg:w-32 h-32 lg:h-20 object-cover rounded-xl flex-shrink-0"
          />
        ) : (
          <div className="w-full lg:w-32 h-32 lg:h-20 rounded-xl bg-gradient-to-br from-brand-primary via-brand-primary-dark to-brand-violet flex items-center justify-center flex-shrink-0">
            <BookOpenCheck className="w-10 h-10 text-white/70" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1.5">
            <span
              className={cn(
                'inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider',
                course.status === 'published'
                  ? 'bg-emerald-500/15 text-emerald-700'
                  : 'bg-amber-500/15 text-amber-700',
              )}
            >
              {course.status}
            </span>
            <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-brand-violet/10 text-brand-violet text-[10px] font-bold uppercase tracking-wider">
              {course.difficulty}
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-brand-text-primary">{course.title}</h1>
          <p className="text-sm text-brand-text-muted mt-1 line-clamp-2">
            {course.description || 'No description yet.'}
          </p>
        </div>
        <button
          onClick={togglePublish}
          className={cn(
            'inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-colors shadow-lg flex-shrink-0',
            course.status === 'published'
              ? 'bg-brand-surface text-brand-text-primary hover:bg-brand-surface-2'
              : 'bg-brand-primary text-white hover:bg-brand-primary-dark',
          )}
        >
          {course.status === 'published' ? <Eye className="w-4 h-4" /> : <Sparkles className="w-4 h-4" />}
          {course.status === 'published' ? 'Unpublish' : 'Publish'}
        </button>
      </motion.header>

      <div className="grid grid-cols-12 gap-4 lg:gap-6">
        {/* Modules section */}
        <div className="col-span-12 lg:col-span-8 space-y-4">
          {/* Pre-test */}
          <AssessmentSection
            courseId={course.id}
            type="pre"
            assessment={course.preAssessment}
            onCreated={a => setCourse(c => c ? { ...c, preAssessment: a } : c)}
            onUpdated={a => setCourse(c => c ? { ...c, preAssessment: a } : c)}
            onDeleted={() => setCourse(c => c ? { ...c, preAssessment: null } : c)}
          />
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-brand-text-muted">
                Curriculum
              </p>
              <h2 className="text-xl font-black text-brand-text-primary">Modules & content</h2>
            </div>
            <button
              onClick={() => setCreatingModule(true)}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-brand-primary text-white text-sm font-bold hover:bg-brand-primary-dark transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add module
            </button>
          </div>

          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={reorderModules}>
            <SortableContext
              items={course.modules.map((m) => m.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-3">
                {course.modules.map((mod, i) => (
                  <SortableModule
                    key={mod.id}
                    module={mod}
                    index={i}
                    open={!!openModules[mod.id]}
                    onToggle={() => setOpenModules((o) => ({ ...o, [mod.id]: !o[mod.id] }))}
                    onEdit={() => setEditingModule(mod)}
                    onDelete={() => setConfirmDeleteModuleId(mod.id)}
                    onAddUnit={() => setUnitCtx({ moduleId: mod.id, unit: null })}
                    onEditUnit={(u) => setUnitCtx({ moduleId: mod.id, unit: u })}
                    onDeleteUnit={(uid) => setConfirmDeleteUnit({ moduleId: mod.id, unitId: uid })}
                    openUnits={openUnits}
                    onToggleUnit={(uid) => setOpenUnits((o) => ({ ...o, [uid]: !o[uid] }))}
                    onUnitsReorder={(e) => reorderUnits(mod.id, e)}
                    onAddBlock={(uid) => setBlockCtx({ moduleId: mod.id, unitId: uid, block: null })}
                    onEditBlock={(uid, b) =>
                      setBlockCtx({ moduleId: mod.id, unitId: uid, block: b })
                    }
                    onDeleteBlock={(uid, bid) => setConfirmDeleteBlock({ moduleId: mod.id, unitId: uid, blockId: bid })}
                    onBlocksReorder={(uid, e) => reorderBlocks(mod.id, uid, e)}
                    sensors={sensors}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>

          {course.modules.length === 0 && (
            <div className="rounded-2xl border-2 border-dashed border-brand-surface-2 bg-white p-10 text-center">
              <p className="text-sm text-brand-text-muted">
                No modules yet — add one to get started.
              </p>
            </div>
          )}

          {/* Post-test */}
          <div className="mt-4">
            <AssessmentSection
              courseId={course.id}
              type="post"
              assessment={course.postAssessment}
              onCreated={a => setCourse(c => c ? { ...c, postAssessment: a } : c)}
              onUpdated={a => setCourse(c => c ? { ...c, postAssessment: a } : c)}
              onDeleted={() => setCourse(c => c ? { ...c, postAssessment: null } : c)}
            />
          </div>
        </div>

        {/* Settings rail */}
        <aside className="col-span-12 lg:col-span-4 space-y-4">
          <SettingsPanel
            course={course}
            onChange={updateCourse}
            onSave={saveCourseSettings}
            onPublish={togglePublish}
          />

          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="rounded-2xl border border-brand-surface-2 bg-white p-5"
          >
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-brand-text-muted">
              Statistics
            </p>
            <div className="mt-3 grid grid-cols-3 gap-2">
              <Stat icon={<Layers className="w-3.5 h-3.5" />} label="Modules" value={course.modules.length} />
              <Stat icon={<BookOpen className="w-3.5 h-3.5" />} label="Units" value={totalUnits} />
              <Stat icon={<ListChecks className="w-3.5 h-3.5" />} label="Blocks" value={totalBlocks} />
            </div>
          </motion.div>
        </aside>
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

      <UnitDialog
        open={!!unitCtx}
        initial={unitCtx?.unit ?? undefined}
        onClose={() => setUnitCtx(null)}
        onSave={saveUnit}
      />

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
        onConfirm={() => { if (confirmDeleteModuleId) deleteModule(confirmDeleteModuleId); setConfirmDeleteModuleId(null) }}
        onCancel={() => setConfirmDeleteModuleId(null)}
      />
      <ConfirmDialog
        open={!!confirmDeleteUnit}
        title="Delete unit"
        message="This will permanently delete this unit and all its learning blocks. This cannot be undone."
        confirmLabel="Delete unit"
        onConfirm={() => { if (confirmDeleteUnit) deleteUnit(confirmDeleteUnit.moduleId, confirmDeleteUnit.unitId); setConfirmDeleteUnit(null) }}
        onCancel={() => setConfirmDeleteUnit(null)}
      />
      <ConfirmDialog
        open={!!confirmDeleteBlock}
        title="Delete block"
        message="This will permanently delete this learning block and its content. This cannot be undone."
        confirmLabel="Delete block"
        onConfirm={() => { if (confirmDeleteBlock) deleteBlock(confirmDeleteBlock.moduleId, confirmDeleteBlock.unitId, confirmDeleteBlock.blockId); setConfirmDeleteBlock(null) }}
        onCancel={() => setConfirmDeleteBlock(null)}
      />
    </AdminLayout>
  )
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="rounded-xl bg-brand-surface p-3 text-center">
      <div className="mx-auto w-7 h-7 rounded-lg bg-white text-brand-primary flex items-center justify-center mb-1">
        {icon}
      </div>
      <p className="text-lg font-black text-brand-text-primary">{value}</p>
      <p className="text-[9px] font-bold uppercase tracking-wider text-brand-text-muted">{label}</p>
    </div>
  )
}

function SettingsPanel({
  course,
  onChange,
  onSave,
  onPublish,
}: {
  course: CourseWithContent
  onChange: (patch: Partial<CourseWithContent>) => void
  onSave: () => void
  onPublish: () => void
}) {
  const [coverPickerOpen, setCoverPickerOpen] = useState(false)

  function handleBlur(e: React.FocusEvent<HTMLDivElement>) {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
      onSave()
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-brand-surface-2 bg-white p-5"
      onBlur={handleBlur}
    >
      <div className="flex items-center gap-2 mb-3">
        <div className="w-8 h-8 rounded-xl bg-brand-primary/10 text-brand-primary flex items-center justify-center">
          <Settings className="w-4 h-4" />
        </div>
        <div>
          <p className="font-bold text-brand-text-primary">Course settings</p>
          <p className="text-[11px] text-brand-text-muted">Changes save automatically.</p>
        </div>
      </div>

      <div className="space-y-3">
        <Field label="Title">
          <input
            value={course.title}
            onChange={(e) => onChange({ title: e.target.value })}
            className="admin-input"
          />
        </Field>
        <Field label="Description">
          <textarea
            value={course.description ?? ''}
            onChange={(e) => onChange({ description: e.target.value })}
            rows={3}
            className="admin-input resize-none"
          />
        </Field>
        <Field label="Cover image URL">
          <div className="flex gap-2">
            <input
              value={course.cover ?? ''}
              onChange={(e) => onChange({ cover: e.target.value })}
              className="admin-input flex-1"
              placeholder="Paste image URL or browse library"
            />
            <button
              type="button"
              onClick={() => setCoverPickerOpen(true)}
              className="shrink-0 px-3 rounded-xl border border-brand-surface-2 bg-brand-surface text-xs font-semibold text-brand-text-muted hover:text-brand-primary hover:border-brand-primary/40 transition-colors"
              title="Browse media library"
            >
              Browse
            </button>
          </div>
          <MediaPicker
            open={coverPickerOpen}
            onClose={() => setCoverPickerOpen(false)}
            accept="image"
            onSelect={(file: MediaFile) => {
              onChange({ cover: `${SERVER_URL}/${file.path}` })
              setCoverPickerOpen(false)
            }}
          />
        </Field>
        <Field label="Difficulty">
          <select
            value={course.difficulty}
            onChange={(e) =>
              onChange({ difficulty: e.target.value as CourseWithContent['difficulty'] })
            }
            className="admin-input"
          >
            <option>Beginner</option>
            <option>Intermediate</option>
            <option>Advanced</option>
          </select>
        </Field>
        <Field label="Points awarded per unit">
          <input
            type="number"
            min={0}
            value={course.pointsPerUnit}
            onChange={(e) => onChange({ pointsPerUnit: Number(e.target.value) })}
            className="admin-input"
          />
          <p className="mt-1 text-[11px] text-brand-text-muted">
            Awarded automatically when a member completes a unit.
          </p>
        </Field>
        <label className="flex items-center justify-between gap-3 rounded-xl border border-brand-surface-2 px-3 py-2.5 cursor-pointer">
          <span className="text-sm font-semibold text-brand-text-primary">Enable certificate</span>
          <input
            type="checkbox"
            checked={course.enableCertificate}
            onChange={(e) => onChange({ enableCertificate: e.target.checked })}
            className="w-4 h-4 accent-brand-primary"
          />
        </label>
        <button
          type="button"
          onClick={onPublish}
          className={cn(
            'w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-colors shadow-md',
            course.status === 'published'
              ? 'bg-brand-surface text-brand-text-primary hover:bg-brand-surface-2'
              : 'bg-brand-primary text-white hover:bg-brand-primary-dark',
          )}
        >
          <Save className="w-4 h-4" />
          {course.status === 'published' ? 'Unpublish' : 'Publish course'}
        </button>
      </div>
      <DialogStyles />
    </motion.div>
  )
}

function SortableModule(props: {
  module: CourseModule
  index: number
  open: boolean
  onToggle: () => void
  onEdit: () => void
  onDelete: () => void
  onAddUnit: () => void
  onEditUnit: (u: Unit) => void
  onDeleteUnit: (id: string) => void
  openUnits: Record<string, boolean>
  onToggleUnit: (id: string) => void
  onUnitsReorder: (e: DragEndEvent) => void
  onAddBlock: (unitId: string) => void
  onEditBlock: (unitId: string, b: LearningBlock) => void
  onDeleteBlock: (unitId: string, blockId: string) => void
  onBlocksReorder: (unitId: string, e: DragEndEvent) => void
  sensors: ReturnType<typeof useSensors>
}) {
  const { module: mod, open, onToggle, onEdit, onDelete, onAddUnit, sensors } = props
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: mod.id,
  })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  }

  return (
    <motion.div
      ref={setNodeRef}
      style={style}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: props.index * 0.04 }}
      className="rounded-2xl border border-brand-surface-2 bg-white overflow-hidden hover:border-brand-primary/30 transition-colors"
    >
      <div className="flex items-center gap-2 px-4 py-3 bg-brand-surface/50">
        <button
          {...attributes}
          {...listeners}
          className="text-brand-text-muted hover:text-brand-primary cursor-grab active:cursor-grabbing p-1"
          aria-label="Drag module"
        >
          <GripVertical className="w-4 h-4" />
        </button>
        <button onClick={onToggle} className="flex items-center gap-2 flex-1 min-w-0 text-left">
          {open ? (
            <ChevronDown className="w-4 h-4 text-brand-text-muted" />
          ) : (
            <ChevronRight className="w-4 h-4 text-brand-text-muted" />
          )}
          <div className="min-w-0">
            <p className="font-bold text-brand-text-primary truncate">{mod.title}</p>
            <p className="text-[11px] text-brand-text-muted">
              {mod.units.length} {mod.units.length === 1 ? 'unit' : 'units'}
            </p>
          </div>
        </button>
        <button
          onClick={onEdit}
          className="w-7 h-7 rounded-lg flex items-center justify-center text-brand-text-muted hover:bg-brand-primary hover:text-white transition-colors"
        >
          <Pencil className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={onDelete}
          className="w-7 h-7 rounded-lg flex items-center justify-center text-brand-text-muted hover:bg-rose-500 hover:text-white transition-colors"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden"
          >
            <div className="p-4 space-y-2">
              <button
                onClick={onAddUnit}
                className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-xl border border-dashed border-brand-surface-2 text-xs font-bold text-brand-primary hover:border-brand-primary/40 hover:bg-brand-primary/5 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                Add unit
              </button>
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={props.onUnitsReorder}
              >
                <SortableContext
                  items={mod.units.map((u) => u.id)}
                  strategy={verticalListSortingStrategy}
                >
                  {mod.units.map((u) => (
                    <SortableUnit
                      key={u.id}
                      unit={u}
                      open={!!props.openUnits[u.id]}
                      onToggle={() => props.onToggleUnit(u.id)}
                      onEdit={() => props.onEditUnit(u)}
                      onDelete={() => props.onDeleteUnit(u.id)}
                      onAddBlock={() => props.onAddBlock(u.id)}
                      onEditBlock={(b) => props.onEditBlock(u.id, b)}
                      onDeleteBlock={(bid) => props.onDeleteBlock(u.id, bid)}
                      onBlocksReorder={(e) => props.onBlocksReorder(u.id, e)}
                      sensors={sensors}
                    />
                  ))}
                </SortableContext>
              </DndContext>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

function SortableUnit(props: {
  unit: Unit
  open: boolean
  onToggle: () => void
  onEdit: () => void
  onDelete: () => void
  onAddBlock: () => void
  onEditBlock: (b: LearningBlock) => void
  onDeleteBlock: (id: string) => void
  onBlocksReorder: (e: DragEndEvent) => void
  sensors: ReturnType<typeof useSensors>
}) {
  const { unit, open, onToggle, onEdit, onDelete, onAddBlock, sensors } = props
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: unit.id,
  })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  // Determine prevailing block type for badge
  const types = unit.blocks.map((b) => b.type)
  const dominantType = types[0] ?? 'text'
  const Icon = BLOCK_ICON[dominantType]

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="rounded-xl border border-brand-surface-2 bg-brand-surface/40 overflow-hidden"
    >
      <div className="flex items-center gap-2 px-3 py-2">
        <button
          {...attributes}
          {...listeners}
          className="text-brand-text-muted hover:text-brand-primary cursor-grab active:cursor-grabbing p-0.5"
          aria-label="Drag unit"
        >
          <GripVertical className="w-3.5 h-3.5" />
        </button>
        <button onClick={onToggle} className="flex items-center gap-2 flex-1 min-w-0 text-left">
          {open ? (
            <ChevronDown className="w-3.5 h-3.5 text-brand-text-muted" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5 text-brand-text-muted" />
          )}
          <span
            className={cn(
              'inline-flex items-center justify-center w-6 h-6 rounded-md',
              BLOCK_TONE[dominantType],
            )}
          >
            <Icon className="w-3 h-3" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-bold text-brand-text-primary truncate">{unit.title}</p>
            <p className="text-[10px] text-brand-text-muted inline-flex items-center gap-2">
              <span>
                {unit.blocks.length} {unit.blocks.length === 1 ? 'block' : 'blocks'}
              </span>
              {unit.durationMinutes ? (
                <span className="inline-flex items-center gap-0.5">
                  <Clock className="w-2.5 h-2.5" />
                  {unit.durationMinutes} min
                </span>
              ) : null}
            </p>
          </div>
        </button>
        <button
          onClick={onEdit}
          className="w-6 h-6 rounded-md flex items-center justify-center text-brand-text-muted hover:bg-brand-primary hover:text-white transition-colors"
        >
          <Pencil className="w-3 h-3" />
        </button>
        <button
          onClick={onDelete}
          className="w-6 h-6 rounded-md flex items-center justify-center text-brand-text-muted hover:bg-rose-500 hover:text-white transition-colors"
        >
          <Trash2 className="w-3 h-3" />
        </button>
      </div>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-3 space-y-1.5">
              <button
                onClick={onAddBlock}
                className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg border border-dashed border-brand-surface-2 text-[11px] font-bold text-brand-primary hover:border-brand-primary/40 hover:bg-brand-primary/5 transition-colors"
              >
                <Plus className="w-3 h-3" />
                Add learning block
              </button>
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={props.onBlocksReorder}
              >
                <SortableContext
                  items={unit.blocks.map((b) => b.id)}
                  strategy={verticalListSortingStrategy}
                >
                  {unit.blocks.map((b) => (
                    <SortableBlock
                      key={b.id}
                      block={b}
                      onEdit={() => props.onEditBlock(b)}
                      onDelete={() => props.onDeleteBlock(b.id)}
                    />
                  ))}
                </SortableContext>
              </DndContext>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function SortableBlock({
  block,
  onEdit,
  onDelete,
}: {
  block: LearningBlock
  onEdit: () => void
  onDelete: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: block.id,
  })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }
  const Icon = BLOCK_ICON[block.type]
  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-2 rounded-lg border border-brand-surface-2 bg-white px-2.5 py-1.5"
    >
      <button
        {...attributes}
        {...listeners}
        className="text-brand-text-muted hover:text-brand-primary cursor-grab active:cursor-grabbing p-0.5"
        aria-label="Drag block"
      >
        <GripVertical className="w-3 h-3" />
      </button>
      <span className="text-xs font-medium text-brand-text-primary truncate flex-1">
        {block.title}
      </span>
      <span
        className={cn(
          'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider',
          BLOCK_TONE[block.type],
        )}
      >
        <Icon className="w-2.5 h-2.5" />
        {BLOCK_LABEL[block.type]}
      </span>
      <button
        onClick={onEdit}
        className="w-5 h-5 rounded flex items-center justify-center text-brand-text-muted hover:bg-brand-primary hover:text-white transition-colors"
      >
        <Pencil className="w-2.5 h-2.5" />
      </button>
      <button
        onClick={onDelete}
        className="w-5 h-5 rounded flex items-center justify-center text-brand-text-muted hover:bg-rose-500 hover:text-white transition-colors"
      >
        <Trash2 className="w-2.5 h-2.5" />
      </button>
    </div>
  )
}

// ─── Dialogs ─────────────────────────────────────────────────────────────
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
  const [form, setForm] = useState<Partial<CourseModule>>(initial ?? {})
  useEffect(() => {
    if (open) setForm(initial ?? {})
  }, [open, initial])

  return (
    <SimpleDialog open={open} title={initial?.id ? 'Edit module' : 'New module'} onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          onSave(form)
        }}
        className="space-y-4"
      >
        <Field label="Title">
          <input
            value={form.title ?? ''}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            className="admin-input"
            required
          />
        </Field>
        <Field label="Description">
          <textarea
            value={form.description ?? ''}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            rows={3}
            className="admin-input resize-none"
          />
        </Field>
        <DialogActions onCancel={onClose} />
      </form>
    </SimpleDialog>
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
  const isEdit = !!initial?.id
  const [form, setForm] = useState<Partial<Unit>>(initial ?? {})

  useEffect(() => {
    if (open) {
      setForm(initial ?? {})
    }
  }, [open, initial])

  return (
    <SimpleDialog open={open} title={isEdit ? 'Edit unit' : 'New unit'} onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          onSave(form)
        }}
        className="space-y-4"
      >
        <Field label="Title">
          <input
            value={form.title ?? ''}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            className="admin-input"
            required
          />
        </Field>
        <Field label="Description">
          <textarea
            value={form.description ?? ''}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            rows={3}
            className="admin-input resize-none"
          />
        </Field>
        <Field label="Duration (minutes, optional)">
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
            className="admin-input"
            placeholder="e.g. 15"
          />
        </Field>

        <DialogActions onCancel={onClose} />
      </form>
    </SimpleDialog>
  )
}

function adminBlockToLearningBlock(a: AdminLearningBlock): LearningBlock {
  const base = {
    id: a.id,
    unitId: '',
    title: a.title,
    order: 0,
    body: null,
    videoUrl: null,
    transcript: null,
    imageUrl: null,
    questions: [] as BlockQuestion[],
  }
  if (a.type === 'text') {
    return { ...base, type: 'text', body: a.body }
  }
  if (a.type === 'video') {
    return { ...base, type: 'video', videoUrl: a.videoUrl, transcript: a.transcript ?? null }
  }
  if (a.type === 'image') {
    return { ...base, type: 'image', imageUrl: a.imageUrl }
  }
  // question
  return {
    ...base,
    type: 'question',
    questions: (a.questions ?? []).map((q) => ({
      id: q.id,
      blockId: '',
      kind: q.kind,
      format: q.format,
      prompt: q.prompt,
      options: q.options ?? null,
      correctIndex: q.correctIndex ?? null,
      correctBool: q.correctBool ?? null,
      placeholder: q.placeholder ?? null,
      order: 0,
    })),
  }
}

function learningBlockToAdminBlock(b: LearningBlock): AdminLearningBlock {
  if (b.type === 'text') {
    return { id: b.id, title: b.title, type: 'text', body: b.body ?? '' }
  }
  if (b.type === 'video') {
    return {
      id: b.id,
      title: b.title,
      type: 'video',
      videoUrl: b.videoUrl ?? '',
      transcript: b.transcript ?? '',
    }
  }
  if (b.type === 'image') {
    return { id: b.id, title: b.title, type: 'image', imageUrl: b.imageUrl ?? '' }
  }
  // question
  return {
    id: b.id,
    title: b.title,
    type: 'question',
    questions: b.questions.map((q) => ({
      id: q.id,
      kind: q.kind,
      format: q.format,
      prompt: q.prompt,
      options: q.options ?? undefined,
      correctIndex: q.correctIndex ?? undefined,
      correctBool: q.correctBool ?? undefined,
      placeholder: q.placeholder ?? undefined,
    })),
  }
}

function BlockDialog({
  open,
  initial,
  blockId,
  onClose,
  onSave,
}: {
  open: boolean
  initial?: LearningBlock
  blockId?: string
  onClose: () => void
  onSave: (b: LearningBlock) => void
}) {
  const initialAdmin = initial ? learningBlockToAdminBlock(initial) : undefined
  const [form, setForm] = useState<AdminLearningBlock>(initialAdmin ?? newBlock('text'))
  const [mediaPickerTarget, setMediaPickerTarget] = useState<null | 'videoUrl' | 'imageUrl'>(null)

  useEffect(() => {
    if (open) {
      setForm(initial ? learningBlockToAdminBlock(initial) : newBlock('text'))
    }
  }, [open, initial])

  function setType(t: 'text' | 'video' | 'image' | 'question') {
    if (t === form.type) return
    const fresh = newBlock(t, form.title)
    setForm(fresh)
  }

  function patch<K extends keyof AdminLearningBlock>(k: K, v: AdminLearningBlock[K]) {
    setForm((f) => ({ ...f, [k]: v }) as AdminLearningBlock)
  }

  return (
    <SimpleDialog
      open={open}
      title={initial ? 'Edit learning block' : 'New learning block'}
      onClose={onClose}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault()
          onSave(adminBlockToLearningBlock(form))
        }}
        className="space-y-4"
      >
        <Field label="Block type">
          <div className="grid grid-cols-4 gap-2">
            {(['text', 'video', 'image', 'question'] as const).map((t) => {
              const Icon = BLOCK_ICON[t]
              const active = form.type === t
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => setType(t)}
                  className={cn(
                    'inline-flex flex-col items-center gap-1.5 px-3 py-3 rounded-xl border-2 text-xs font-bold transition-all',
                    active
                      ? 'border-brand-primary bg-brand-primary/5 text-brand-primary'
                      : 'border-brand-surface-2 text-brand-text-muted hover:border-brand-primary/40',
                  )}
                >
                  <Icon className="w-4 h-4" />
                  {BLOCK_LABEL[t]}
                </button>
              )
            })}
          </div>
        </Field>

        <Field label={form.type === 'question' ? 'Title (optional)' : 'Title'}>
          <input
            value={form.title}
            onChange={(e) => patch('title', e.target.value)}
            className="admin-input"
            required={form.type !== 'question'}
          />
        </Field>

        {form.type === 'text' && (
          <Field label="Body" asDiv>
            <RichTextEditor
              value={(form as AdminLearningBlock & { body: string }).body}
              onChange={(html) => setForm({ ...form, body: html } as AdminLearningBlock)}
              placeholder="Write your lesson content here…"
            />
          </Field>
        )}

        {form.type === 'video' && (
          <>
            <Field label="Video URL">
              <div className="flex gap-2">
                <input
                  value={(form as AdminLearningBlock & { videoUrl: string }).videoUrl}
                  onChange={(e) =>
                    setForm({ ...form, videoUrl: e.target.value } as AdminLearningBlock)
                  }
                  className="admin-input flex-1"
                  placeholder="https://…/video.mp4 or browse library"
                />
                <button
                  type="button"
                  onClick={() => setMediaPickerTarget('videoUrl')}
                  className="shrink-0 px-3 rounded-xl border border-brand-surface-2 bg-brand-surface text-xs font-semibold text-brand-text-muted hover:text-brand-primary hover:border-brand-primary/40 transition-colors"
                  title="Browse media library"
                >
                  Browse
                </button>
              </div>
            </Field>
            <Field label="Video transcript (optional)" asDiv>
              <RichTextEditor
                value={(form as AdminLearningBlock & { transcript?: string }).transcript ?? ''}
                onChange={(html) =>
                  setForm({ ...form, transcript: html } as AdminLearningBlock)
                }
                placeholder="Paste or write the video transcript here…"
              />
            </Field>
          </>
        )}

        {form.type === 'image' && (
          <Field label="Image URL">
            <div className="flex gap-2">
              <input
                value={(form as AdminLearningBlock & { imageUrl: string }).imageUrl ?? ''}
                onChange={(e) =>
                  setForm({ ...form, imageUrl: e.target.value } as AdminLearningBlock)
                }
                className="admin-input flex-1"
                placeholder="https://…/image.jpg or browse library"
              />
              <button
                type="button"
                onClick={() => setMediaPickerTarget('imageUrl')}
                className="shrink-0 px-3 rounded-xl border border-brand-surface-2 bg-brand-surface text-xs font-semibold text-brand-text-muted hover:text-brand-primary hover:border-brand-primary/40 transition-colors"
                title="Browse media library"
              >
                Browse
              </button>
            </div>
          </Field>
        )}

        {form.type === 'question' && (
          <QuestionsList
            value={form as AdminLearningBlock & AdminQuestionBlock}
            onChange={(qs) => setForm({ ...form, questions: qs } as AdminLearningBlock)}
            blockId={blockId}
          />
        )}

        <DialogActions onCancel={onClose} />
      </form>
      <MediaPicker
        open={mediaPickerTarget !== null}
        onClose={() => setMediaPickerTarget(null)}
        accept={mediaPickerTarget === 'videoUrl' ? 'video' : 'image'}
        onSelect={(file: MediaFile) => {
          const url = `${SERVER_URL}/${file.path}`
          if (mediaPickerTarget === 'videoUrl') {
            setForm({ ...form, videoUrl: url } as AdminLearningBlock)
          } else if (mediaPickerTarget === 'imageUrl') {
            setForm({ ...form, imageUrl: url } as AdminLearningBlock)
          }
          setMediaPickerTarget(null)
        }}
      />
    </SimpleDialog>
  )
}

function QuestionsList({
  value,
  onChange,
  blockId,
}: {
  value: AdminQuestionBlock
  onChange: (qs: AdminQuestion[]) => void
  blockId?: string
}) {
  const [editing, setEditing] = useState<{ q: AdminQuestion; index: number | null } | null>(null)
  const [confirmDeleteIndex, setConfirmDeleteIndex] = useState<number | null>(null)

  const KIND_LABEL: Record<AdminQuestionKind, string> = {
    survey: 'Survey',
    'action-plan': 'Action Plan',
  }
  const FORMAT_LABEL: Record<AdminQuestionFormat, string> = {
    'multiple-choice': 'Multiple choice',
    'true-false': 'True / False',
    'short-text': 'Open ended',
  }

  function addQuestion() {
    setEditing({ q: newQuestion('survey'), index: null })
  }

  async function saveQuestion(q: AdminQuestion) {
    if (!editing) return
    if (blockId) {
      try {
        if (editing.index === null) {
          const created = await apiCreateBlockQuestion(blockId, {
            kind: q.kind,
            format: q.format,
            prompt: q.prompt,
            options: q.options ?? null,
            correctIndex: q.correctIndex ?? null,
            correctBool: q.correctBool ?? null,
            placeholder: q.placeholder ?? null,
          })
          onChange([...value.questions, { ...q, id: created.id }])
        } else {
          await apiUpdateBlockQuestion(q.id, {
            kind: q.kind,
            format: q.format,
            prompt: q.prompt,
            options: q.options ?? null,
            correctIndex: q.correctIndex ?? null,
            correctBool: q.correctBool ?? null,
            placeholder: q.placeholder ?? null,
          })
          onChange(value.questions.map((x, i) => (i === editing.index ? q : x)))
        }
      } catch {
        toast.error('Failed to save question')
      }
    } else {
      const list = [...value.questions]
      if (editing.index === null) list.push(q)
      else list[editing.index] = q
      onChange(list)
    }
    setEditing(null)
  }

  async function removeQuestion(i: number) {
    const q = value.questions[i]
    if (blockId && q.id) {
      try {
        await apiDeleteBlockQuestion(q.id)
      } catch {
        toast.error('Failed to delete question')
        setConfirmDeleteIndex(null)
        return
      }
    }
    onChange(value.questions.filter((_, idx) => idx !== i))
    setConfirmDeleteIndex(null)
  }

  return (
    <div className="space-y-2 rounded-xl border border-brand-surface-2 bg-brand-surface/40 p-3">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-brand-text-muted">
          Questions ({value.questions.length})
        </p>
        <button
          type="button"
          onClick={addQuestion}
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-brand-primary text-white text-[11px] font-bold hover:bg-brand-primary-dark transition-colors"
        >
          <Plus className="w-3 h-3" />
          Add question
        </button>
      </div>

      {value.questions.length === 0 && (
        <p className="text-[11px] text-brand-text-muted py-3 text-center">No questions yet.</p>
      )}

      <div className="space-y-1.5">
        {value.questions.map((q, i) => (
          <div
            key={q.id}
            className="flex items-center gap-2 rounded-lg border border-brand-surface-2 bg-white px-2.5 py-2"
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 mb-0.5">
                <span className="px-1.5 py-0.5 rounded bg-brand-primary/10 text-brand-primary text-[9px] font-bold uppercase tracking-wide">
                  {KIND_LABEL[q.kind]}
                </span>
                <span className="px-1.5 py-0.5 rounded bg-brand-surface-2 text-brand-text-muted text-[9px] font-bold uppercase tracking-wide">
                  {FORMAT_LABEL[q.format]}
                </span>
              </div>
              <p className="text-xs font-medium text-brand-text-primary truncate">
                {q.prompt || 'Untitled question'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setEditing({ q, index: i })}
              className="w-6 h-6 rounded flex items-center justify-center text-brand-text-muted hover:bg-brand-primary hover:text-white transition-colors"
            >
              <Pencil className="w-3 h-3" />
            </button>
            <button
              type="button"
              onClick={() => setConfirmDeleteIndex(i)}
              className="w-6 h-6 rounded flex items-center justify-center text-brand-text-muted hover:bg-rose-500 hover:text-white transition-colors"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
        ))}
      </div>

      <QuestionDialog
        open={!!editing}
        initial={editing?.q}
        onClose={() => setEditing(null)}
        onSave={saveQuestion}
      />
      <ConfirmDialog
        open={confirmDeleteIndex !== null}
        title="Delete question"
        message="This question will be permanently removed. This cannot be undone."
        confirmLabel="Delete"
        onConfirm={() => confirmDeleteIndex !== null && removeQuestion(confirmDeleteIndex)}
        onCancel={() => setConfirmDeleteIndex(null)}
      />
    </div>
  )
}

function QuestionDialog({
  open,
  initial,
  onClose,
  onSave,
}: {
  open: boolean
  initial?: AdminQuestion
  onClose: () => void
  onSave: (q: AdminQuestion) => void | Promise<void>
}) {
  const [q, setQ] = useState<AdminQuestion>(initial ?? newQuestion('survey'))
  useEffect(() => {
    if (open) setQ(initial ?? newQuestion('survey'))
  }, [open, initial])

  function patch<K extends keyof AdminQuestion>(k: K, v: AdminQuestion[K]) {
    setQ((prev) => ({ ...prev, [k]: v }))
  }

  return (
    <SimpleDialog open={open} title={initial ? 'Edit question' : 'New question'} onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          e.stopPropagation()
          onSave(q)
        }}
        className="space-y-4"
      >
        <div className="grid grid-cols-2 gap-3">
          <Field label="Kind">
            <select
              value={q.kind}
              onChange={(e) => patch('kind', e.target.value as AdminQuestionKind)}
              className="admin-input"
            >
              <option value="survey">Survey</option>
              <option value="action-plan">Action Plan</option>
            </select>
          </Field>
          <Field label="Answer format">
            <select
              value={q.format}
              onChange={(e) => {
                const newFormat = e.target.value as AdminQuestionFormat
                setQ((prev) => ({
                  ...prev,
                  format: newFormat,
                  ...(newFormat === 'multiple-choice' && prev.correctIndex == null ? { correctIndex: 0 } : {}),
                }))
              }}
              className="admin-input"
            >
              <option value="multiple-choice">Multiple choice</option>
              <option value="true-false">True / False</option>
              <option value="short-text">Open ended</option>
            </select>
          </Field>
        </div>

        <Field label="Question text">
          <textarea
            value={q.prompt}
            onChange={(e) => patch('prompt', e.target.value)}
            rows={2}
            className="admin-input resize-none"
            required
          />
        </Field>

        {q.format === 'multiple-choice' && (
          <Field label="Options (mark the correct one)">
            <div className="space-y-2">
              {(q.options ?? []).map((opt, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="q-correct-opt"
                    checked={q.correctIndex === i}
                    onChange={() => patch('correctIndex', i)}
                    className="w-4 h-4 accent-brand-primary"
                  />
                  <input
                    value={opt}
                    onChange={(e) => {
                      const next = [...(q.options ?? [])]
                      next[i] = e.target.value
                      patch('options', next)
                    }}
                    className="admin-input"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const next = (q.options ?? []).filter((_, idx) => idx !== i)
                      patch('options', next)
                    }}
                    className="w-7 h-7 rounded-lg flex items-center justify-center text-brand-text-muted hover:bg-rose-500 hover:text-white transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => patch('options', [...(q.options ?? []), 'New option'])}
                className="inline-flex items-center gap-1.5 text-xs font-bold text-brand-primary hover:gap-2 transition-all"
              >
                <Plus className="w-3 h-3" />
                Add option
              </button>
            </div>
          </Field>
        )}

        {q.format === 'true-false' && (
          <Field label="Correct answer">
            <div className="flex gap-2">
              {[true, false].map((v) => (
                <button
                  key={String(v)}
                  type="button"
                  onClick={() => patch('correctBool', v)}
                  className={cn(
                    'flex-1 px-3 py-2 rounded-xl border-2 text-sm font-bold transition-colors',
                    q.correctBool === v
                      ? 'border-brand-primary bg-brand-primary/5 text-brand-primary'
                      : 'border-brand-surface-2 text-brand-text-muted hover:border-brand-primary/40',
                  )}
                >
                  {v ? 'True' : 'False'}
                </button>
              ))}
            </div>
          </Field>
        )}

        {q.format === 'short-text' && (
          <Field label="Placeholder">
            <input
              value={q.placeholder ?? ''}
              onChange={(e) => patch('placeholder', e.target.value)}
              className="admin-input"
              placeholder="What members will see in the input"
            />
          </Field>
        )}

        <DialogActions onCancel={onClose} />
      </form>
    </SimpleDialog>
  )
}

function DialogActions({ onCancel }: { onCancel: () => void }) {
  return (
    <div className="flex justify-end gap-2 pt-2">
      <button
        type="button"
        onClick={onCancel}
        className="px-4 py-2 rounded-xl bg-brand-surface text-brand-text-primary text-sm font-semibold hover:bg-brand-surface-2 transition-colors"
      >
        Cancel
      </button>
      <button
        type="submit"
        className="px-5 py-2 rounded-xl bg-brand-primary text-white text-sm font-bold hover:bg-brand-primary-dark transition-colors shadow-lg"
      >
        Save
      </button>
    </div>
  )
}
