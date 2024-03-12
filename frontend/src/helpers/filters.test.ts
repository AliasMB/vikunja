import {describe, expect, it} from 'vitest'
import {transformFilterStringForApi, transformFilterStringFromApi} from '@/helpers/filters'

const nullTitleToIdResolver = (title: string) => null
const nullIdToTitleResolver = (id: number) => null
describe('Filter Transformation', () => {

	const fieldCases = {
		'done': 'done',
		'priority': 'priority',
		'percentDone': 'percent_done',
		'dueDate': 'due_date',
		'startDate': 'start_date',
		'endDate': 'end_date',
		'doneAt': 'done_at',
		'reminders': 'reminders',
		'assignees': 'assignees',
		'labels': 'labels',
	}

	describe('For API', () => {
		for (const c in fieldCases) {
			it('should transform all filter params for ' + c + ' to snake_case', () => {
				const transformed = transformFilterStringForApi(c + ' = ipsum', nullTitleToIdResolver, nullTitleToIdResolver)

				expect(transformed).toBe(fieldCases[c] + ' = ipsum')
			})
		}

		it('should correctly resolve labels', () => {
			const transformed = transformFilterStringForApi(
				'labels = lorem',
				(title: string) => 1,
				nullTitleToIdResolver,
			)

			expect(transformed).toBe('labels = 1')
		})

		const multipleDummyResolver = (title: string) => {
			switch (title) {
				case 'lorem':
					return 1
				case 'ipsum':
					return 2
				default:
					return null
			}
		}

		it('should correctly resolve multiple labels', () => {
			const transformed = transformFilterStringForApi(
				'labels = lorem && dueDate = now && labels = ipsum',
				multipleDummyResolver,
				nullTitleToIdResolver,
			)

			expect(transformed).toBe('labels = 1 && due_date = now && labels = 2')
		})

		it('should correctly resolve multiple labels with an in clause', () => {
			const transformed = transformFilterStringForApi(
				'labels in lorem, ipsum && dueDate = now',
				multipleDummyResolver,
				nullTitleToIdResolver,
			)

			expect(transformed).toBe('labels in 1, 2 && due_date = now')
		})

		it('should correctly resolve projects', () => {
			const transformed = transformFilterStringForApi(
				'project = lorem',
				nullTitleToIdResolver,
				(title: string) => 1,
			)

			expect(transformed).toBe('project = 1')
		})

		it('should correctly resolve multiple projects', () => {
			const transformed = transformFilterStringForApi(
				'project = lorem && dueDate = now || project = ipsum',
				nullTitleToIdResolver,
				multipleDummyResolver,
			)

			expect(transformed).toBe('project = 1 && due_date = now || project = 2')
		})

		it('should correctly resolve multiple projects with in', () => {
			const transformed = transformFilterStringForApi(
				'project in lorem, ipsum',
				nullTitleToIdResolver,
				multipleDummyResolver,
			)

			expect(transformed).toBe('project in 1, 2')
		})

		it('should resolve projects at the correct position', () => {
			const transformed = transformFilterStringForApi(
				'project = pr',
				nullTitleToIdResolver,
				(title: string) => 1,
			)

			expect(transformed).toBe('project = 1')
		})
	})

	describe('To API', () => {
		for (const c in fieldCases) {
			it('should transform all filter params for ' + c + ' to snake_case', () => {
				const transformed = transformFilterStringFromApi(fieldCases[c] + ' = ipsum', nullTitleToIdResolver, nullTitleToIdResolver)

				expect(transformed).toBe(c + ' = ipsum')
			})
		}

		it('should correctly resolve labels', () => {
			const transformed = transformFilterStringFromApi(
				'labels = 1',
				(id: number) => 'lorem',
				nullIdToTitleResolver,
			)

			expect(transformed).toBe('labels = lorem')
		})

		const multipleIdToTitleResolver = (id: number) => {
			switch (id) {
				case 1:
					return 'lorem'
				case 2:
					return 'ipsum'
				default:
					return null
			}
		}

		it('should correctly resolve multiple labels', () => {
			const transformed = transformFilterStringFromApi(
				'labels = 1 && due_date = now && labels = 2',
				multipleIdToTitleResolver,
				nullIdToTitleResolver,
			)

			expect(transformed).toBe('labels = lorem && dueDate = now && labels = ipsum')
		})

		it('should correctly resolve multiple labels in', () => {
			const transformed = transformFilterStringFromApi(
				'labels in 1, 2',
				multipleIdToTitleResolver,
				nullIdToTitleResolver,
			)

			expect(transformed).toBe('labels in lorem, ipsum')
		})

		it('should correctly resolve projects', () => {
			const transformed = transformFilterStringFromApi(
				'project = 1',
				nullIdToTitleResolver,
				(id: number) => 'lorem',
			)

			expect(transformed).toBe('project = lorem')
		})

		it('should correctly resolve multiple projects', () => {
			const transformed = transformFilterStringFromApi(
				'project = 1 && due_date = now || project = 2',
				nullIdToTitleResolver,
				multipleIdToTitleResolver,
			)

			expect(transformed).toBe('project = lorem && dueDate = now || project = ipsum')
		})

		it('should correctly resolve multiple projects in', () => {
			const transformed = transformFilterStringFromApi(
				'project in 1, 2',
				nullIdToTitleResolver,
				multipleIdToTitleResolver,
			)

			expect(transformed).toBe('project in lorem, ipsum')
		})
	})
})
