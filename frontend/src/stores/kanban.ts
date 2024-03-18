import {computed, readonly, ref} from 'vue'
import {acceptHMRUpdate, defineStore} from 'pinia'
import {klona} from 'klona/lite'

import {findById, findIndexById} from '@/helpers/utils'
import {i18n} from '@/i18n'
import {success} from '@/message'

import BucketService from '@/services/bucket'
import TaskCollectionService, {type TaskFilterParams} from '@/services/taskCollection'

import {setModuleLoading} from '@/stores/helper'

import type {ITask} from '@/modelTypes/ITask'
import type {IProject} from '@/modelTypes/IProject'
import type {IBucket} from '@/modelTypes/IBucket'
import {useAuthStore} from '@/stores/auth'
import type {IProjectView} from '@/modelTypes/IProjectView'

const TASKS_PER_BUCKET = 25

function getTaskIndicesById(buckets: IBucket[], taskId: ITask['id']) {
	let taskIndex
	const bucketIndex = buckets.findIndex(({tasks}) => {
		taskIndex = findIndexById(tasks, taskId)
		return taskIndex !== -1
	})

	return {
		bucketIndex: bucketIndex !== -1 ? bucketIndex : null,
		taskIndex: taskIndex !== -1 ? taskIndex : null,
	}
}

const addTaskToBucketAndSort = (buckets: IBucket[], task: ITask) => {
	const bucketIndex = findIndexById(buckets, task.bucketId)
	if (typeof buckets[bucketIndex] === 'undefined') {
		return
	}
	buckets[bucketIndex].tasks.push(task)
	buckets[bucketIndex].tasks.sort((a, b) => a.kanbanPosition > b.kanbanPosition ? 1 : -1)
}

/**
 * This store is intended to hold the currently active kanban view.
 * It should hold only the current buckets.
 */
