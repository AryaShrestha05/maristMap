import type { Status } from './plan'

/** How each course status reads in the UI. */
export const STATUS_LABEL: Record<Status, string> = {
  taken: 'Taken',
  available: 'Can take',
  check: 'Check requirement',
  locked: 'Prerequisites missing'
}
