'use client'

import { useState } from 'react'
import { Check, Loader2 } from 'lucide-react'
import type { CourseWithContent } from '@/lib/api/lms'
import type { MediaFile } from '@/lib/api/media'
import { COURSE_TOPICS, type CourseTopic } from '@/lib/api/redesign'
import { Switch } from '@/components/admin/ui'
import MediaPicker from '@/components/admin/MediaPicker'
import { BrowseButton } from './BlockEditor'
import { FormField, fieldClass, selectFieldClass, textareaClass } from './shared'
import { API_BASE } from '@/lib/api'

const SERVER_URL = API_BASE

/** The course as the editor holds it; `category` (topic) may be absent on older API responses. */
export type EditableCourse = CourseWithContent & { category?: CourseTopic | null }

/**
 * Course settings card. Fields save when focus leaves the card (`onSave`);
 * the topic saves on its own as soon as it changes (`onTopicChange`).
 */
export function CourseSettingsPanel({
  course,
  onChange,
  onSave,
  onTopicChange,
  topicSaving,
}: {
  course: EditableCourse
  onChange: (patch: Partial<EditableCourse>) => void
  onSave: () => void
  onTopicChange: (topic: CourseTopic | null) => void
  topicSaving: boolean
}) {
  const [coverPickerOpen, setCoverPickerOpen] = useState(false)

  function handleBlur(e: React.FocusEvent<HTMLElement>) {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
      onSave()
    }
  }

  return (
    <section
      aria-labelledby="course-settings-heading"
      className="flex flex-col gap-3 rounded-[14px] border border-ui-line bg-ui-surface p-4"
      onBlur={handleBlur}
    >
      <div>
        <h2 id="course-settings-heading" className="text-[15px] font-semibold text-ui-text">
          Course settings
        </h2>
        <p className="mt-0.5 flex items-center gap-1 text-xs text-ui-muted">
          <Check className="h-3.5 w-3.5" aria-hidden />
          Changes save automatically
        </p>
      </div>

      <FormField label="Title">
        <input value={course.title} onChange={(e) => onChange({ title: e.target.value })} className={fieldClass} />
      </FormField>
      <FormField label="Description">
        <textarea
          value={course.description ?? ''}
          onChange={(e) => onChange({ description: e.target.value })}
          rows={3}
          placeholder="No description yet. Tell learners what this course covers."
          className={textareaClass}
        />
      </FormField>
      <FormField label="Cover image URL" asDiv>
        <div className="flex gap-1.5">
          <input
            aria-label="Cover image URL"
            value={course.cover ?? ''}
            onChange={(e) => onChange({ cover: e.target.value })}
            className={fieldClass}
            placeholder="Paste an image URL or browse"
          />
          <BrowseButton onClick={() => setCoverPickerOpen(true)} className="[&>svg]:hidden" />
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
      </FormField>
      <FormField label="Topic" hint="Groups the course in the learner catalog. Saves straight away.">
        <span className="relative block">
          <select
            value={course.category ?? ''}
            disabled={topicSaving}
            onChange={(e) => onTopicChange((e.target.value || null) as CourseTopic | null)}
            className={selectFieldClass}
          >
            <option value="">No topic</option>
            {COURSE_TOPICS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          {topicSaving && (
            <Loader2
              className="absolute right-8 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-ui-muted"
              aria-label="Saving topic"
            />
          )}
        </span>
      </FormField>
      <FormField label="Difficulty">
        <select
          value={course.difficulty}
          onChange={(e) => onChange({ difficulty: e.target.value as CourseWithContent['difficulty'] })}
          className={selectFieldClass}
        >
          <option>Beginner</option>
          <option>Intermediate</option>
          <option>Advanced</option>
        </select>
      </FormField>
      <FormField label="Points awarded per unit" hint="Awarded automatically when a member completes a unit.">
        <input
          type="number"
          min={0}
          value={course.pointsPerUnit}
          onChange={(e) => onChange({ pointsPerUnit: Number(e.target.value) })}
          className={fieldClass}
        />
      </FormField>
      <div className="flex items-center justify-between gap-2.5 rounded-[10px] border border-ui-line px-3 py-2.5">
        <span className="text-[13px] font-semibold text-ui-text">Enable certificate</span>
        <Switch
          label="Enable certificate"
          checked={course.enableCertificate}
          onChange={(v) => onChange({ enableCertificate: v })}
        />
      </div>
    </section>
  )
}

export function CourseStats({ modules, units, blocks }: { modules: number; units: number; blocks: number }) {
  return (
    <section aria-labelledby="course-stats-heading" className="rounded-[14px] border border-ui-line bg-ui-surface p-4">
      <h2 id="course-stats-heading" className="mb-2.5 text-[15px] font-semibold text-ui-text">
        Statistics
      </h2>
      <dl className="grid grid-cols-3 gap-2 text-center">
        {[
          ['Modules', modules],
          ['Units', units],
          ['Blocks', blocks],
        ].map(([label, value]) => (
          <div key={label} className="flex flex-col-reverse rounded-[10px] bg-ui-surface-2 px-1 py-2.5">
            <dt className="text-xs text-ui-muted">{label}</dt>
            <dd className="text-xl font-semibold tabular-nums text-ui-text">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