export const useKanbanStore = defineStore('kanban', () => {
	const authStore = useAuthStore()

	const buckets = ref<IBucket[]>([])
	const projectId = ref<IProject['id']>(0)
	const bucketLoading = ref<{ [id: IBucket['id']]: boolean }>({})
	const taskPagesPerBucket = ref<{ [id: IBucket['id']]: number }>({})
	const allTasksLoadedForBucket = ref<{ [id: IBucket['id']]: boolean }>({})
	const isLoading = ref(false)

	const getBucketById = computed(() => (bucketId: IBucket['id']): IBucket | undefined => findById(buckets.value, bucketId))
	const getTaskById = computed(() => {
		return (id: ITask['id']) => {
			const {bucketIndex, taskIndex} = getTaskIndicesById(buckets.value, id)

			return {
				bucketIndex,
				taskIndex,
				task: bucketIndex !== null && taskIndex !== null && buckets.value[bucketIndex]?.tasks?.[taskIndex] || null,
			}
		}
	})

	function setIsLoading(newIsLoading: boolean) {
		isLoading.value = newIsLoading
	}

	function setProjectId(newProjectId: IProject['id']) {
		projectId.value = Number(newProjectId)
	}

	function setBuckets(newBuckets: IBucket[]) {
		buckets.value = newBuckets
		newBuckets.forEach(b => {
			taskPagesPerBucket.value[b.id] = 1
			allTasksLoadedForBucket.value[b.id] = false
		})
	}

	function addBucket(bucket: IBucket) {
		buckets.value.push(bucket)
	}

	function removeBucket(newBucket: IBucket) {
		const bucketIndex = findIndexById(buckets.value, newBucket.id)
		buckets.value.splice(bucketIndex, 1)
	}

	function setBucketById(newBucket: IBucket) {
		const bucketIndex = findIndexById(buckets.value, newBucket.id)
		buckets.value[bucketIndex] = newBucket
	}

	function setBucketByIndex(
		bucketIndex: number,
		bucket: IBucket,
	) {
		buckets.value[bucketIndex] = bucket
	}

	function setTaskInBucketByIndex({
										bucketIndex,
										taskIndex,
										task,
									}: {
		bucketIndex: number,
		taskIndex: number,
		task: ITask
	}) {
		const bucket = buckets.value[bucketIndex]
		bucket.tasks[taskIndex] = task
		buckets.value[bucketIndex] = bucket
	}

	function setTaskInBucket(task: ITask) {
		// If this gets invoked without any tasks actually loaded, we can save the hassle of finding the task
		if (buckets.value.length === 0) {
			return
		}

		let found = false

		const findAndUpdate = b => {
			for (const t in buckets.value[b].tasks) {
				if (buckets.value[b].tasks[t].id === task.id) {
					const bucket = buckets.value[b]
					bucket.tasks[t] = task

					if (bucket.id !== task.bucketId) {
						bucket.tasks.splice(t, 1)
						addTaskToBucketAndSort(buckets.value, task)
					}

					buckets.value[b] = bucket

					found = true
					return
				}
			}
		}

		for (const b in buckets.value) {
			if (buckets.value[b].id === task.bucketId) {
				findAndUpdate(b)
				if (found) {
					return
				}
			}
		}

		for (const b in buckets.value) {
			findAndUpdate(b)
			if (found) {
				return
			}
		}
	}

	function addTaskToBucket(task: ITask) {
		const bucketIndex = findIndexById(buckets.value, task.bucketId)
		const oldBucket = buckets.value[bucketIndex]
		const newBucket = {
			...oldBucket,
			count: oldBucket.count + 1,
			tasks: [
				...oldBucket.tasks,
				task,
			],
		}
		buckets.value[bucketIndex] = newBucket
	}

	function addTasksToBucket({tasks, bucketId}: {
		tasks: ITask[];
		bucketId: IBucket['id'];
	}) {
		const bucketIndex = findIndexById(buckets.value, bucketId)
		const oldBucket = buckets.value[bucketIndex]
		const newBucket = {
			...oldBucket,
			tasks: [
				...oldBucket.tasks,
				...tasks,
			],
		}
		buckets.value[bucketIndex] = newBucket
	}

	function removeTaskInBucket(task: ITask) {
		// If this gets invoked without any tasks actually loaded, we can save the hassle of finding the task
		if (buckets.value.length === 0) {
			return
		}

		const {bucketIndex, taskIndex} = getTaskIndicesById(buckets.value, task.id)

		if (
			bucketIndex === null ||
			buckets.value[bucketIndex]?.id !== task.bucketId ||
			taskIndex === null ||
			(buckets.value[bucketIndex]?.tasks[taskIndex]?.id !== task.id)
		) {
			return
		}

		buckets.value[bucketIndex].tasks.splice(taskIndex, 1)
		buckets.value[bucketIndex].count--
	}

	function setBucketLoading({bucketId, loading}: { bucketId: IBucket['id'], loading: boolean }) {
		bucketLoading.value[bucketId] = loading
	}

	function setTasksLoadedForBucketPage({bucketId, page}: { bucketId: IBucket['id'], page: number }) {
		taskPagesPerBucket.value[bucketId] = page
	}

	function setAllTasksLoadedForBucket(bucketId: IBucket['id']) {
		allTasksLoadedForBucket.value[bucketId] = true
	}

	async function loadBucketsForProject(projectId: IProject['id'], viewId: IProjectView['id'], params) {
		const cancel = setModuleLoading(setIsLoading)

		// Clear everything to prevent having old buckets in the project if loading the buckets from this project takes a few moments
		setBuckets([])

		const taskCollectionService = new TaskCollectionService()
		try {
			const newBuckets = await taskCollectionService.getAll({projectId, viewId}, {
				...params,
				per_page: TASKS_PER_BUCKET,
			})
			setBuckets(newBuckets)
			setProjectId(projectId)
			return newBuckets
		} finally {
			cancel()
		}
	}

	async function loadNextTasksForBucket(
		projectId: IProject['id'],
		viewId: IProjectView['id'],
		ps: TaskFilterParams,
		bucketId: IBucket['id'],
	) {
		const isLoading = bucketLoading.value[bucketId] ?? false
		if (isLoading) {
			return
		}

		const page = (taskPagesPerBucket.value[bucketId] ?? 1) + 1

		const alreadyLoaded = allTasksLoadedForBucket.value[bucketId] ?? false
		if (alreadyLoaded) {
			return
		}

		const cancel = setModuleLoading(setIsLoading)
		setBucketLoading({bucketId: bucketId, loading: true})

		const params: TaskFilterParams = JSON.parse(JSON.stringify(ps))

		params.sort_by = ['kanban_position']
		params.order_by = ['asc']
		params.filter = `${params.filter === '' ? '' : params.filter + ' && '}bucket_id = ${bucketId}`
		params.filter_timezone = authStore.settings.timezone
		params.per_page = TASKS_PER_BUCKET

		const taskService = new TaskCollectionService()
		try {
			const tasks = await taskService.getAll({projectId, viewId}, params, page)
			addTasksToBucket({tasks, bucketId: bucketId})
			setTasksLoadedForBucketPage({bucketId, page})
			if (taskService.totalPages <= page) {
				setAllTasksLoadedForBucket(bucketId)
			}
			return tasks
		} finally {
			cancel()
			setBucketLoading({bucketId, loading: false})
		}
	}

	async function createBucket(bucket: IBucket) {
		const cancel = setModuleLoading(setIsLoading)

		const bucketService = new BucketService()
		try {
			const createdBucket = await bucketService.create(bucket)
			addBucket(createdBucket)
			return createdBucket
		} finally {
			cancel()
		}
	}

	async function deleteBucket({bucket, params}: { bucket: IBucket, params }) {
		const cancel = setModuleLoading(setIsLoading)

		const bucketService = new BucketService()
		try {
			const response = await bucketService.delete(bucket)
			removeBucket(bucket)
			// We reload all buckets because tasks are being moved from the deleted bucket
			loadBucketsForProject(bucket.projectId, bucket.projectViewId, params)
			return response
		} finally {
			cancel()
		}
	}

	async function updateBucket(updatedBucketData: Partial<IBucket>) {
		const cancel = setModuleLoading(setIsLoading)

		const bucketIndex = findIndexById(buckets.value, updatedBucketData.id)
		const oldBucket = klona(buckets.value[bucketIndex])

		const updatedBucket = {
			...oldBucket,
			...updatedBucketData,
		}

		setBucketByIndex(bucketIndex, updatedBucket)

		const bucketService = new BucketService()
		try {
			const returnedBucket = await bucketService.update(updatedBucket)
			setBucketByIndex(bucketIndex, returnedBucket)
			return returnedBucket
		} catch (e) {
			// restore original state
			setBucketByIndex(bucketIndex, oldBucket)

			throw e
		} finally {
			cancel()
		}
	}

	return {
		buckets,
		isLoading: readonly(isLoading),

		getBucketById,
		getTaskById,

		setBuckets,
		setBucketById,
		setTaskInBucketByIndex,
		setTaskInBucket,
		addTaskToBucket,
		removeTaskInBucket,
		loadBucketsForProject,
		loadNextTasksForBucket,
		createBucket,
		deleteBucket,
		updateBucket,
	}
})

// support hot reloading
if (import.meta.hot) {
	import.meta.hot.accept(acceptHMRUpdate(useKanbanStore, import.meta.hot))
}