import AbstractService from './abstractService'
import ListModel, { type IList } from '@/models/list'
import TaskService from './task'
import {formatISO} from 'date-fns'
import {colorFromHex} from '@/helpers/color/colorFromHex'

export default class ListService extends AbstractService<IList> {
	constructor() {
		super({
			create: '/namespaces/{namespaceId}/lists',
			get: '/lists/{id}',
			getAll: '/lists',
			update: '/lists/{id}',
			delete: '/lists/{id}',
		})
	}

	processModel(model) {
		model.created = formatISO(new Date(model.created))
		model.updated = formatISO(new Date(model.updated))
		return model
	}

	modelFactory(data) {
		return new ListModel(data)
	}

	beforeUpdate(model) {
		if(typeof model.tasks !== 'undefined') {
			const taskService = new TaskService()
			model.tasks = model.tasks.map(task => {
				return taskService.beforeUpdate(task)
			})
		}
		
		if(typeof model.hexColor !== 'undefined') {
			model.hexColor = colorFromHex(model.hexColor)
		}
		
		return model
	}

	beforeCreate(list) {
		list.hexColor = colorFromHex(list.hexColor)
		return list
	}

	async background(list) {
		if (list.background === null) {
			return ''
		}

		const response = await this.http({
			url: `/lists/${list.id}/background`,
			method: 'GET',
			responseType: 'blob',
		})
		return window.URL.createObjectURL(new Blob([response.data]))
	}

	async removeBackground(list) {
		const cancel = this.setLoading()

		try {
			const response = await this.http.delete(`/lists/${list.id}/background`, list)
			return response.data
		} finally {
			cancel()
		}
	}
}