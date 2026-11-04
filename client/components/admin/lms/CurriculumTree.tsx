'use client'

import { DndContext, closestCenter, type DragEndEvent, type useSensors } from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { ChevronDown, ChevronRight, ClipboardCheck, FileCheck2, GripVertical, Pencil, Plus, Trash2 } from 'lucide-react'
import type { CourseModule, Unit } from '@/lib/api/lms'
import { IconButton } from '@/components/admin/ui'
import { cn } from '@/lib/utils'
import { blockDisplay } from './shared'

type Sensors = ReturnType<typeof useSensors>

const rowClass = 'flex min-h-8 items-center gap-1.5 rounded-lg px-2 py-1 text-[13px] text-ui-muted'
const metaClass = 'shrink-0 text-[11px] tabular-nums text-ui-muted'

/** Left rail of the course editor: pre-test, modules and units (drag to reorder), post-test. */
export function CurriculumTree({
  modules,
  openModules,
  onToggleModule,
  selectedUnitId,
  onSelectUnit,
  onAddModule,
  onEditModule,
  onDeleteModule,
  onAddUnit,
  onModulesReorder,
  onUnitsReorder,
  preCount,
  postCount,
  sensors,
  className,
}: {
  modules: CourseModule[]
  openModules: Record<string, boolean>
  onToggleModule: (id: string) => void
  selectedUnitId: string | null
  onSelectUnit: (moduleId: string, unitId: string) => void
  onAddModule: () => void
  onEditModule: (m: CourseModule) => void
  onDeleteModule: (id: string) => void
  onAddUnit: (moduleId: string) => void
  onModulesReorder: (e: DragEndEvent) => void
  onUnitsReorder: (moduleId: string, e: DragEndEvent) => void
  /** Question counts; null when the assessment does not exist. */
  preCount: number | null
  postCount: number | null
  sensors: Sensors
  className?: string
}) {
  return (
    <nav
      aria-label="Curriculum"
      className={cn('flex flex-col gap-0.5 rounded-[14px] border border-ui-line bg-ui-surface p-2', className)}
    >
      <div className="flex items-center justify-between gap-2 px-2 pb-2 pt-1.5">
        <h2 className="text-sm font-semibold text-ui-text">Curriculum</h2>
        <button
          type="button"
          onClick={onAddModule}
          className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-ui-line bg-ui-surface px-2 text-xs font-semibold text-ui-text transition-colors hover:bg-ui-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ui-brand"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden />
          Module
        </button>
      </div>

      <AssessmentLink type="pre" count={preCount} />

      {modules.length === 0 && <p className="px-2 py-3 text-[13px] text-ui-muted">No modules yet.</p>}

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onModulesReorder}>
        <SortableContext items={modules.map((m) => m.id)} strategy={verticalListSortingStrategy}>
          {modules.map((mod) => (
            <TreeModule
              key={mod.id}
              module={mod}
              open={!!openModules[mod.id]}
              onToggle={() => onToggleModule(mod.id)}
              onEdit={() => onEditModule(mod)}
              onDelete={() => onDeleteModule(mod.id)}
              onAddUnit={() => onAddUnit(mod.id)}
              selectedUnitId={selectedUnitId}
              onSelectUnit={(uid) => onSelectUnit(mod.id, uid)}
              onUnitsReorder={(e) => onUnitsReorder(mod.id, e)}
              sensors={sensors}
            />
          ))}
        </SortableContext>
      </DndContext>

      <AssessmentLink type="post" count={postCount} />
    </nav>
  )
}

function AssessmentLink({ type, count }: { type: 'pre' | 'post'; count: number | null }) {
  const Icon = type === 'pre' ? ClipboardCheck : FileCheck2
  return (
    <a
      href={`#assessment-${type}`}
      className={cn(rowClass, 'hover:bg-ui-surface-2 hover:text-ui-text focus-visible:outline-2 focus-visible:outline-ui-brand')}
    >
      <Icon className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden />
      <span className="min-w-0 flex-1 truncate">{type === 'pre' ? 'Pre-test' : 'Post-test'}</span>
      <span className={metaClass}>{count === null ? 'None' : `${count} q`}</span>
    </a>
  )
}

function DragHandle({ label, ...props }: { label: string } & React.ComponentPropsWithoutRef<'button'>) {
  return (
    <button
      type="button"
      aria-label={label}
      title="Drag to reorder"
      className="inline-flex h-6 w-4 shrink-0 cursor-grab items-center justify-center rounded text-ui-muted hover:text-ui-text active:cursor-grabbing focus-visible:outline-2 focus-visible:outline-ui-brand"
      {...props}
    >
      <GripVertical className="h-3.5 w-3.5" aria-hidden />
    </button>
  )
}

function TreeModule({
  module: mod,
  open,
  onToggle,
  onEdit,
  onDelete,
  onAddUnit,
  selectedUnitId,
  onSelectUnit,
  onUnitsReorder,
  sensors,
}: {
  module: CourseModule
  open: boolean
  onToggle: () => void
  onEdit: () => void
  onDelete: () => void
  onAddUnit: () => void
  selectedUnitId: string | null
  onSelectUnit: (unitId: string) => void
  onUnitsReorder: (e: DragEndEvent) => void
  sensors: Sensors
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: mod.id })
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.6 : 1 }
  const n = mod.units.length

  return (
    <div ref={setNodeRef} style={style} className="flex flex-col gap-0.5">
      <div className={cn(rowClass, 'group/mod pr-1 hover:bg-ui-surface-2')}>
        <DragHandle label={`Reorder module ${mod.title}`} {...attributes} {...listeners} />
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-center gap-1.5 text-left font-semibold text-ui-text focus-visible:outline-2 focus-visible:outline-ui-brand"
        >
          {open ? (
            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-ui-muted" aria-hidden />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-ui-muted" aria-hidden />
          )}
          <span className="truncate">{mod.title}</span>
        </button>
        <span className={cn(metaClass, 'lg:group-hover/mod:hidden lg:group-focus-within/mod:hidden')}>
          {n} {n === 1 ? 'unit' : 'units'}
        </span>
        <span className="flex lg:hidden lg:group-hover/mod:flex lg:group-focus-within/mod:flex">
          <IconButton label={`Edit module ${mod.title}`} icon={Pencil} onClick={onEdit} className="h-6 w-6" />
          <IconButton
            label={`Delete module ${mod.title}`}
            icon={Trash2}
            tone="danger"
            onClick={onDelete}
            className="h-6 w-6"
          />
        </span>
      </div>

      {open && (
        <>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onUnitsReorder}>
            <SortableContext items={mod.units.map((u) => u.id)} strategy={verticalListSortingStrategy}>
              {mod.units.map((u, i) => (
                <TreeUnit
                  key={u.id}
                  unit={u}
                  index={i}
                  selected={u.id === selectedUnitId}
                  onSelect={() => onSelectUnit(u.id)}
                />
              ))}
            </SortableContext>
          </DndContext>
          <button
            type="button"
            onClick={onAddUnit}
            className={cn(
              rowClass,
              'pl-7 font-medium text-ui-brand-text hover:bg-ui-surface-2 focus-visible:outline-2 focus-visible:outline-ui-brand',
            )}
          >
            <Plus className="h-4 w-4 shrink-0" aria-hidden />
            <span className="text-left">Add unit</span>
          </button>
        </>
      )}
    </div>
  )
}

function TreeUnit({
  unit,
  index,
  selected,
  onSelect,
}: {
  unit: Unit
  index: number
  selected: boolean
  onSelect: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: unit.id })
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }

  return (
    <div ref={setNodeRef} style={style} className="flex flex-col gap-0.5">
      <div
        className={cn(
          rowClass,
          'pl-6',
          selected ? 'bg-ui-brand-soft font-semibold text-ui-brand-text' : 'hover:bg-ui-surface-2 hover:text-ui-text',
        )}
      >
        <DragHandle label={`Reorder unit ${unit.title}`} {...attributes} {...listeners} />
        <button
          type="button"
          onClick={onSelect}
          aria-current={selected ? 'true' : undefined}
          title={unit.title}
          className="min-w-0 flex-1 truncate text-left focus-visible:outline-2 focus-visible:outline-ui-brand"
        >
          {index + 1}. {unit.title}
        </button>
        <span className={cn(metaClass, selected && 'text-ui-brand-text')} title={`${unit.blocks.length} learning blocks`}>
          {unit.blocks.length}
        </span>
      </div>
      {selected &&
        unit.blocks.map((b) => {
          const display = blockDisplay(b)
          const Icon = display.icon
          return (
            <a
              key={b.id}
              href={`#block-${b.id}`}
              className={cn(
                rowClass,
                'min-h-7 pl-[50px] text-[12.5px] hover:bg-ui-surface-2 hover:text-ui-text focus-visible:outline-2 focus-visible:outline-ui-brand',
              )}
            >
              <Icon className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} aria-hidden />
              <span className="min-w-0 flex-1 truncate">{b.title || display.label}</span>
            </a>
          )
        })}
    </div>
  )
}
